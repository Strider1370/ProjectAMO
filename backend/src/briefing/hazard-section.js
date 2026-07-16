import { bandToFt } from './planned-altitude.js'
import {
  evaluateAltitudeExposure,
  evaluateHorizontalExposure,
  evaluateTimeStatus,
  exposureConfidence,
} from './hazard-exposure.js'

function matchItems(items, source, ctx) {
  const out = []
  for (const it of (items ?? [])) {
    const horizontalExposure = evaluateHorizontalExposure({ axis: ctx.axis, geometry: it?.geometry, enRouteRange: ctx.enRouteRange })
    if (horizontalExposure.status !== 'intersects') continue
    const timeStatus = evaluateTimeStatus({ etd: ctx.etd, eta: ctx.eta, validFrom: it.valid_from, validTo: it.valid_to })
    if (timeStatus == null) continue
    const bandFt = bandToFt(it.altitude)
    const altitudeExposure = evaluateAltitudeExposure({ horizontalExposure, bandFt, plannedCruiseAltitudeFt: ctx.cruiseAltitudeFt })
    const routeIntervalNm = horizontalExposure.intervals[0]
    out.push({
      source,
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
export function buildHazardSection({ sigmet, airmet, axis, etd, eta, cruiseAltitudeFt, enRouteRange = null, airportWarnings = [] }) {
  const ctx = { axis, etd, eta, cruiseAltitudeFt, enRouteRange }
  const hazards = [
    ...matchItems(sigmet, 'SIGMET', ctx).map((h) => ({ ...h, level: hazardLevel(h) })),
    ...matchItems(airmet, 'AIRMET', ctx).map((h) => ({ ...h, level: hazardLevel(h) })),
    ...airportWarnings,
  ]
  hazards.sort((a, b) => severityScore(b) - severityScore(a))
  const level = hazards.reduce((acc, h) => (LEVEL_RANK[h.level] > LEVEL_RANK[acc] ? h.level : acc), 'green')
  return { level, hazards }
}

export default { buildHazardSection }
