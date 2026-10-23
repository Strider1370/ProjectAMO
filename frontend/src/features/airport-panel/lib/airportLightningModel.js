const RECENT_MINUTES = 15
const MAX_AGE_MINUTES = 30
const AIRPORT_RADIUS_KM = 16
const NEAR_RADIUS_KM = 8
const LAG_TOLERANCE_MINUTES = 15

function validTime(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN
  return Date.parse(value)
}

function hasGap(windows, fromMs, toMs) {
  if (toMs <= fromMs) return false
  const ordered = windows
    .map((window) => ({ from: validTime(window?.from), to: validTime(window?.to) }))
    .filter((window) => Number.isFinite(window.from) && Number.isFinite(window.to) && window.from < window.to)
    .sort((a, b) => a.from - b.from)
  let coveredTo = fromMs
  for (const window of ordered) {
    if (window.to <= coveredTo) continue
    if (window.from > coveredTo) return true
    coveredTo = window.to
    if (coveredTo >= toMs) return false
  }
  return coveredTo < toMs
}

// Positive observations remain useful during partial collection; the status qualifies their completeness.
export function buildAirportLightningModel(payload, airport, nowMs) {
  const empty = { active: false, count: 0 }
  if (airport?.overseas || !airport?.icao || !Number.isFinite(nowMs)) return empty

  const airportData = payload?.airports?.[airport.icao]
  if (!Array.isArray(airportData?.strikes)) return empty

  const strikes = airportData.strikes
    .map((strike) => ({ ...strike, timeMs: validTime(strike?.time), distanceKm: strike?.distance_km == null ? NaN : Number(strike.distance_km) }))
    .filter((strike) => Number.isFinite(strike.timeMs)
      && strike.timeMs <= nowMs
      && strike.timeMs >= nowMs - MAX_AGE_MINUTES * 60_000
      && Number.isFinite(strike.distanceKm)
      && strike.distanceKm >= 0
      && strike.distanceKm <= AIRPORT_RADIUS_KM
      && (!strike.zone || strike.zone === 'alert' || strike.zone === 'danger'))
    .sort((a, b) => b.timeMs - a.timeMs)

  if (!strikes.length) return empty

  const coverage = payload?.nationwide?.coverage
  const coverageToMs = validTime(coverage?.to)
  const evaluatedToMs = Math.min(nowMs, coverageToMs)
  const partial = !Array.isArray(coverage?.successfulWindows)
    || !Number.isFinite(coverageToMs)
    || hasGap(coverage.successfulWindows, nowMs - MAX_AGE_MINUTES * 60_000, evaluatedToMs)
  const delayed = !Number.isFinite(coverageToMs)
    || nowMs - coverageToMs > LAG_TOLERANCE_MINUTES * 60_000
  const nearestKm = Math.min(...strikes.map((strike) => strike.distanceKm))
  const near = strikes.some((strike) => strike.zone === 'alert' || (!strike.zone && strike.distanceKm <= NEAR_RADIUS_KM))
  const recent = strikes[0].timeMs >= nowMs - RECENT_MINUTES * 60_000

  return {
    active: true,
    count: strikes.length,
    recent,
    nearestKm,
    near,
    latestTime: strikes[0].time,
    dataStatus: delayed ? '자료 갱신 지연' : partial ? '일부 관측 구간 누락' : null,
  }
}
