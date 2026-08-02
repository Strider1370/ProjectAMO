// 경로 단면 로더 — KIM 압력면 단면 + KTG 저고도 난류를 한 번에 로드한다.
// /api/briefing/cross-section 라우트와 route-briefing enroute 모델 요약이 공유한다.
// (이전에 server.js에 두 벌로 중복돼 있던 로딩 로직을 통합한 것.)
import config from '../config.js'
import { buildCrossSection, buildKtgCrossSection, gridIndexFor } from './cross-section-sampler.js'
import { buildRouteAxis } from './route-axis.js'
import { selectClosestForecastTime } from '../processors/kim-forecast-hour.js'
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
const MAX_CACHED_ROUTE_GRIDS = 32 // 21 KIM pressure levels + 10 KTG levels + KTG coordinates; measured below 64 MiB in production.

const routeGridCache = {
  kim: { key: null, grids: new Map(), hits: 0, misses: 0 },
  ktg: { key: null, grids: new Map(), hits: 0, misses: 0 },
}

function cachedGrid(family, bundleKey, gridKey, read) {
  const cache = routeGridCache[family]
  if (cache.key !== bundleKey) {
    cache.key = bundleKey
    cache.grids.clear()
  }
  if (cache.grids.has(gridKey)) {
    cache.hits += 1
    return cache.grids.get(gridKey)
  }
  cache.misses += 1
  const grid = read()
  if (cache.grids.size < MAX_CACHED_ROUTE_GRIDS) cache.grids.set(gridKey, grid)
  return grid
}

export function clearRouteCrossSectionCache() {
  for (const cache of Object.values(routeGridCache)) {
    cache.key = null
    cache.grids.clear()
    cache.hits = 0
    cache.misses = 0
  }
}

export function routeCrossSectionCacheMetrics() {
  return Object.fromEntries(Object.entries(routeGridCache).map(([family, cache]) => [family, {
    hits: cache.hits, misses: cache.misses, retainedGrids: cache.grids.size,
  }]))
}

function decodeAt(variable, idx) {
  return decodeComponent([variable.values[idx]], variable)[0]
}

function sampleLevelValues(grid, samples) {
  return samples.map((sample) => {
    const idx = gridIndexFor(grid.grid, sample.lon, sample.lat)
    const value = { distanceNm: sample.distanceNm }
    if (idx == null) return value
    const { variables } = grid
    if (variables?.hgt) value.hgt = decodeAt(variables.hgt, idx)
    if (variables?.T) value.T = decodeAt(variables.T, idx)
    if (variables?.u) value.u = decodeAt(variables.u, idx)
    if (variables?.v) value.v = decodeAt(variables.v, idx)
    if (variables?.cld) value.cld = decodeAt(variables.cld, idx)
    if (variables?.T && variables?.rh) {
      const tempK = value.T
      const tdC = dewpointCFromTempRh(tempK, decodeAt(variables.rh, idx))
      value.spread = Number.isFinite(tdC) ? tempK - 273.15 - tdC : Number.NaN
    }
    if (KIM_ICING_REQUIRED_VARIABLES.every((name) => variables?.[name])) {
      const icing = {
        tempC: value.T - 273.15,
        rhLiq: decodeAt(variables.rh_liq, idx), w: decodeAt(variables.w, idx),
        tqc: decodeAt(variables.tqc, idx), tqi: decodeAt(variables.tqi, idx),
        tqr: decodeAt(variables.tqr, idx), tqs: decodeAt(variables.tqs, idx), cld: value.cld,
      }
      if (Object.values(icing).every(Number.isFinite)) {
        const { score, mCl, bFrz } = calcKFipLiteScore(icing)
        value.icing = icingGradeFor(score, { mCl, bFrz })
      }
    }
    return value
  })
}

