import { ktgIntensity } from '../processors/ktg-model.js'
import { loadRouteCrossSection } from './enroute-cross-section.js'

const LEVEL_RANK = { '약': 1, '중': 2, '심': 3 }

function sortedLevels(levels) {
  return [...(levels ?? [])]
    .filter((L) => Number.isFinite(L.altFt) && Array.isArray(L.values))
    .sort((a, b) => a.altFt - b.altFt)
}

function altitudeAtProfileDistance(profile, distanceNm, fallbackAltitudeFt) {
  const points = [...(profile?.points ?? [])]
    .filter((point) => Number.isFinite(Number(point?.distanceNm)) && Number.isFinite(Number(point?.altitudeFt)))
    .sort((a, b) => Number(a.distanceNm) - Number(b.distanceNm))
  if (points.length === 0) return fallbackAltitudeFt

  const distance = Number(distanceNm)
  if (!Number.isFinite(distance)) return fallbackAltitudeFt
  if (distance <= Number(points[0].distanceNm)) return Number(points[0].altitudeFt)
  if (distance >= Number(points.at(-1).distanceNm)) return Number(points.at(-1).altitudeFt)

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const startDistance = Number(start.distanceNm)
    const endDistance = Number(end.distanceNm)
    if (distance < startDistance || distance > endDistance) continue
    const span = endDistance - startDistance
    if (span <= 0) return Number(end.altitudeFt)
    const fraction = (distance - startDistance) / span
    return Number(start.altitudeFt) + (Number(end.altitudeFt) - Number(start.altitudeFt)) * fraction
  }
  return fallbackAltitudeFt
}

// 각 거리 샘플에서 계획고도 alt(d)에 해당하는 값을 두 기압면 사이에서 구한다.
// mode 'worst': 위험 등급(착빙/난류) → 두 레벨 중 큰 값. mode 'interp': 연속값(바람/기온) → 선형 보간.
// nullOutside: 계획고도가 레벨 커버리지 밖이면 null(저고도 한정 KTG용).
function seriesAtAltitude(levels, totalDistanceNm, cruiseAltitudeFt, pick, { flightPlanProfile = null, mode = 'interp', nullOutside = false } = {}) {
  const sorted = sortedLevels(levels)
  if (sorted.length === 0) return []
  const minAlt = sorted[0].altFt
  const maxAlt = sorted[sorted.length - 1].altFt
  const n = sorted[0].values.length
  const out = []
  for (let i = 0; i < n; i += 1) {
    const d = sorted[0].values[i]?.distanceNm
    const alt = altitudeAtProfileDistance(flightPlanProfile, d, cruiseAltitudeFt)
    if (nullOutside && (alt < minAlt || alt > maxAlt)) { out.push({ distanceNm: d, value: null }); continue }
    let lo = sorted[0]
    let hi = sorted[sorted.length - 1]
    for (let k = 0; k < sorted.length - 1; k += 1) {
      if (sorted[k].altFt <= alt && alt <= sorted[k + 1].altFt) { lo = sorted[k]; hi = sorted[k + 1]; break }
    }
    const vLo = pick(lo.values[i])
    const vHi = pick(hi.values[i])
    let val
    if (vLo == null && vHi == null) {
      val = null
    } else if (mode === 'worst') {
      val = Math.max(vLo ?? -Infinity, vHi ?? -Infinity)
    } else if (vLo == null) {
      val = vHi
    } else if (vHi == null) {
      val = vLo
    } else {
      const span = hi.altFt - lo.altFt
      const w = span > 0 ? Math.max(0, Math.min(1, (alt - lo.altFt) / span)) : 0
      val = vLo + (vHi - vLo) * w
    }
    out.push({ distanceNm: d, value: Number.isFinite(val) ? val : null })
  }
  return out
}

function roundInterval(iv) {
  return { startNm: Math.round(iv.startNm), endNm: Math.round(iv.endNm), level: iv.level }
}

function thresholdIntervals(series, classify) {
  const intervals = []
  let cur = null
  for (const p of series) {
    const lvl = p.value == null ? null : classify(p.value)
    if (lvl) {
      if (!cur) cur = { startNm: p.distanceNm, endNm: p.distanceNm, level: lvl }
      else { cur.endNm = p.distanceNm; if (LEVEL_RANK[lvl] > LEVEL_RANK[cur.level]) cur.level = lvl }
    } else if (cur) {
      intervals.push(roundInterval(cur)); cur = null
    }
  }
  if (cur) intervals.push(roundInterval(cur))
  return intervals
}

// 착빙 등급(정수)·KTG(EDR형). 중(moderate) 이상만 노출 — 약(light)은 단면도 색으로 충분.
// 임계값은 실측 분포 기반의 보수적 근사 — 추후 튜닝 대상.
function classifyIcing(g) { return g >= 3 ? '심' : g >= 2 ? '중' : null }
// KTG 강도는 저장소 단일 진실원(ktg-model.js: 약<0.475, 중<0.75, 심≥0.75)을 따른다. 약(LGT)은 제외.
function classifyKtg(v) { const i = ktgIntensity(v); return i >= 3 ? '심' : i >= 2 ? '중' : null }

export function summarizeEnrouteModel({ crossSection, turbulence, totalDistanceNm, cruiseAltitudeFt, flightPlanProfile = null }) {
  const elements = []
  const kim = crossSection?.levels ?? []
  if (kim.length) {
    const icing = thresholdIntervals(
      seriesAtAltitude(kim, totalDistanceNm, cruiseAltitudeFt, (e) => e?.icing, { flightPlanProfile, mode: 'worst' }),
      classifyIcing,
    )
    if (icing.length) elements.push({ kind: 'icing', label: '착빙', intervals: icing })
  }
  const ktg = turbulence?.levels ?? []
  if (ktg.length) {
    const turb = thresholdIntervals(
      seriesAtAltitude(ktg, totalDistanceNm, cruiseAltitudeFt, (e) => e?.ktg, { flightPlanProfile, mode: 'worst', nullOutside: true }),
      classifyKtg,
    )
    if (turb.length) elements.push({ kind: 'turbulence', label: '난류', intervals: turb })
  }
  return {
    totalDistanceNm: Math.round(totalDistanceNm) || null,
    elements,
    runs: { kim: crossSection?.run ?? null, ktg: turbulence?.run ?? null },
  }
}

// 경로 단면 로드 + 요약을 한 곳에서 소유한다(이전엔 라우트·경보 스케줄러에 복붙돼 있었다).
// root 없으면(=단면 불요, 예: dev 시나리오) null. 로드 실패해도 null(브리핑은 유지 — best-effort).
export function buildEnrouteModel({ root, routeGeometry, body = {}, cruiseAltitudeFt } = {}) {
  if (!root) return null
  try {
    const loaded = loadRouteCrossSection({ root, routeGeometry, body })
    if (!loaded.available) return null
    return summarizeEnrouteModel({
      crossSection: loaded.crossSection,
      turbulence: loaded.turbulence,
      totalDistanceNm: loaded.totalDistanceNm,
      cruiseAltitudeFt,
    })
  } catch {
    return null
  }
}

export default { summarizeEnrouteModel, buildEnrouteModel }
