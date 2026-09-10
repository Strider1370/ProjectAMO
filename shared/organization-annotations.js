const EARTH_RADIUS_M = 6371008.8
const METERS_PER_NM = 1852
const EPSILON = 1e-9

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
}

function coordinate(value) {
  return [Number(value[0]), Number(value[1])]
}

function geometryOf(value) {
  return value?.type === 'Feature' ? value.geometry : value
}

function canonicalCircle(annotation) {
  const source = annotation?.circle
    ?? (annotation?.shapeType === 'Circle' ? annotation.geometry : null)
  const center = source?.center
  const radiusMeters = source?.radiusMeters ?? source?.radiusM
  if (!isCoordinate(center) || !Number.isFinite(Number(radiusMeters)) || Number(radiusMeters) < 0) return null
  return { center: coordinate(center), radiusMeters: Number(radiusMeters) }
}

function routeLines(routeGeometry) {
  const geometry = geometryOf(routeGeometry)
  if (geometry?.type === 'LineString') return [geometry.coordinates]
  if (geometry?.type === 'MultiLineString') return geometry.coordinates
  return []
}

function haversineMeters(a, b) {
  const lat1 = a[1] * Math.PI / 180
  const lat2 = b[1] * Math.PI / 180
  const dLat = lat2 - lat1
  const dLon = (b[0] - a[0]) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function projector(a, b) {
  const lon0 = (a[0] + b[0]) / 2
  const lat0 = (a[1] + b[1]) / 2
  const cosLat = Math.max(1e-8, Math.cos(lat0 * Math.PI / 180))
  return ([lon, lat]) => ({
    x: (lon - lon0) * Math.PI / 180 * EARTH_RADIUS_M * cosLat,
    y: (lat - lat0) * Math.PI / 180 * EARTH_RADIUS_M,
  })
}

function dot(a, b) { return a.x * b.x + a.y * b.y }
function cross(a, b) { return a.x * b.y - a.y * b.x }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y } }
function clamp01(value) { return Math.max(0, Math.min(1, value)) }

function pointSegmentProjection(point, start, end) {
  const segment = sub(end, start)
  const lengthSquared = dot(segment, segment)
  const t = lengthSquared > EPSILON ? clamp01(dot(sub(point, start), segment) / lengthSquared) : 0
  const closest = { x: start.x + segment.x * t, y: start.y + segment.y * t }
  return { t, distance: Math.hypot(point.x - closest.x, point.y - closest.y) }
}

// Returns the parameters of the closest pair on the two finite segments.
function closestSegmentParameters(p0, p1, q0, q1) {
  const u = sub(p1, p0)
  const v = sub(q1, q0)
  const w = sub(p0, q0)
  const a = dot(u, u)
  const b = dot(u, v)
  const c = dot(v, v)
  const d = dot(u, w)
  const e = dot(v, w)
  const denominator = a * c - b * b
  let sNumerator = denominator
  let tNumerator = denominator
  let sDenominator = denominator
  let tDenominator = denominator

  if (denominator < EPSILON) {
    sNumerator = 0
    sDenominator = 1
    tNumerator = e
    tDenominator = c
  } else {
    sNumerator = b * e - c * d
    tNumerator = a * e - b * d
    if (sNumerator < 0) {
      sNumerator = 0
      tNumerator = e
      tDenominator = c
    } else if (sNumerator > sDenominator) {
      sNumerator = sDenominator
      tNumerator = e + b
      tDenominator = c
    }
  }
  if (tNumerator < 0) {
    tNumerator = 0
    if (-d < 0) sNumerator = 0
    else if (-d > a) sNumerator = sDenominator
    else { sNumerator = -d; sDenominator = a }
  } else if (tNumerator > tDenominator) {
    tNumerator = tDenominator
    if (-d + b < 0) sNumerator = 0
    else if (-d + b > a) sNumerator = sDenominator
    else { sNumerator = -d + b; sDenominator = a }
  }
  const s = Math.abs(sNumerator) < EPSILON ? 0 : sNumerator / (sDenominator || 1)
  const t = Math.abs(tNumerator) < EPSILON ? 0 : tNumerator / (tDenominator || 1)
  const routePoint = { x: p0.x + s * u.x, y: p0.y + s * u.y }
  const otherPoint = { x: q0.x + t * v.x, y: q0.y + t * v.y }
  return { routeT: clamp01(s), distance: Math.hypot(routePoint.x - otherPoint.x, routePoint.y - otherPoint.y) }
}