// 경로의 KIM/KTG 단면 필드를 로드한다. KIM run이 없으면 { available: false }.
export function loadRouteCrossSection({ root, routeGeometry, body = {} }) {
  const latest = readKimNwpLatest(root)
  if (!latest?.latestRun) return { available: false, reason: 'kim run unavailable' }
  const index = readKimNwpIndex(root)
  const tmfc = String(body.tmfc || latest.latestRun)
  // 압력면 바람(u/v) 데이터가 실제로 있는 시각만 후보로 삼는다.
  const pressureWindIndex = filterKimNwpIndexForVariables(index, ['u', 'v'])
  const availableTimes = pressureWindIndex?.times?.filter((t) => {
    const pressureLevels = (pressureWindIndex?.levels ?? []).filter((l) => l.kind === 'pressure')
    return pressureLevels.some((l) => pressureWindIndex.availability?.[l.id]?.[String(t.hf)])
  }) ?? []
  const availableHours = availableTimes.map((t) => t.hf)
  const candidateHours = availableHours.length > 0 ? availableHours : (config.kim_nwp?.forecast_hours || [0, 3, 6, 9, 12])
  const candidateTimes = availableTimes.length > 0 ? availableTimes : candidateHours.map((hf) => ({ hf }))
  const requestedHf = body.hf !== '' && body.hf != null && Number.isFinite(Number(body.hf)) ? Number(body.hf) : null
  const etdMs = Date.parse(body.etd)
  const referenceMs = Number.isFinite(etdMs) ? etdMs : Date.parse(body.referenceTime)
  const selectedKimTime = selectClosestForecastTime({
    tmfc,
    targetMs: Number.isFinite(referenceMs) ? referenceMs : Date.now(),
    candidateTimes: requestedHf == null
      ? candidateTimes
      : [candidateTimes.find((time) => Number(time.hf) === requestedHf) ?? { hf: requestedHf }],
  })
  const hf = selectedKimTime?.hf ?? candidateHours[0] ?? 0
  const kimBundleKey = `${root}|${tmfc}|${hf}|${latest.content_hash ?? latest.updated_at ?? ''}`

  const axis = buildRouteAxis(routeGeometry, body.sampleSpacingMeters ?? 250)

  const loadLevel = (levelId) => {
    const level = KIM_NWP_LEVELS.find((l) => l.id === levelId)
    if (!level || level.kind !== 'pressure') return null
    const grid = cachedGrid('kim', kimBundleKey, levelId, () => {
      try { return readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc, hf, levelId }) } catch { return null }
    })
    if (!grid) return null
    return { pressure: level.value, values: sampleLevelValues(grid, axis.samples) }
  }

  const crossSection = buildCrossSection({
    axis,
    run: { tmfc, hf, validTime: selectedKimTime?.validTime ?? null },
    levelIds: KIM_NWP_LEVELS.filter((l) => l.kind === 'pressure').map((l) => l.id),
    loadLevel,
  })

  // KTG run 시각은 KIM과 다를 수 있으므로 같은 hf가 아니라 KIM의 실제 유효시각과 가장 가까운 자료를 고른다.
  const ktgLatest = readKtgLatest(root)
  const ktgIndex = ktgLatest ? readKtgIndex(root) : null
  const ktgHours = ktgIndex?.hours ?? (ktgLatest ? [{ hf: ktgLatest.hf, validTime: ktgLatest.validTime }] : [])
  const kimValidMs = Date.parse(selectedKimTime?.validTime)
  const selectedKtgTime = ktgLatest ? selectClosestForecastTime({
    tmfc: ktgLatest.tmfc,
    targetMs: Number.isFinite(kimValidMs) ? kimValidMs : referenceMs,
    candidateTimes: ktgHours,
  }) : null
  const ktgHf = selectedKtgTime?.hf ?? ktgLatest?.hf
  const ktgValidTime = selectedKtgTime?.validTime ?? ktgLatest?.validTime
  const ktgBundleKey = ktgLatest && `${root}|${ktgLatest.tmfc}|${ktgHf}|${ktgLatest.updated_at ?? ktgIndex?.fetched_at ?? ''}`
  const ktgCoords = ktgLatest ? cachedGrid('ktg', ktgBundleKey, 'coords', () =>
    readKtgCoords({ root, tmfc: ktgLatest.tmfc, hf: ktgHf })) : null
  const turbulence = buildKtgCrossSection({
    axis,
    coords: ktgCoords,
    altLevelsFt: ktgIndex?.altLevelsFt ?? [],
    loadAltGrid: (altFt) => cachedGrid('ktg', ktgBundleKey, altFt, () =>
      readKtgGridSafe({ root, tmfc: ktgLatest?.tmfc, hf: ktgHf, altFt })),
  })
  if (ktgLatest) turbulence.run = { tmfc: ktgLatest.tmfc, hf: ktgHf, validTime: ktgValidTime }

  // 사용자가 단면도에서 다른 예보시간(hf)을 골라볼 수 있도록, 바람 자료가 실제로 있는 시각 목록을 함께 내려준다.
  return {
    available: true, axis, crossSection, turbulence, totalDistanceNm: axis.totalDistanceNm,
    availableTimes: candidateTimes.map((time) => selectClosestForecastTime({
      tmfc,
      targetMs: 0,
      candidateTimes: [time],
    })).filter(Boolean),
  }
}
