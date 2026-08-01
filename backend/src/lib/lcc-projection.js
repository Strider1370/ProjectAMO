const DEG2RAD = Math.PI / 180
const PHI1 = 30.0 * DEG2RAD
const PHI2 = 60.0 * DEG2RAD
const PHI0 = 38.0 * DEG2RAD
const LAM0 = 126.0 * DEG2RAD
const R = 6371009

const _n = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) /
  Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2))
const _F = Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), _n) / _n
const _rho0 = R * _F / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), _n)

export function latLonToEN(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const rho = R * _F / Math.pow(Math.tan(Math.PI / 4 + lat / 2), _n)
  const theta = _n * (lon - LAM0)
  return [rho * Math.sin(theta), _rho0 - rho * Math.cos(theta)]
}

export function enToLatLon(easting, northing) {
  const rho = Math.hypot(easting, _rho0 - northing)
  const theta = Math.atan2(easting, _rho0 - northing)
  const lat = 2 * Math.atan(Math.pow(R * _F / rho, 1 / _n)) - Math.PI / 2
  const lon = LAM0 + theta / _n
  return [lat / DEG2RAD, lon / DEG2RAD]
}

// ── WGS84 타원체 LCC ─────────────────────────────────────────
// 기상청 지상 격자(sfc_obs)가 쓰는 투영. 구면 근사로는 최대 2.2km 잔차가 남는다.
const A84 = 6378137.0
const FLAT84 = 1 / 298.257223563
const E84 = Math.sqrt(2 * FLAT84 - FLAT84 * FLAT84)

const _m84 = (p) => Math.cos(p) / Math.sqrt(1 - E84 * E84 * Math.sin(p) ** 2)
const _t84 = (p) =>
  Math.tan(Math.PI / 4 - p / 2) /
  Math.pow((1 - E84 * Math.sin(p)) / (1 + E84 * Math.sin(p)), E84 / 2)

const _n84 = (Math.log(_m84(PHI1)) - Math.log(_m84(PHI2))) /
  (Math.log(_t84(PHI1)) - Math.log(_t84(PHI2)))
const _F84 = _m84(PHI1) / (_n84 * Math.pow(_t84(PHI1), _n84))
const _rho0_84 = A84 * _F84 * Math.pow(_t84(PHI0), _n84)

export function latLonToEN84(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const rho = A84 * _F84 * Math.pow(_t84(lat), _n84)
  const theta = _n84 * (lon - LAM0)
  return [rho * Math.sin(theta), _rho0_84 - rho * Math.cos(theta)]
}

export function enToLatLon84(easting, northing) {
  const rho = Math.hypot(easting, _rho0_84 - northing)
  const theta = Math.atan2(easting, _rho0_84 - northing)
  const tt = Math.pow(rho / (A84 * _F84), 1 / _n84)
  let lat = Math.PI / 2 - 2 * Math.atan(tt)
  for (let i = 0; i < 8; i++) {
    lat = Math.PI / 2 - 2 * Math.atan(
      tt * Math.pow((1 - E84 * Math.sin(lat)) / (1 + E84 * Math.sin(lat)), E84 / 2),
    )
  }
  return [lat / DEG2RAD, (LAM0 + theta / _n84) / DEG2RAD]
}
