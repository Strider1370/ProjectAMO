// 경로 단면 로더 — KIM 압력면 단면 + KTG 저고도 난류를 한 번에 로드한다.
// /api/briefing/cross-section 라우트와 route-briefing enroute 모델 요약이 공유한다.
// (이전에 server.js에 두 벌로 중복돼 있던 로딩 로직을 통합한 것.)
import config from '../config.js'
import { buildCrossSection, buildKtgCrossSection, gridIndexFor } from './cross-section-sampler.js'
import { buildRouteAxis } from './route-axis.js'
import { selectNearestForecastHour } from '../processors/kim-forecast-hour.js'
import {
  KIM_NWP_LEVELS,
  calcKFipLiteScore,
  decodeComponent,
  dewpointCFromTempRh,
  filterKimNwpIndexForVariables,
  icingGradeFor,
} from '../processors/kim-nwp-model.js'
import { readKimNwpGrid, readKimNwpIndex, readKimNwpLatest } from '../processors/kim-nwp-store.js'
import { readKtgLatest, readKtgIndex, readKtgCoords, readKtgGridSafe } from '../processors/ktg-store.js'

const KIM_ICING_REQUIRED_VARIABLES = ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']

// 경로 샘플(최대 2500개)이 실제로 짚는 격자칸만 계산한다. 전국 격자(수만 칸) 전체를
// 계산했다가 샘플만 뽑아 쓰는 이전 방식은 계산량의 대부분을 버리는 구조였다.
function routeGridIndices(gridMeta, samples) {
  const indices = new Set()
  for (const s of samples) {
    const idx = gridIndexFor(gridMeta, s.lon, s.lat)
    if (idx != null) indices.add(idx)
  }
  return indices
}

function decodeAt(variable, idx) {
  return decodeComponent([variable.values[idx]], variable)[0]
}

function sparseDecode(size, indices, variable) {
  const out = new Array(size).fill(Number.NaN)
  for (const idx of indices) out[idx] = decodeAt(variable, idx)
  return out
}

// f.spread(온도-이슬점차, °C)만 필요하므로 cloudPotential(%) 점수 계산은 생략한다.
function sparseSpread(size, indices, tempVar, rhVar) {
  const out = new Array(size).fill(Number.NaN)
  for (const idx of indices) {
    const tempK = decodeAt(tempVar, idx)
    const tdC = dewpointCFromTempRh(tempK, decodeAt(rhVar, idx))
    out[idx] = Number.isFinite(tdC) ? tempK - 273.15 - tdC : Number.NaN
  }
  return out
}

function sparseIcingGrade(size, indices, variables) {
  const out = new Array(size).fill(null)
  for (const idx of indices) {
    const values = {
      tempC: decodeAt(variables.T, idx) - 273.15,
      rhLiq: decodeAt(variables.rh_liq, idx),
      w: decodeAt(variables.w, idx),
      tqc: decodeAt(variables.tqc, idx),
      tqi: decodeAt(variables.tqi, idx),
      tqr: decodeAt(variables.tqr, idx),
      tqs: decodeAt(variables.tqs, idx),
      cld: decodeAt(variables.cld, idx),
    }
    if (!Object.values(values).every(Number.isFinite)) continue
    const { score, mCl, bFrz } = calcKFipLiteScore(values)
    out[idx] = icingGradeFor(score, { mCl, bFrz })
  }
  return out
}

// 경로의 KIM/KTG 단면 필드를 로드한다. KIM run이 없으면 { available: false }.
export function loadRouteCrossSection({ root, routeGeometry, body = {} }) {
  const latest = readKimNwpLatest(root)
  if (!latest?.latestRun) return { available: false, reason: 'kim run unavailable' }
  const index = readKimNwpIndex(root)
  const tmfc = String(body.tmfc || latest.latestRun)
  // 압력면 바람(u/v) 데이터가 실제로 있는 시각만 후보로 삼는다.
  const pressureWindIndex = filterKimNwpIndexForVariables(index, ['u', 'v'])
  const availableHours = pressureWindIndex?.times?.filter((t) => {
    const pressureLevels = (pressureWindIndex?.levels ?? []).filter((l) => l.kind === 'pressure')
    return pressureLevels.some((l) => pressureWindIndex.availability?.[l.id]?.[String(t.hf)])
  }).map((t) => t.hf) ?? []
  const candidateHours = availableHours.length > 0 ? availableHours : (config.kim_nwp?.forecast_hours || [0, 3, 6, 9, 12])
  const hf = Number.isFinite(Number(body.hf)) ? Number(body.hf) : selectNearestForecastHour({ tmfc, candidateHours })

  const axis = buildRouteAxis(routeGeometry, body.sampleSpacingMeters ?? 250)

  const loadLevel = (levelId) => {
    const level = KIM_NWP_LEVELS.find((l) => l.id === levelId)
    if (!level || level.kind !== 'pressure') return null
    let grid
    try {
      grid = readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc, hf, levelId })
    } catch { return null }
    if (!grid) return null
    const out = { pressure: level.value, grid: grid.grid }
    const size = (grid.grid?.nx || 0) * (grid.grid?.ny || 0)
    const indices = routeGridIndices(grid.grid, axis.samples)
    if (grid.variables?.hgt) out.hgt = sparseDecode(size, indices, grid.variables.hgt)
    if (grid.variables?.T) out.T = sparseDecode(size, indices, grid.variables.T)
    if (grid.variables?.u && grid.variables?.v) {
      out.u = sparseDecode(size, indices, grid.variables.u)
      out.v = sparseDecode(size, indices, grid.variables.v)
    }
    if (grid.variables?.T && grid.variables?.rh) {
      out.spread = sparseSpread(size, indices, grid.variables.T, grid.variables.rh)
    }
    if (KIM_ICING_REQUIRED_VARIABLES.every((n) => grid.variables?.[n])) {
      out.icingGrade = sparseIcingGrade(size, indices, grid.variables)
    }
    return out
  }

  const crossSection = buildCrossSection({
    axis,
    run: { tmfc, hf, validTime: latest.validTime ?? null },
    levelIds: KIM_NWP_LEVELS.filter((l) => l.kind === 'pressure').map((l) => l.id),
    loadLevel,
  })

  // KTG 저고도 난류 — 단면의 나머지(바람·기온)와 같은 예보시간(hf)으로 정합. 해당 hf 미수집이면 nearest 폴백.
  const ktgLatest = readKtgLatest(root)
  const ktgIndex = ktgLatest ? readKtgIndex(root) : null
  const ktgHours = ktgIndex?.hours ?? (ktgLatest ? [{ hf: ktgLatest.hf, validTime: ktgLatest.validTime }] : [])
  const ktgMatch = ktgHours.find((h) => h.hf === hf)
  const ktgHf = ktgMatch ? ktgMatch.hf : ktgLatest?.hf
  const ktgValidTime = ktgMatch ? ktgMatch.validTime : ktgLatest?.validTime
  const ktgCoords = ktgLatest ? readKtgCoords({ root, tmfc: ktgLatest.tmfc, hf: ktgHf }) : null
  const turbulence = buildKtgCrossSection({
    axis,
    coords: ktgCoords,
    altLevelsFt: ktgIndex?.altLevelsFt ?? [],
    loadAltGrid: (altFt) => readKtgGridSafe({ root, tmfc: ktgLatest?.tmfc, hf: ktgHf, altFt }),
  })
  if (ktgLatest) turbulence.run = { tmfc: ktgLatest.tmfc, hf: ktgHf, validTime: ktgValidTime }

  return { available: true, crossSection, turbulence, totalDistanceNm: axis.totalDistanceNm }
}
