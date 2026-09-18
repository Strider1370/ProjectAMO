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
// 소수점 4자리 ≈ 11 m. 태풍 반경(수십~수백 km)에 그 이상은 의미가 없고,
// 원본 배정밀도를 그대로 실으면 스냅샷이 몇 배로 불어난다.
const COORD_DECIMALS = 4

function roundCoord([lon, lat]) {
  const f = 10 ** COORD_DECIMALS
  return [Math.round(lon * f) / f, Math.round(lat * f) / f]
}

function roundGeometry(geometry) {
  if (!geometry) return null
  const ring = (r) => r.map(roundCoord)
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: geometry.coordinates.map(ring) }
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map((p) => p.map(ring)) }
  return geometry
}

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
  return roundGeometry({ type: 'Polygon', coordinates: [coordinates] })
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

// 인접 시점 사이의 중심(대권 경로)과 반경을 보간해 연속된 확률 영역을 만든다.
// 짧은 구간의 원 두 개만 감싸므로 꺾이는 경로 전체를 convex hull로 메우지 않는다.
// 결측 반경은 연결을 끊는다. 0은 알려진 중심 위치로서 다음 원과 연결할 수 있다.
export function errorConePolygon(rows = []) {
  const parts = []
  let previous = null
  const outline = (row) => row.errorRadiusKm === 0
    ? [[row.lon, row.lat]]
    : turf.circle([row.lon, row.lat], row.errorRadiusKm, { steps: DEFAULT_STEPS, units: 'kilometers' }).geometry.coordinates[0].slice(0, -1)
  for (const row of rows) {
    if (!Number.isFinite(row?.errorRadiusKm) || row.errorRadiusKm < 0
      || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) {
      previous = null
      continue
    }
    const end = outline(row)
    if (row.errorRadiusKm > 0) parts.push(turf.polygon([[...end, end[0]]]))
    if (previous) {
      const start = [previous.lon, previous.lat]
      const finish = [row.lon, row.lat]
      const distance = turf.distance(start, finish)
      const bearing = turf.bearing(start, finish)
      const steps = Math.max(1, Math.ceil(distance / 50))
      let before = outline(previous)
      for (let i = 1; i <= steps; i++) {
        const fraction = i / steps
        const [lon, lat] = turf.destination(start, distance * fraction, bearing).geometry.coordinates
        const after = i === steps ? end : outline({ lon, lat, errorRadiusKm: previous.errorRadiusKm + (row.errorRadiusKm - previous.errorRadiusKm) * fraction })
        const bridge = turf.convex(turf.featureCollection([...before, ...after].map((coordinate) => turf.point(coordinate))))
        if (bridge) parts.push(bridge)
        before = after
      }
    }
    previous = row
  }
  const cone = parts.length > 1 ? turf.union(turf.featureCollection(parts)) : parts[0]
  return cone ? roundGeometry(cone.geometry) : null
}

export default { BEARING_BY_POINT, asymmetricPolygon, galePolygon, stormPolygon, judgementPolygon, errorConePolygon }
