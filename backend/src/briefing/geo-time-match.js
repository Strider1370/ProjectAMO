// Phase 1: 수평(평면) + 시간만. 고도(FL밴드)는 Phase 2.

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

export default { pointInPolygon, routeIntersectsGeometry, timeWindowsOverlap, routeIntervalInGeometry, geometryBounds, boundsOverlap }
