import { bandToFt } from './planned-altitude.js'
import { buildRouteAxis, distanceMeters } from './route-axis.js'
import {
  evaluateHorizontalExposure,
  evaluateTimeStatus,
  exposureConfidence,
} from './hazard-exposure.js'

const LIGHTNING_DISTANCE_METERS = 20 * 1852

function advisoryItems(sigmet, sigmetOverseas, airmet) {
  return [
    ...(sigmet?.items ?? []).map((item) => ({ item, source: 'SIGMET' })),
    ...(sigmetOverseas?.items ?? []).map((item) => ({ item, source: 'SIGMET' })),
    ...(airmet?.items ?? []).map((item) => ({ item, source: 'AIRMET' })),
  ]
}

function isConvection(item) {
  return /(?:^|_)(?:TS|CB)(?:_|$)/i.test(item?.phenomenon_code ?? '')
}

function lightningComparison(lightning, axis, referenceTime) {
  const strikes = lightning?.nationwide?.strikes
  const windowMinutes = Number(lightning?.history_window_minutes)
  const referenceMs = Date.parse(referenceTime ?? lightning?.fetched_at)
  if (!Array.isArray(strikes) || !(windowMinutes > 0) || !Number.isFinite(referenceMs)) {
    return { status: 'unavailable', observedAt: null, within20NmCount: null }
  }

  const cutoffMs = referenceMs - windowMinutes * 60_000
  let observedAt = null
  let within20NmCount = 0
  for (const strike of strikes) {
    const timeMs = Date.parse(strike?.time)
    const lon = Number(strike?.lon)
    const lat = Number(strike?.lat)
    if (!Number.isFinite(timeMs) || timeMs < cutoffMs || !Number.isFinite(lon) || !Number.isFinite(lat)) continue
    if (observedAt == null || timeMs > Date.parse(observedAt)) observedAt = strike.time
    if (axis.samples.some((sample) => distanceMeters([lon, lat], [sample.lon, sample.lat]) <= LIGHTNING_DISTANCE_METERS)) {
      within20NmCount += 1
    }
  }
  return { status: 'available', observedAt, within20NmCount }
}

export function buildRouteExposure({ routeGeometry, routeModel, etd, eta, sigmet, sigmetOverseas, airmet, lightning, referenceTime } = {}) {
  const axis = buildRouteAxis(routeGeometry, 2000)
  const triggerStates = []
  const hazards = []

  for (const { item, source } of advisoryItems(sigmet, sigmetOverseas, airmet)) {
    const horizontalExposure = evaluateHorizontalExposure({ axis, geometry: item?.geometry, enRouteRange: routeModel?.enRouteRange })
    const timeStatus = evaluateTimeStatus({ etd, eta, validFrom: item?.valid_from, validTo: item?.valid_to })
    const triggerCandidate = source === 'SIGMET' && isConvection(item)

    if (triggerCandidate) {
      if (horizontalExposure.status === 'intersects') {
        triggerStates.push(timeStatus === 'matched' ? 'ready' : timeStatus === 'not_provided' ? 'time_unknown' : timeStatus === 'unavailable' ? 'unavailable' : 'none')
      } else if (horizontalExposure.status === 'unavailable') {
        triggerStates.push('unavailable')
      }
    }
    if (horizontalExposure.status !== 'intersects' || timeStatus == null) continue

    hazards.push({
      source,
      sourceId: item?.id ?? null,
      phenomenon: item?.phenomenon_code ?? null,
      label: item?.phenomenon_label || item?.phenomenon_code || source,
      validFrom: item?.valid_from ?? null,
      validTo: item?.valid_to ?? null,
      bandFt: bandToFt(item?.altitude),
      horizontalExposure,
      timeStatus,
      confidence: exposureConfidence({ horizontalExposure, timeStatus }),
    })
  }

  const trigger = triggerStates.includes('ready')
    ? 'ready'
    : triggerStates.includes('time_unknown')
      ? 'time_unknown'
      : triggerStates.includes('unavailable')
        ? 'unavailable'
        : 'none'
  return {
    trigger,
    hazards,
    comparisonOnly: { lightning: lightningComparison(lightning, axis, referenceTime) },
  }
}
