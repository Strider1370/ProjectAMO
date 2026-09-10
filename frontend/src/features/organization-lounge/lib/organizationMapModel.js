import { linkedItemKey } from './linkedSelection.js'

const EMPTY_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] })

function asGeometry(value) {
  if (value?.type === 'Feature') return value.geometry
  return value?.type && value.coordinates ? value : null
}

function firstGeometry(...values) {
  for (const value of values) {
    const geometry = asGeometry(value)
    if (geometry) return geometry
  }
  return null
}

export function getOrganizationRouteGeometry(bundle) {
  const samples = bundle?.verticalProfile?.axis?.samples
  return firstGeometry(
    bundle?.flight?.profileRequest?.routeGeometry,
    bundle?.flight?.snapshot?.profileRequest?.routeGeometry,
    bundle?.flight?.snapshot?.base?.routeGeometry,
    bundle?.flight?.snapshot?.routeGeometry,
    bundle?.routeGeometry,
    Array.isArray(samples) && samples.length > 1 ? {
      type: 'LineString',
      coordinates: samples.filter((sample) => Number.isFinite(sample?.lon) && Number.isFinite(sample?.lat))
        .map((sample) => [sample.lon, sample.lat]),
    } : null,
  )
}

export function circleGeometry(circle, steps = 64) {
  const center = circle?.center
  const radiusMeters = Number(circle?.radiusMeters)
  if (!Array.isArray(center) || center.length < 2 || !Number.isFinite(Number(center[0]))
    || !Number.isFinite(Number(center[1])) || !Number.isFinite(radiusMeters) || radiusMeters < 0) return null
  const lon = Number(center[0]) * Math.PI / 180
  const lat = Number(center[1]) * Math.PI / 180
  const angular = radiusMeters / 6371008.8
  const coordinates = []
  for (let index = 0; index <= steps; index += 1) {
    const bearing = index / steps * Math.PI * 2
    const targetLat = Math.asin(Math.sin(lat) * Math.cos(angular)
      + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing))
    const targetLon = lon + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
      Math.cos(angular) - Math.sin(lat) * Math.sin(targetLat),
    )
    coordinates.push([targetLon * 180 / Math.PI, targetLat * 180 / Math.PI])
  }
  return { type: 'Polygon', coordinates: [coordinates] }
}

function featureForItem(item) {
  const legacyCircle = item?.shapeType === 'Circle' || (item?.geometry?.center && (item?.geometry?.radiusM != null || item?.geometry?.radiusMeters != null)) ? {
    center: item.geometry?.center,
    radiusMeters: item.geometry?.radiusMeters ?? item.geometry?.radiusM,
  } : null
  const geometry = circleGeometry(item?.circle || legacyCircle) || asGeometry(item?.geometry)
  if (!geometry) return null
  const itemKey = linkedItemKey(item)
  return {
    type: 'Feature',
    id: itemKey,
    properties: {
      itemKey,
      id: String(item.id ?? item.itemId),
      sourceKind: item.sourceKind || item.source || 'annotation',
      title: item.title || item.summary || '',
      authored: ['annotation', 'user', 'organization_annotation'].includes(item.sourceKind || item.source || 'annotation'),
    },
    geometry,
  }
}

export function briefingHazardLinkedItems(bundle) {
  const hazards = bundle?.briefing?.sections?.adverse?.hazards || []
  const projected = bundle?.linkedItems || []
  return hazards.map((hazard, index) => {
    const linked = projected.find((item) => hazard.sourceId != null && String(item.id ?? item.sourceId) === String(hazard.sourceId)
      && String(item.sourceKind || item.source).toUpperCase() === String(hazard.source || '').toUpperCase())
    return {
      ...(linked || {}),
      ...hazard,
      sourceKind: 'weather_hazard',
      id: hazard.sourceId ?? `${hazard.source || 'weather'}:${hazard.code || 'hazard'}:${hazard.validFrom || index}`,
      title: hazard.label || hazard.code || '위험기상',
      description: [hazard.source, hazard.validFrom && hazard.validTo ? `${hazard.validFrom}–${hazard.validTo}` : null].filter(Boolean).join(' · '),
      geometry: hazard.geometry || linked?.geometry || null,
      altitude: hazard.bandFt ? { minFt: hazard.bandFt.lowFt, maxFt: hazard.bandFt.highFt, reference: 'AMSL' } : null,
      distanceIntervals: hazard.horizontalExposure?.intervals || (hazard.routeIntervalNm ? [hazard.routeIntervalNm] : []),
    }
  })
}

function situationInterestItems(situation) {
  if (situation?.interests?.length) return situation.interests
  return (situation?.regions || []).flatMap((region) => region?.interest ? [{
    ...region.interest,
    sourceKind: 'organization_interest',
    title: region.interest.name,
  }] : [])
}

function situationEventItems(situation) {
  if (situation?.linkedItems?.length) return situation.linkedItems
  if (situation?.events?.length) return situation.events.map((event) => ({
    id: event.eventKey ?? event.id,
    sourceKind: event.kind,
    title: event.payload?.title,
    geometry: event.payload?.advisory?.geometry ?? event.payload?.interest?.geometry ?? null,
    circle: event.payload?.interest?.kind === 'airport' && event.payload?.interest?.geometry?.type === 'Point'
      ? { center: event.payload.interest.geometry.coordinates, radiusMeters: Number(event.payload.radiusKm || 20) * 1000 }
      : null,
  }))
  return (situation?.regions || []).flatMap((region) => (region?.advisories || []).map(({ kind, item }, index) => ({
    id: item?.id ?? `${region.interest?.id ?? 'region'}:${kind}:${index}`,
    sourceKind: kind,
    title: item?.phenomenon_label ?? item?.phenomenon_code ?? String(kind || 'advisory').toUpperCase(),
    geometry: item?.geometry ?? region.interest?.geometry ?? null,
  })))
}

export function organizationLinkedItems({ bundle, situation, annotations = [] } = {}) {
  const bundleItems = (bundle?.linkedItems || []).filter((item) => !['sigmet', 'airmet', 'weather', 'weather_hazard']
    .includes(String(item.sourceKind || item.source || '').toLowerCase()))
  const candidates = [
    ...bundleItems,
    ...briefingHazardLinkedItems(bundle),
    ...situationEventItems(situation),
    ...(situation?.alerts || []),
    ...situationInterestItems(situation),
    ...annotations,
  ]
  const unique = new Map()
  for (const item of candidates) {
    const key = linkedItemKey(item)
    if (key && !unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()]
}

export function buildOrganizationMapGeoJson({ bundle, situation, annotations = [] } = {}) {
  const routeGeometry = getOrganizationRouteGeometry(bundle)
  const linkedFeatures = organizationLinkedItems({ bundle, situation, annotations }).map(featureForItem).filter(Boolean)
  return {
    route: routeGeometry ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: routeGeometry }],
    } : EMPTY_COLLECTION,
    linked: { type: 'FeatureCollection', features: linkedFeatures },
  }
}

export function geometryCoordinates(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(geometryCoordinates)
  const visit = (value) => Array.isArray(value?.[0]) ? value.flatMap(visit) :
    Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
      ? [[Number(value[0]), Number(value[1])]] : []
  return visit(geometry.coordinates)
}

export function boundsForFeatures(features = []) {
  const coordinates = features.flatMap((feature) => geometryCoordinates(feature?.geometry || feature))
  if (!coordinates.length) return null
  const lons = coordinates.map(([lon]) => lon)
  const lats = coordinates.map(([, lat]) => lat)
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}
