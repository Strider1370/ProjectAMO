// 태양 고도각(도). NOAA 일반 근사식(적위·균시차·시간각)이며 오차는 약 0.1° 안팎이다.
// 가시 위성처럼 "해가 떠 있는지"를 가리는 데 쓰므로 이 정도면 충분하다.
const RAD = Math.PI / 180

export function solarElevationDeg(timeMs, lat, lon) {
  const date = new Date(timeMs)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((timeMs - startOfYear) / 86_400_000) + 1
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hours - 12) / 24)
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  const trueSolarMinutes = hours * 60 + equationOfTime + 4 * lon
  const hourAngle = (trueSolarMinutes / 4 - 180) * RAD
  const cosZenith = Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle)
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / RAD
}

// 영역 경계와 내부 표본점 가운데 가장 높은 태양 고도. [[남, 서], [북, 동]] 경계를 steps×steps 격자로 나눈다.
export function maxSolarElevationDeg(timeMs, [[south, west], [north, east]], steps = 4) {
  let max = -90
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const lat = south + (north - south) * (i / steps)
      const lon = west + (east - west) * (j / steps)
      max = Math.max(max, solarElevationDeg(timeMs, lat, lon))
    }
  }
  return max
}

export default { solarElevationDeg, maxSolarElevationDeg }
