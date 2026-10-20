const METERS_TO_FEET = 3.28084

// ICAO standard-atmosphere pressure to geopotential altitude. The KIM field itself
// remains an isobaric surface; this is only the aviation-oriented display reference.
export function standardAltitudeFtForPressure(pressureHpa) {
  const pressure = Number(pressureHpa)
  if (!Number.isFinite(pressure) || pressure <= 0) return null
  const meters = pressure >= 226.32
    ? 44330.769 * (1 - (pressure / 1013.25) ** 0.190263)
    : 11000 - ((287.05287 * 216.65) / 9.80665) * Math.log(pressure / 226.32)
  return meters * METERS_TO_FEET
}

export function flightLevelForPressure(pressureHpa) {
  const feet = standardAltitudeFtForPressure(pressureHpa)
  if (!Number.isFinite(feet)) return null
  return Math.max(0, Math.round(feet / 1000) * 10)
}

export function formatPressureFlightLevel(pressureHpa) {
  const flightLevel = flightLevelForPressure(pressureHpa)
  return flightLevel == null ? '—' : `FL${String(flightLevel).padStart(3, '0')}`
}

export function pressureLevelPosition(level, levels) {
  const index = levels.indexOf(level)
  if (index < 0 || levels.length <= 1) return 50
  return (index / (levels.length - 1)) * 100
}

export function isMajorPressureLevel(level) {
  return [1000, 850, 700, 500, 400, 250, 150].includes(Number(level?.value))
}

// 고도(ft)에 가장 가까운 기압면. levels는 슬라이더 항목({ id: '350hPa', value: 350 }) — 표준대기 고도로 비교한다.
export function nearestPressureLevelForAltitude(levels, altitudeFt) {
  if (!Number.isFinite(altitudeFt)) return null
  let best = null
  let bestDelta = Infinity
  for (const level of levels ?? []) {
    const feet = standardAltitudeFtForPressure(level?.value)
    if (!Number.isFinite(feet)) continue
    const delta = Math.abs(feet - altitudeFt)
    if (delta < bestDelta) { bestDelta = delta; best = level }
  }
  return best
}
