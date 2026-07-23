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
