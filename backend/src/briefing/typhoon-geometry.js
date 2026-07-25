// 태풍 반경을 GeoJSON 폴리곤으로 만든다.
// 강풍/폭풍 반경은 원이 아니다. 기상청이 방위 하나(ED)와 그 방향의 줄어든 반경(ER)을 준다.
// 진행방향에서 위험반원/안전반원을 유도하지 않는다 — 표본에서 항상 성립하지 않았다(스펙 §2).
import * as turf from '@turf/turf'

export const BEARING_BY_POINT = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

const DEFAULT_STEPS = 72

// 두 방위 사이의 최소 각차(0~180).
function angularDelta(a, b) {
  const diff = Math.abs(((a - b) % 360 + 360) % 360)
  return diff > 180 ? 360 - diff : diff
}

// 축소 방향에서 정확히 ER, 90도 이상 벗어나면 RAD, 그 사이는 코사인 보간.
function radiusAt(bearing, radiusKm, exceptionBearing, exceptionRadiusKm) {
  if (exceptionBearing === null || exceptionRadiusKm === null) return radiusKm
  const delta = angularDelta(bearing, exceptionBearing)
  if (delta >= 90) return radiusKm
  return radiusKm - (radiusKm - exceptionRadiusKm) * Math.cos((delta * Math.PI) / 180)
}

export function asymmetricPolygon({ lat, lon, radiusKm, exceptionDir = null, exceptionRadiusKm = null, steps = DEFAULT_STEPS }) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const exceptionBearing = exceptionDir ? BEARING_BY_POINT[exceptionDir] ?? null : null
  const exception = Number.isFinite(exceptionRadiusKm) ? exceptionRadiusKm : null

  const coordinates = []
  for (let i = 0; i < steps; i++) {
    const bearing = (360 / steps) * i
    const distance = radiusAt(bearing, radiusKm, exceptionBearing, exception)
    coordinates.push(turf.destination([lon, lat], distance, bearing, { units: 'kilometers' }).geometry.coordinates)
  }
  coordinates.push(coordinates[0])
  return { type: 'Polygon', coordinates: [coordinates] }
}

function ringPolygon(row, ring, extraKm = 0) {
  if (!ring) return null
  return asymmetricPolygon({
    lat: row.lat,
    lon: row.lon,
    radiusKm: ring.radiusKm + extraKm,
    exceptionDir: ring.exceptionDir,
    exceptionRadiusKm: ring.exceptionRadiusKm === null ? null : ring.exceptionRadiusKm + extraKm,
  })
}

export function galePolygon(row) {
  return ringPolygon(row, row.gale)
}

export function stormPolygon(row) {
  return ringPolygon(row, row.storm)
}

// 판정용 = 강풍반경 + 중심 오차반경. 예보 위치가 빗나가도 강풍을 만날 수 있는 범위.
export function judgementPolygon(row) {
  const errorKm = Number.isFinite(row.errorRadiusKm) ? row.errorRadiusKm : 0
  return ringPolygon(row, row.gale, errorKm)
}

// 예보 시점별 오차원의 합집합 = 화면의 예상경로 부채꼴.
export function errorConePolygon(rows = []) {
  let cone = null
  for (const row of rows) {
    if (!Number.isFinite(row?.errorRadiusKm) || row.errorRadiusKm <= 0) continue
    const circle = turf.circle([row.lon, row.lat], row.errorRadiusKm, { steps: DEFAULT_STEPS, units: 'kilometers' })
    cone = cone ? turf.union(turf.featureCollection([cone, circle])) : circle
  }
  return cone ? cone.geometry : null
}

export default { BEARING_BY_POINT, asymmetricPolygon, galePolygon, stormPolygon, judgementPolygon, errorConePolygon }
