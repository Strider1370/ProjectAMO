const EARTH_RADIUS_NM = 3440.065
const COORDINATE_EPSILON = 1e-6

function distanceNm([lon1, lat1], [lon2, lat2]) {
  const toRad = (value) => value * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
}

function sameCoordinate(a, b) {
  return Math.abs(a[0] - b[0]) <= COORDINATE_EPSILON
    && Math.abs(a[1] - b[1]) <= COORDINATE_EPSILON
}

function findCoordinateIndex(coordinates, target, fromIndex) {
  for (let index = fromIndex; index < coordinates.length; index += 1) {
    if (sameCoordinate(coordinates[index], target)) return index
  }
  return -1
}

function buildRouteAxis(coordinates) {
  let distance = 0
  const vertices = coordinates.map((coordinate, index) => {
    if (index > 0) distance += distanceNm(coordinates[index - 1], coordinate)
    return { coordinate, distanceNm: Number(distance.toFixed(2)) }
  })
  return { totalDistanceNm: vertices.at(-1).distanceNm, vertices }
}

function directedSegmentGeometries(routeResult) {
  return (routeResult?.previewGeojson?.features ?? [])
    .filter((feature) => feature?.properties?.role === 'route-segment-line')
    .map((feature) => feature.geometry?.coordinates ?? [])
}

export function buildCommonRouteModel({ routeGeometry, routeResult } = {}) {
  const coordinates = routeGeometry?.coordinates
  if (routeGeometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('routeGeometry must be a GeoJSON LineString with two coordinates')
  }

  const routeAxis = buildRouteAxis(coordinates)
  const manualLegs = routeResult?.manualLegs ?? []
  const segments = manualLegs.length > 0 ? manualLegs : routeResult?.segments ?? []
  const geometries = directedSegmentGeometries(routeResult)
  let nextCoordinateIndex = 0
  const enRouteSegments = segments.map((segment, index) => {
    const geometry = geometries[index] ?? (Array.isArray(segment.geometry) ? segment.geometry : segment.geometry?.coordinates) ?? []
    const fromCoordinate = geometry[0]
    const toCoordinate = geometry.at(-1)
    const startIndex = fromCoordinate ? findCoordinateIndex(coordinates, fromCoordinate, nextCoordinateIndex) : -1
    const endIndex = startIndex >= 0 && toCoordinate ? findCoordinateIndex(coordinates, toCoordinate, startIndex + 1) : -1

    if (endIndex >= 0) nextCoordinateIndex = endIndex

    return {
      id: segment.id,
      kind: segment.kind ?? 'airway',
      routeId: segment.routeId,
      fromFix: routeResult?.navpointIds?.[index] ?? segment.fromFix ?? segment.from ?? null,
      toFix: routeResult?.navpointIds?.[index + 1] ?? segment.toFix ?? segment.to ?? null,
      routeType: segment.routeType ?? null,
      sourceCycle: segment.cycle ?? null,
      source: segment.source ?? null,
      startNm: startIndex >= 0 && endIndex >= 0 ? routeAxis.vertices[startIndex].distanceNm : null,
      endNm: startIndex >= 0 && endIndex >= 0 ? routeAxis.vertices[endIndex].distanceNm : null,
      alignmentStatus: startIndex >= 0 && endIndex >= 0 ? 'aligned' : 'unavailable',
    }
  })
  const aligned = enRouteSegments.filter((segment) => segment.alignmentStatus === 'aligned')
  const enRouteRange = aligned.length === enRouteSegments.length && aligned.length > 0
    ? { startNm: aligned[0].startNm, endNm: aligned.at(-1).endNm, status: 'aligned' }
    : { startNm: null, endNm: null, status: enRouteSegments.length ? 'unavailable' : 'not_applicable' }

  return {
    schemaVersion: 1,
    routeGeometry,
    routeAxis,
    enRouteSegments,
    enRouteRange,
    terminalRanges: enRouteRange.status === 'aligned'
      ? {
          departure: { startNm: 0, endNm: enRouteRange.startNm },
          arrival: { startNm: enRouteRange.endNm, endNm: routeAxis.totalDistanceNm },
        }
      : null,
    graphConnectionStatus: routeResult?.flightRule === 'IFR'
      ? (enRouteRange.status === 'aligned' ? (manualLegs.length > 0 ? 'manual' : 'connected') : 'unavailable')
      : 'not_applicable',
  }
}