function exactSegmentIntersectionTs(p0, p1, q0, q1, toleranceMeters) {
  const routeVector = sub(p1, p0)
  const otherVector = sub(q1, q0)
  const delta = sub(q0, p0)
  const denominator = cross(routeVector, otherVector)
  const routeLength = Math.hypot(routeVector.x, routeVector.y)
  const otherLength = Math.hypot(otherVector.x, otherVector.y)
  if (Math.abs(denominator) > EPSILON * Math.max(1, routeLength * otherLength)) {
    const routeT = cross(delta, otherVector) / denominator
    const otherT = cross(delta, routeVector) / denominator
    if (routeT >= -EPSILON && routeT <= 1 + EPSILON && otherT >= -EPSILON && otherT <= 1 + EPSILON) {
      return [[clamp01(routeT), clamp01(routeT)]]
    }
  } else if (routeLength > EPSILON) {
    const perpendicular = Math.abs(cross(delta, routeVector)) / routeLength
    if (perpendicular <= toleranceMeters) {
      const routeLengthSquared = dot(routeVector, routeVector)
      const first = dot(sub(q0, p0), routeVector) / routeLengthSquared
      const second = dot(sub(q1, p0), routeVector) / routeLengthSquared
      const start = Math.max(0, Math.min(first, second))
      const end = Math.min(1, Math.max(first, second))
      if (end >= start - EPSILON) return [[clamp01(start), clamp01(end)]]
    }
  }
  const closest = closestSegmentParameters(p0, p1, q0, q1)
  return closest.distance <= toleranceMeters ? [[closest.routeT, closest.routeT]] : []
}

function pointOnRingBoundary(point, ring, toleranceMeters = 0.01) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (pointSegmentProjection(point, ring[index], ring[index + 1]).distance <= toleranceMeters) return true
  }
  return false
}

function pointInRing(point, ring) {
  if (pointOnRingBoundary(point, ring)) return true
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index]
    const prior = ring[previous]
    if ((current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false
  return !rings.slice(1).some((ring) => pointInRing(point, ring) && !pointOnRingBoundary(point, ring))
}

function normalizeIntervals(intervals, gap = EPSILON) {
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end))
    .map(([start, end]) => start <= end ? [start, end] : [end, start])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (!previous || interval[0] > previous[1] + gap) merged.push([...interval])
    else previous[1] = Math.max(previous[1], interval[1])
  }
  return merged
}

function pointIntervals(routeStart, routeEnd, target, toleranceMeters) {
  const project = projector(routeStart, routeEnd)
  const projected = pointSegmentProjection(project(target), project(routeStart), project(routeEnd))
  return projected.distance <= toleranceMeters ? [[projected.t, projected.t]] : []
}

function lineIntervals(routeStart, routeEnd, lines, toleranceMeters) {
  const project = projector(routeStart, routeEnd)
  const p0 = project(routeStart)
  const p1 = project(routeEnd)
  const result = []
  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      result.push(...exactSegmentIntersectionTs(p0, p1, project(line[index]), project(line[index + 1]), toleranceMeters))
    }
  }
  return normalizeIntervals(result)
}

function polygonIntervals(routeStart, routeEnd, polygons) {
  const project = projector(routeStart, routeEnd)
  const p0 = project(routeStart)
  const p1 = project(routeEnd)
  const routeVector = sub(p1, p0)
  const result = []
  for (const polygon of polygons) {
    const rings = polygon.map((ring) => ring.map(project))
    const cuts = [0, 1]
    for (const ring of rings) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        for (const [start, end] of exactSegmentIntersectionTs(p0, p1, ring[index], ring[index + 1], 0.01)) {
          cuts.push(start, end)
        }
      }
    }
    const sortedCuts = [...new Set(cuts.map((value) => clamp01(value).toFixed(12)))].map(Number).sort((a, b) => a - b)
    for (let index = 0; index < sortedCuts.length - 1; index += 1) {
      const start = sortedCuts[index]
      const end = sortedCuts[index + 1]
      const middle = (start + end) / 2
      const sample = { x: p0.x + routeVector.x * middle, y: p0.y + routeVector.y * middle }
      if (pointInPolygon(sample, rings)) result.push([start, end])
    }
    // A tangent or a route endpoint on the boundary is a legitimate zero-width crossing.
    for (const cut of sortedCuts) {
      const sample = { x: p0.x + routeVector.x * cut, y: p0.y + routeVector.y * cut }
      if (rings.some((ring) => pointOnRingBoundary(sample, ring))) result.push([cut, cut])
    }
  }
  return normalizeIntervals(result)
}

function circleIntervals(routeStart, routeEnd, center, radiusMeters, toleranceMeters) {
  const project = projector(routeStart, routeEnd)
  const p0 = project(routeStart)
  const p1 = project(routeEnd)
  const c = project(center)
  const vector = sub(p1, p0)
  const offset = sub(p0, c)
  const a = dot(vector, vector)
  if (a < EPSILON) return Math.hypot(offset.x, offset.y) <= radiusMeters + toleranceMeters ? [[0, 0]] : []
  const b = 2 * dot(offset, vector)
  const expandedRadius = radiusMeters + toleranceMeters
  const discriminant = b * b - 4 * a * (dot(offset, offset) - expandedRadius * expandedRadius)
  if (discriminant < -EPSILON) return []
  const root = Math.sqrt(Math.max(0, discriminant))
  const enter = (-b - root) / (2 * a)
  const exit = (-b + root) / (2 * a)
  const start = Math.max(0, enter)
  const end = Math.min(1, exit)
  return end >= start - EPSILON ? [[clamp01(start), clamp01(end)]] : []
}

function validLine(line) {
  return Array.isArray(line) && line.filter(isCoordinate).length >= 2
}

