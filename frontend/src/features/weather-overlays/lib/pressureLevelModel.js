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
    if (level?.kind && level.kind !== 'pressure') continue // 10m 같은 높이 단계는 건너뜀
    const feet = standardAltitudeFtForPressure(level?.value)
    if (!Number.isFinite(feet)) continue
    const delta = Math.abs(feet - altitudeFt)
    if (delta < bestDelta) { bestDelta = delta; best = level }
  }
  return best
}

// KIM 기압면(백엔드 kim-nwp-model.js KIM_NWP_LEVELS의 기압면과 같은 목록). 지도형 브리핑에서 KIM 레이어가
// 꺼져 있어 레이어 색인이 없을 때도 고도 슬라이더를 보이기 위한 기본값. 레이어를 켜면 색인의 목록을 쓴다.
export const KIM_PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 875, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150]
  .map((value) => ({ id: `${value}hPa`, label: String(value), kind: 'pressure', value }))

// 슬라이더 위 고도(ft)의 세로 위치(%, 0 = 맨 위). 슬라이더 눈금은 기압면마다 같은 간격이라(고도 간격이 아님)
// 이웃한 두 기압면 사이를 표준대기 고도로 보간한다. levels는 슬라이더 순서(맨 위 = 가장 높은 고도).
export function altitudePositionPct(levels, altitudeFt) {
  const points = (levels ?? [])
    .map((level, index) => ({ index, feet: level?.kind === 'pressure' ? standardAltitudeFtForPressure(level.value) : null }))
    .filter((point) => Number.isFinite(point.feet))
  if (points.length < 2 || !Number.isFinite(altitudeFt)) return null
  const span = (levels.length - 1) || 1
  const pctOf = (index) => (index / span) * 100
  if (altitudeFt >= points[0].feet) return pctOf(points[0].index)
  if (altitudeFt <= points.at(-1).feet) return pctOf(points.at(-1).index)
  for (let i = 1; i < points.length; i += 1) {
    const upper = points[i - 1], lower = points[i]
    if (altitudeFt <= upper.feet && altitudeFt >= lower.feet) {
      const t = (upper.feet - altitudeFt) / (upper.feet - lower.feet)
      return pctOf(upper.index + t * (lower.index - upper.index))
    }
  }
  return null
}
