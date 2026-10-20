import {
  evaluateAltitudeExposure,
  evaluateHorizontalExposure,
  evaluateTimeStatus,
  exposureConfidence,
  hazardBandFt,
} from './hazard-exposure.js'
import { routeRunsInGeometry } from './geo-time-match.js'

// 위험 막대 틀용: 실제 영역 안 구간들을 노출 구간(여유 폭·항로 범위 반영) 안으로 자른 것.
// 여유 폭 안으로만 지나가 실제 영역에 안 들어가면 노출 구간 하나를 그대로 쓴다(숨기지 않는다).
function routeRunsWithin(axis, geometry, interval) {
  if (!interval) return []
  const runs = routeRunsInGeometry(axis, geometry)
    .map((run) => ({ startNm: Math.max(run.startNm, interval.startNm), endNm: Math.min(run.endNm, interval.endNm) }))
    .filter((run) => run.endNm >= run.startNm)
  return runs.length ? runs : [interval]
}

function matchItems(items, source, ctx) {
  const out = []
  for (const it of (items ?? [])) {
    const horizontalExposure = evaluateHorizontalExposure({ axis: ctx.axis, geometry: it?.geometry, enRouteRange: ctx.enRouteRange })
    if (horizontalExposure.status !== 'intersects') continue
    const timeStatus = evaluateTimeStatus({ etd: ctx.etd, eta: ctx.eta, validFrom: it.valid_from, validTo: it.valid_to })
    if (timeStatus == null) continue
    const bandFt = hazardBandFt(it)
    const altitudeExposure = evaluateAltitudeExposure({ horizontalExposure, bandFt, plannedCruiseAltitudeFt: ctx.cruiseAltitudeFt })
    const routeIntervalNm = horizontalExposure.intervals[0]
    out.push({
      source,
      sourceId: it.id ?? null,
      overseas: it.source === 'NOAA', // 해외(NOAA) SIGMET 여부 — 지도 레이어 칩(SIGMET 국내/해외) 선택용
      code: it.phenomenon_code,
      label: it.phenomenon_label || it.phenomenon_code,
      validFrom: it.valid_from,
      validTo: it.valid_to,
      onRoute: true,
      encounter: altitudeExposure.status === 'intersects' ? 'on' : 'nearby',
      verticalKnown: altitudeExposure.status !== 'unknown',
      bandFt,
      routeIntervalNm,
      routeRunsNm: routeRunsWithin(ctx.axis, it.geometry, routeIntervalNm),
      horizontalExposure,
      altitudeExposure,
      timeStatus,
      confidence: exposureConfidence({ horizontalExposure, altitudeExposure, timeStatus }),
    })
  }
  return out
}

// 보수적 위험별 레벨: SIGMET은 red, 단 "수직 확인되고 내 고도 밖(nearby)"이면 amber로만 완화.
// 밴드 미상 SIGMET(verticalKnown=false)은 under-alarm 금지로 red 유지. AIRMET은 항상 amber.
function hazardLevel(h) {
  if (h.source === 'SIGMET') return (h.verticalKnown && h.encounter === 'nearby') ? 'amber' : 'red'
  return 'amber'
}
const LEVEL_RANK = { green: 0, amber: 1, red: 2 }

// 심각도순 정렬: 조우(on) > 주변(nearby), 그다음 red > amber. 제일 위험이 맨 위(§5-A).
const ENCOUNTER_RANK = { on: 1, nearby: 0 }
function severityScore(h) {
  return (ENCOUNTER_RANK[h.encounter] ?? 0) * 10 + (LEVEL_RANK[h.level] ?? 0)
}

// airportWarnings: 이미 hazard 유사 shape로 변환된 공항경보(경로 지오 없음, level 포함).
export function buildHazardSection({ sigmet, airmet, axis, etd, eta, cruiseAltitudeFt, enRouteRange = null, airportWarnings = [], typhoons = [] }) {
  const ctx = { axis, etd, eta, cruiseAltitudeFt, enRouteRange }
  const hazards = [
    ...matchItems(sigmet, 'SIGMET', ctx).map((h) => ({ ...h, level: hazardLevel(h) })),
    ...matchItems(airmet, 'AIRMET', ctx).map((h) => ({ ...h, level: hazardLevel(h) })),
    ...airportWarnings,
    ...typhoons.map((h) => ({ ...h, level: hazardLevel(h) })),
  ]
  hazards.sort((a, b) => severityScore(b) - severityScore(a))
  const level = hazards.reduce((acc, h) => (LEVEL_RANK[h.level] > LEVEL_RANK[acc] ? h.level : acc), 'green')
  return { level, hazards }
}

export default { buildHazardSection }