function intervalsForGeometry(routeStart, routeEnd, annotation, toleranceMeters) {
  const circle = canonicalCircle(annotation)
  if (circle) {
    return circleIntervals(routeStart, routeEnd, circle.center, circle.radiusMeters, toleranceMeters)
  }
  const geometry = geometryOf(annotation?.geometry)
  if (!geometry) return []
  if (geometry.type === 'Point' && isCoordinate(geometry.coordinates)) {
    return pointIntervals(routeStart, routeEnd, coordinate(geometry.coordinates), toleranceMeters)
  }
  if (geometry.type === 'MultiPoint') {
    return normalizeIntervals((geometry.coordinates || []).filter(isCoordinate)
      .flatMap((point) => pointIntervals(routeStart, routeEnd, coordinate(point), toleranceMeters)))
  }
  if (geometry.type === 'LineString' && validLine(geometry.coordinates)) {
    return lineIntervals(routeStart, routeEnd, [geometry.coordinates.map(coordinate)], toleranceMeters)
  }
  if (geometry.type === 'MultiLineString') {
    const lines = (geometry.coordinates || []).filter(validLine).map((line) => line.map(coordinate))
    return lineIntervals(routeStart, routeEnd, lines, toleranceMeters)
  }
  if (geometry.type === 'Polygon') {
    const polygons = [(geometry.coordinates || []).filter(validLine).map((ring) => ring.map(coordinate))]
    return polygonIntervals(routeStart, routeEnd, polygons.filter((polygon) => polygon.length))
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons = (geometry.coordinates || []).map((polygon) => polygon.filter(validLine).map((ring) => ring.map(coordinate))).filter((polygon) => polygon.length)
    return polygonIntervals(routeStart, routeEnd, polygons)
  }
  if (geometry.type === 'GeometryCollection') {
    return normalizeIntervals((geometry.geometries || []).flatMap((member) => intervalsForGeometry(
      routeStart, routeEnd, { geometry: member }, toleranceMeters,
    )))
  }
  return []
}

function normalizeAltitude(altitude) {
  if (Array.isArray(altitude) && altitude.length >= 2) {
    return { minFt: Number(altitude[0]), maxFt: Number(altitude[1]), reference: 'AMSL' }
  }
  if (!altitude || typeof altitude !== 'object') return null
  const minFt = Number(altitude.minFt)
  const maxFt = Number(altitude.maxFt)
  if (!Number.isFinite(minFt) || !Number.isFinite(maxFt)) return null
  return { minFt, maxFt, reference: altitude.reference || 'AMSL' }
}

function outputGeometry(annotation) {
  const geometry = geometryOf(annotation?.geometry)
  return geometry && typeof geometry.type === 'string' ? geometry : null
}

/**
 * Projects organization-authored WGS84 annotations onto the route distance axis.
 * Circle center/radius remains canonical; generated display polygons are never returned.
 */
export function projectOrganizationAnnotations({ annotations = [], routeGeometry, flightId = null, toleranceMeters = 1 } = {}) {
  const lines = routeLines(routeGeometry)
    .map((line) => (line || []).filter(isCoordinate).map(coordinate))
    .filter((line) => line.length >= 2)
  const tolerance = Number.isFinite(Number(toleranceMeters)) && Number(toleranceMeters) >= 0
    ? Number(toleranceMeters) : 1
  return (Array.isArray(annotations) ? annotations : []).map((annotation, annotationIndex) => {
    const geometry = outputGeometry(annotation)
    const circle = canonicalCircle(annotation)
    let walkedMeters = 0
    const meters = []
    for (const line of lines) {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index]
        const end = line[index + 1]
        const segmentMeters = haversineMeters(start, end)
        const localIntervals = intervalsForGeometry(start, end, annotation, tolerance)
        for (const [startT, endT] of localIntervals) {
          meters.push([walkedMeters + segmentMeters * startT, walkedMeters + segmentMeters * endT])
        }
        walkedMeters += segmentMeters
      }
    }
    const distanceIntervals = normalizeIntervals(meters, tolerance).map(([start, end]) => ({
      startNm: start / METERS_PER_NM,
      endNm: end / METERS_PER_NM,
    }))
    const textOnly = !geometry && !circle
    return {
      sourceKind: annotation?.sourceKind || annotation?.source || 'annotation',
      id: String(annotation?.id ?? `annotation-${annotationIndex}`),
      flightId: annotation?.flightId ?? flightId,
      title: annotation?.title || '',
      description: annotation?.description ?? annotation?.body ?? '',
      authorUserId: annotation?.authorUserId ?? null,
      updatedByUserId: annotation?.updatedByUserId ?? null,
      geometry,
      circle,
      altitude: normalizeAltitude(annotation?.altitude) ?? normalizeAltitude(
        annotation?.altitudeMinFt == null ? null : [annotation.altitudeMinFt, annotation.altitudeMaxFt],
      ),
      distanceIntervals,
      relationship: textOnly ? 'text_only' : distanceIntervals.length ? 'on_route' : 'off_route',
    }
  })
}

export default projectOrganizationAnnotations
