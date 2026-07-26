// Phase 1: 수평(평면) + 시간만. 고도(FL밴드)는 Phase 2.
import { distanceMeters } from './route-axis.js'

const METERS_PER_NM = 1852

// ray casting. ring = [[lon,lat], ...] (닫힌 ring 가정)
export function pointInPolygon([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function polygonsOf(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

const geometryBoundsCache = new WeakMap()

export function geometryBounds(geometry) {
  if (!geometry || typeof geometry !== 'object') return null
  const cached = geometryBoundsCache.get(geometry)
  if (cached) return cached
  const points = polygonsOf(geometry).flatMap((polygon) => polygon.flat())
  if (points.length === 0) return null
  const bounds = points.reduce((result, [lon, lat]) => ({
    minLon: Math.min(result.minLon, lon), minLat: Math.min(result.minLat, lat),
    maxLon: Math.max(result.maxLon, lon), maxLat: Math.max(result.maxLat, lat),
  }), { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity })
  geometryBoundsCache.set(geometry, bounds)
  return bounds
}

export function boundsOverlap(a, b) {
  return Boolean(a && b && a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat)
}

// 경로 LineString의 어떤 정점이라도 어떤 외곽 ring 안에 들면 교차로 간주(Phase 1 근사).
export function routeIntersectsGeometry(routeGeometry, geometry) {
  const coords = routeGeometry?.coordinates ?? []
  const polygons = polygonsOf(geometry)
  for (const point of coords) {
    for (const polygon of polygons) {
      const outerRing = polygon[0]
      if (outerRing && pointInPolygon(point, outerRing)) return true
    }
  }
  return false
}

export function timeWindowsOverlap(aStart, aEnd, bStart, bEnd) {
  const a0 = Date.parse(aStart), a1 = Date.parse(aEnd)
  const b0 = Date.parse(bStart), b1 = Date.parse(bEnd)
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false
  return a0 <= b1 && b0 <= a1
}

// route axis(샘플 배열)가 폴리곤 안에 드는 distanceNm 구간을 반환(Phase 2 수직 매칭용).
export function routeIntervalInGeometry(axis, geometry) {
  if (axis?.bounds && !boundsOverlap(axis.bounds, geometryBounds(geometry))) {
    return { entered: false, startNm: null, endNm: null }
  }
  const samples = axis?.samples ?? []
  const polygons = polygonsOf(geometry)
  let startNm = null, endNm = null
  for (const s of samples) {
    let inside = false
    for (const polygon of polygons) {
      const outer = polygon[0]
      if (outer && pointInPolygon([s.lon, s.lat], outer)) { inside = true; break }
    }
    if (inside) {
      if (startNm == null) startNm = s.distanceNm
      endNm = s.distanceNm
    }
  }
  return { entered: startNm != null, startNm, endNm }
}

function minDistanceNmToRing([lon, lat], ring) {
  let min = Infinity
  for (const vertex of ring) {
    const meters = distanceMeters([lon, lat], vertex)
    if (meters < min) min = meters
  }
  return min / METERS_PER_NM
}

// bufferNm 이내로 지나가면 "관련 있음"으로 본다. 두 곳에서 쓴다.
//  - 위험기상(SIGMET/AIRMET): 항로 양쪽 30NM(ForeFlight 관행)
//  - NOTAM 회랑: 본문 "n NM EITHER SIDE OF LINE"의 폭. 이때 geometry는 열린 선이다.
// 면을 실제로 침범했는지가 중요한 일반 NOTAM은 routeIntervalInGeometry를 쓴다.
// 정점까지의 최소거리로 근사한다.
export function routeCorridorInGeometry(axis, geometry, bufferNm) {
  const samples = axis?.samples ?? []
  // 열린 선(회랑 중심선)도 받는다. 거리 계산은 닫힌 링과 동일하고, 안쪽 판정만 건너뛴다.
  const isLine = geometry?.type === 'LineString'
  const rings = isLine ? [geometry.coordinates] : polygonsOf(geometry).map((p) => p[0])
  let startNm = null, endNm = null
  for (const s of samples) {
    let within = false
    for (const ring of rings) {
      if (!ring) continue
      const inside = !isLine && pointInPolygon([s.lon, s.lat], ring)
      if (inside || minDistanceNmToRing([s.lon, s.lat], ring) <= bufferNm) {
        within = true
        break
      }
    }
    if (within) {
      if (startNm == null) startNm = s.distanceNm
      endNm = s.distanceNm
    }
  }
  return { entered: startNm != null, startNm, endNm }
}

export default { pointInPolygon, routeIntersectsGeometry, timeWindowsOverlap, routeIntervalInGeometry, routeCorridorInGeometry, geometryBounds, boundsOverlap }
