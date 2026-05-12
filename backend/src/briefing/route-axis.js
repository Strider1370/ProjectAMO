const EARTH_RADIUS_M = 6371008.8
const METERS_PER_NM = 1852
const DEFAULT_SAMPLE_SPACING_METERS = 250
const MIN_SAMPLE_SPACING_METERS = 50
const MAX_SAMPLE_COUNT = 2500

function toRad(value) {
  return value * Math.PI / 180
}

function toDeg(value) {
  return value * 180 / Math.PI
}

export function distanceMeters(a, b) {
  const lon1 = toRad(a[0])
  const lat1 = toRad(a[1])
  const lon2 = toRad(b[0])
  const lat2 = toRad(b[1])
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function bearingDeg(a, b) {
  const lon1 = toRad(a[0])
  const lat1 = toRad(a[1])
  const lon2 = toRad(b[0])
  const lat2 = toRad(b[1])
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function interpolateCoordinate(a, b, ratio) {
  return [
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
  ]
}

function normalizeSpacing(sampleSpacingMeters) {
  const value = Number(sampleSpacingMeters)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SAMPLE_SPACING_METERS
  return Math.max(MIN_SAMPLE_SPACING_METERS, value)
}

function validateLineString(routeGeometry) {
  if (routeGeometry?.type !== 'LineString' || !Array.isArray(routeGeometry.coordinates)) {
    throw new Error('routeGeometry must be a GeoJSON LineString')
  }

  const coordinates = routeGeometry.coordinates
    .map((coord) => [Number(coord?.[0]), Number(coord?.[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))

  if (coordinates.length < 2) {
    throw new Error('routeGeometry must contain at least two valid coordinates')
  }

  return coordinates
}

export function buildRouteAxis(routeGeometry, sampleSpacingMeters = DEFAULT_SAMPLE_SPACING_METERS) {
  const coordinates = validateLineString(routeGeometry)
  const requestedSpacing = normalizeSpacing(sampleSpacingMeters)
  const segments = []
  let totalMeters = 0

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const start = coordinates[i]
    const end = coordinates[i + 1]
    const lengthMeters = distanceMeters(start, end)
    if (lengthMeters <= 0) continue
    segments.push({
      start,
      end,
      startDistanceMeters: totalMeters,
      lengthMeters,
      bearingDeg: bearingDeg(start, end),
    })
    totalMeters += lengthMeters
  }

  if (segments.length === 0) {
    throw new Error('routeGeometry does not contain a measurable path')
  }

  const sampleCount = Math.min(Math.floor(totalMeters / requestedSpacing) + 1, MAX_SAMPLE_COUNT)
  const effectiveSpacing = sampleCount >= MAX_SAMPLE_COUNT
    ? totalMeters / (MAX_SAMPLE_COUNT - 1)
    : requestedSpacing
  const samples = []
  let segmentIndex = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const distanceOnRoute = Math.min(index * effectiveSpacing, totalMeters)
    while (
      segmentIndex < segments.length - 1 &&
      distanceOnRoute > segments[segmentIndex].startDistanceMeters + segments[segmentIndex].lengthMeters
    ) {
      segmentIndex += 1
    }

    const segment = segments[segmentIndex]
    const segmentOffset = distanceOnRoute - segment.startDistanceMeters
    const ratio = Math.max(0, Math.min(1, segmentOffset / segment.lengthMeters))
    const [lon, lat] = interpolateCoordinate(segment.start, segment.end, ratio)
    samples.push({
      index,
      distanceNm: Number((distanceOnRoute / METERS_PER_NM).toFixed(2)),
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      bearingDeg: Number(segment.bearingDeg.toFixed(1)),
    })
  }

  const lastCoordinate = coordinates[coordinates.length - 1]
  const lastDistanceNm = Number((totalMeters / METERS_PER_NM).toFixed(2))
  const lastSample = samples[samples.length - 1]
  if (!lastSample || lastSample.distanceNm < lastDistanceNm) {
    const previous = coordinates[coordinates.length - 2]
    samples.push({
      index: samples.length,
      distanceNm: lastDistanceNm,
      lon: Number(lastCoordinate[0].toFixed(6)),
      lat: Number(lastCoordinate[1].toFixed(6)),
      bearingDeg: Number(bearingDeg(previous, lastCoordinate).toFixed(1)),
    })
  }

  return {
    totalDistanceNm: lastDistanceNm,
    sampleSpacingMeters: Math.round(effectiveSpacing),
    samples,
  }
}

export function buildFlightPath(axis, plannedCruiseAltitudeFt) {
  const altitudeFt = Number(plannedCruiseAltitudeFt)
  if (!Number.isFinite(altitudeFt) || altitudeFt <= 0) {
    throw new Error('plannedCruiseAltitudeFt must be a positive number')
  }

  return {
    unit: 'ft',
    plannedCruiseAltitudeFt: Math.round(altitudeFt),
    segments: [{
      fromDistanceNm: 0,
      toDistanceNm: axis.totalDistanceNm,
      altitudeFt: Math.round(altitudeFt),
    }],
  }
}

