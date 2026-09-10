import * as turf from '@turf/turf'
import { projectOrganizationAnnotations as projectSharedOrganizationAnnotations } from '../../../shared/organization-annotations.js'

const NM_PER_KM = 0.539956803
const EPSILON_METERS = 1

function annotationFeature(annotation) {
  const geometry = annotation?.geometry
  if (!geometry) return null
  if (annotation.shapeType === 'Circle') {
    return turf.circle(geometry.center, Number(geometry.radiusM) / 1000, { steps: 96, units: 'kilometers' })
  }
  if (!['Point', 'LineString', 'Polygon'].includes(geometry.type)) return null
  try { return turf.feature(geometry) } catch { return null }
}

function coordinatesInRange(value) {
  if (!Array.isArray(value)) return false
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    return value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90
  }
  return value.length > 0 && value.every(coordinatesInRange)
}

export function isValidOrganizationGeometry(geometry, allowedTypes = ['Point', 'LineString', 'Polygon', 'MultiPolygon']) {
  if (!allowedTypes.includes(geometry?.type) || !coordinatesInRange(geometry.coordinates)) return false
  try {
    const candidate = turf.feature(geometry)
    return turf.booleanValid(candidate) && (geometry.type === 'Point' || turf.length(candidate, { units: 'meters' }) > 0
      || ['Polygon', 'MultiPolygon'].includes(geometry.type) && turf.area(candidate) > 0)
  } catch { return false }
}

function containsOrTouches(feature, point) {
  const type = feature?.geometry?.type
  if (type === 'Polygon' || type === 'MultiPolygon') return turf.booleanPointInPolygon(point, feature, { ignoreBoundary: false })
  if (type === 'Point') return turf.distance(point, feature, { units: 'meters' }) <= EPSILON_METERS
  if (type === 'LineString' || type === 'MultiLineString') return turf.pointToLineDistance(point, feature, { units: 'meters' }) <= EPSILON_METERS
  return false
}

function exactIntersectionStations(route, feature) {
  const stations = []
  const type = feature.geometry.type
  if (type === 'Point') {
    if (turf.pointToLineDistance(feature, route, { units: 'meters' }) <= EPSILON_METERS) {
      stations.push(turf.nearestPointOnLine(route, feature, { units: 'kilometers' }).properties.location)
    }
    return stations
  }
  const boundary = type === 'Polygon' || type === 'MultiPolygon'
    ? turf.polygonToLine(feature)
    : feature
  try {
    for (const point of turf.lineIntersect(route, boundary).features) {
      stations.push(turf.nearestPointOnLine(route, point, { units: 'kilometers' }).properties.location)
    }
  } catch { /* malformed geometry is treated as map-only */ }
  return stations
}

function interpolateIntervals(route, feature) {
  const totalKm = turf.length(route, { units: 'kilometers' })
  if (!(totalKm > 0)) return []
  const stepKm = Math.max(0.02, Math.min(0.2, totalKm / 4000))
  const exact = exactIntersectionStations(route, feature)
  const stations = new Set([0, totalKm, ...exact].map((value) => Math.max(0, Math.min(totalKm, Number(value))).toFixed(6)))
  for (let km = stepKm; km < totalKm; km += stepKm) stations.add(km.toFixed(6))
  const ordered = [...stations].map(Number).sort((a, b) => a - b)
  const intervals = []
  let start = null
  let end = null
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index]
    const right = ordered[index + 1]
    const middle = turf.along(route, (left + right) / 2, { units: 'kilometers' })
    if (containsOrTouches(feature, middle)) {
      if (start == null) start = left
      end = right
    } else if (start != null) {
      intervals.push([start, end])
      start = null
      end = null
    }
  }
  if (start != null) intervals.push([start, end])
  if (intervals.length === 0 && exact.length) {
    return exact.map((km) => [km, km])
  }
  return intervals
}

function projectOrganizationAnnotationsLegacy({ annotations = [], routeGeometry } = {}) {
  let route
  try { route = turf.feature(routeGeometry) } catch { route = null }
  if (!route || route.geometry?.type !== 'LineString' || route.geometry.coordinates.length < 2) return []
  return annotations.map((annotation) => {
    const feature = annotationFeature(annotation)
    const intervals = feature ? interpolateIntervals(route, feature) : []
    return {
      sourceKind: 'organization_annotation',
      itemId: annotation.id,
      title: annotation.title,
      authorUserId: annotation.authorUserId ?? null,
      geometry: annotation.geometry ?? null,
      altitudeRangeFt: annotation.altitudeMinFt == null ? null : {
        from: annotation.altitudeMinFt,
        to: annotation.altitudeMaxFt,
        reference: 'AMSL',
      },
      routeIntervals: intervals.map(([fromKm, toKm]) => ({
        fromNm: Number((fromKm * NM_PER_KM).toFixed(3)),
        toNm: Number((toKm * NM_PER_KM).toFixed(3)),
      })),
      routeRelation: feature ? (intervals.length ? 'intersects' : 'outside') : 'text_only',
      verticalRelation: annotation.altitudeMinFt == null ? 'position_only' : 'bounded',
    }
  })
}

export function projectOrganizationAnnotations(options = {}) {
  return projectSharedOrganizationAnnotations({ ...options, toleranceMeters: 1 })
}

export default { projectOrganizationAnnotations }
