import { useEffect, useRef } from 'react'
import { boundsForFeatures, buildOrganizationMapGeoJson } from '../lib/organizationMapModel.js'
import { pinnedFrameDescriptors } from '../lib/pinnedMapDataSelection.js'

export const ORGANIZATION_MAP_IDS = Object.freeze({
  routeSource: 'organization-route',
  linkedSource: 'organization-linked',
  routeLayer: 'organization-route-line',
  fillLayer: 'organization-linked-fill',
  lineLayer: 'organization-linked-line',
  pointLayer: 'organization-linked-point',
  activeFillLayer: 'organization-linked-active-fill',
  activeLineLayer: 'organization-linked-active-line',
  activePointLayer: 'organization-linked-active-point',
  radarSource: 'organization-pinned-radar',
  radarLayer: 'organization-pinned-radar-layer',
  satelliteSource: 'organization-pinned-satellite',
  satelliteLayer: 'organization-pinned-satellite-layer',
})

const interactiveLayers = [
  ORGANIZATION_MAP_IDS.activeFillLayer,
  ORGANIZATION_MAP_IDS.activeLineLayer,
  ORGANIZATION_MAP_IDS.activePointLayer,
  ORGANIZATION_MAP_IDS.fillLayer,
  ORGANIZATION_MAP_IDS.lineLayer,
  ORGANIZATION_MAP_IDS.pointLayer,
]

function addLayer(map, definition, beforeId) {
  if (!map.getLayer(definition.id)) map.addLayer(definition, beforeId)
}

function ensureLayers(map, model) {
  const routeSource = map.getSource(ORGANIZATION_MAP_IDS.routeSource)
  if (routeSource) routeSource.setData(model.route)
  else map.addSource(ORGANIZATION_MAP_IDS.routeSource, { type: 'geojson', data: model.route })
  const linkedSource = map.getSource(ORGANIZATION_MAP_IDS.linkedSource)
  if (linkedSource) linkedSource.setData(model.linked)
  else map.addSource(ORGANIZATION_MAP_IDS.linkedSource, { type: 'geojson', data: model.linked })

  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.routeLayer,
    type: 'line',
    source: ORGANIZATION_MAP_IDS.routeSource,
    paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.fillLayer,
    type: 'fill',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['case', ['boolean', ['get', 'authored'], false], '#2563eb', '#f59e0b'],
      'fill-opacity': 0.11,
    },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.lineLayer,
    type: 'line',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
    paint: {
      'line-color': ['case', ['boolean', ['get', 'authored'], false], '#2563eb', '#d97706'],
      'line-width': 2,
      'line-dasharray': [3, 2],
    },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.pointLayer,
    type: 'circle',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': ['case', ['boolean', ['get', 'authored'], false], '#2563eb', '#f59e0b'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.activeFillLayer,
    type: 'fill',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'itemKey'], '']],
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.25 },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.activeLineLayer,
    type: 'line',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['all', ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], ['==', ['get', 'itemKey'], '']],
    paint: { 'line-color': '#1d4ed8', 'line-width': 5 },
  })
  addLayer(map, {
    id: ORGANIZATION_MAP_IDS.activePointLayer,
    type: 'circle',
    source: ORGANIZATION_MAP_IDS.linkedSource,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'itemKey'], '']],
    paint: { 'circle-radius': 11, 'circle-color': '#2563eb', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
  })
}

function updateActiveFilters(map, activeItemId) {
  const active = activeItemId || ''
  const geometryFilters = {
    [ORGANIZATION_MAP_IDS.activeFillLayer]: ['==', ['geometry-type'], 'Polygon'],
    [ORGANIZATION_MAP_IDS.activeLineLayer]: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
    [ORGANIZATION_MAP_IDS.activePointLayer]: ['==', ['geometry-type'], 'Point'],
  }
  for (const [layerId, geometryFilter] of Object.entries(geometryFilters)) {
    if (map.getLayer(layerId)) map.setFilter(layerId, ['all', geometryFilter, ['==', ['get', 'itemKey'], active]])
  }
}

function imageCoordinates(bounds) {
  if (Array.isArray(bounds) && bounds.length === 2 && bounds.every((item) => Array.isArray(item) && item.length >= 2)) {
    // Server metadata contract is [[latMin, lonMin], [latMax, lonMax]].
    const latMin = Number(bounds[0][0]); const lonMin = Number(bounds[0][1])
    const latMax = Number(bounds[1][0]); const lonMax = Number(bounds[1][1])
    if ([latMin, lonMin, latMax, lonMax].every(Number.isFinite)) {
      return [[lonMin, latMax], [lonMax, latMax], [lonMax, latMin], [lonMin, latMin]]
    }
  }
  const latMin = Number(bounds?.latMin); const lonMin = Number(bounds?.lonMin)
  const latMax = Number(bounds?.latMax); const lonMax = Number(bounds?.lonMax)
  return [latMin, lonMin, latMax, lonMax].every(Number.isFinite)
    ? [[lonMin, latMax], [lonMax, latMax], [lonMax, latMin], [lonMin, latMin]] : null
}

function removePinnedFrame(map, kind) {
  const layerId = ORGANIZATION_MAP_IDS[`${kind}Layer`]
  const sourceId = ORGANIZATION_MAP_IDS[`${kind}Source`]
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

function syncPinnedFrames(map, mapDataSelection) {
  const frames = new Map(pinnedFrameDescriptors(mapDataSelection).map((frame) => [frame.kind, frame]))
  for (const kind of ['satellite', 'radar']) {
    const frame = frames.get(kind)
    const coordinates = imageCoordinates(frame?.bounds)
    removePinnedFrame(map, kind)
    if (!frame || !coordinates) continue
    const sourceId = ORGANIZATION_MAP_IDS[`${kind}Source`]
    const layerId = ORGANIZATION_MAP_IDS[`${kind}Layer`]
    map.addSource(sourceId, { type: 'image', url: frame.url, coordinates })
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': kind === 'radar' ? 0.72 : 0.62, 'raster-fade-duration': 0 },
    }, map.getLayer(ORGANIZATION_MAP_IDS.routeLayer) ? ORGANIZATION_MAP_IDS.routeLayer : undefined)
  }
}

function removeLayers(map) {
  removePinnedFrame(map, 'radar')
  removePinnedFrame(map, 'satellite')
  for (const layerId of [...interactiveLayers, ORGANIZATION_MAP_IDS.routeLayer]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
  }
  if (map.getSource(ORGANIZATION_MAP_IDS.linkedSource)) map.removeSource(ORGANIZATION_MAP_IDS.linkedSource)
  if (map.getSource(ORGANIZATION_MAP_IDS.routeSource)) map.removeSource(ORGANIZATION_MAP_IDS.routeSource)
}

function fitFeaturesWhenOutside(map, features, options = {}) {
  const bounds = boundsForFeatures(features)
  if (!bounds) return
  const current = map.getBounds?.()
  const visible = current && features.flatMap((feature) => boundsForFeatures([feature]) || [])
    .every((coordinate) => current.contains(coordinate))
  if (!visible) map.fitBounds(bounds, { padding: 56, duration: 350, maxZoom: 11, ...options })
}

export default function useOrganizationMapAdapter({
  map,
  styleRevision = 0,
  bundle = null,
  situation = null,
  annotations = [],
  activeItemId = null,
  pinnedItemId = null,
  onPreviewItem,
  onClearPreview,
  onPinItem,
  onMapClick,
  drawing = false,
  onFrameError,
} = {}) {
  const model = buildOrganizationMapGeoJson({ bundle, situation, annotations })
  const modelRef = useRef(model)
  const dataRevisionRef = useRef(0)
  const priorDataRef = useRef({ bundle: null, situation: null, annotations: null })
  if (priorDataRef.current.bundle !== bundle || priorDataRef.current.situation !== situation
    || priorDataRef.current.annotations !== annotations) {
    dataRevisionRef.current += 1
    priorDataRef.current = { bundle, situation, annotations }
  }
  const mapStateRef = useRef({ activeItemId, mapDataSelection: bundle?.mapDataSelection, dataRevision: dataRevisionRef.current })
  modelRef.current = model
  mapStateRef.current = { activeItemId, mapDataSelection: bundle?.mapDataSelection, dataRevision: dataRevisionRef.current }
  const syncMapRef = useRef(null)
  const callbacksRef = useRef({ onPreviewItem, onClearPreview, onPinItem, onMapClick, onFrameError, drawing })
  callbacksRef.current = { onPreviewItem, onClearPreview, onPinItem, onMapClick, onFrameError, drawing }

  useEffect(() => {
    if (!map) return undefined
    let installed = false
    let appliedDataRevision = -1
    let appliedActiveItemId
    const syncLatest = () => {
      // Tile/image requests may keep isStyleLoaded false after setStyle. Sources
      // can be installed once the style can be serialized, before all tiles arrive.
      try { if (!map.getStyle?.()) return } catch { return }
      const current = modelRef.current
      const state = mapStateRef.current
      // Mapbox may apply setStyle as a diff without emitting style.load.
      if (installed && !map.getSource(ORGANIZATION_MAP_IDS.routeSource)) {
        installed = false
        appliedDataRevision = -1
        appliedActiveItemId = undefined
      }
      if (!installed) {
        ensureLayers(map, current)
        installed = true
      }
      if (appliedDataRevision !== state.dataRevision) {
        map.getSource(ORGANIZATION_MAP_IDS.routeSource)?.setData(current.route)
        map.getSource(ORGANIZATION_MAP_IDS.linkedSource)?.setData(current.linked)
        syncPinnedFrames(map, state.mapDataSelection)
        appliedDataRevision = state.dataRevision
      }
      if (appliedActiveItemId !== state.activeItemId) {
        updateActiveFilters(map, state.activeItemId)
        appliedActiveItemId = state.activeItemId
      }
    }
    const reinstall = () => {
      installed = false
      appliedDataRevision = -1
      appliedActiveItemId = undefined
      syncLatest()
    }
    syncMapRef.current = syncLatest

    const onPointerMove = (event) => {
      const feature = event.features?.[0]
      map.getCanvas().style.cursor = feature ? 'pointer' : ''
      if (feature?.properties?.itemKey) callbacksRef.current.onPreviewItem?.(feature.properties.itemKey)
    }
    const onPointerLeave = () => {
      map.getCanvas().style.cursor = ''
      callbacksRef.current.onClearPreview?.()
    }
    const onFeatureClick = (event) => {
      if (callbacksRef.current.drawing) return
      const itemKey = event.features?.[0]?.properties?.itemKey
      if (itemKey) callbacksRef.current.onPinItem?.(itemKey)
    }
    const onCanvasClick = (event) => {
      if (callbacksRef.current.drawing && event?.lngLat) {
        callbacksRef.current.onMapClick?.({ lon: event.lngLat.lng, lat: event.lngLat.lat })
      }
    }
    const onMapError = (event) => {
      const sourceId = String(event?.sourceId || event?.source?.id || '')
      const message = String(event?.error?.message || event?.message || '')
      for (const kind of ['radar', 'satellite']) {
        if (sourceId === ORGANIZATION_MAP_IDS[`${kind}Source`] || message.includes(`/${kind}/`)) {
          callbacksRef.current.onFrameError?.(kind, /410|expired|만료/i.test(message) ? 'expired' : 'load_failed')
        }
      }
    }
    map.on('style.load', reinstall)
    map.on('idle', syncLatest)
    // Animated wind can keep the map out of idle after a style replacement.
    // Revision guards make render retries cheap and apply each snapshot once.
    map.on('render', syncLatest)
    for (const layerId of interactiveLayers) {
      map.on('mousemove', layerId, onPointerMove)
      map.on('mouseleave', layerId, onPointerLeave)
      map.on('click', layerId, onFeatureClick)
    }
    map.on('click', onCanvasClick)
    map.on('error', onMapError)
    syncLatest()
    return () => {
      if (syncMapRef.current === syncLatest) syncMapRef.current = null
      map.off('style.load', reinstall)
      map.off('idle', syncLatest)
      map.off('render', syncLatest)
      for (const layerId of interactiveLayers) {
        map.off('mousemove', layerId, onPointerMove)
        map.off('mouseleave', layerId, onPointerLeave)
        map.off('click', layerId, onFeatureClick)
      }
      map.off('click', onCanvasClick)
      map.off('error', onMapError)
      // Do not remove after a style replacement: Mapbox already discarded the old style.
      if (map.isStyleLoaded?.()) removeLayers(map)
    }
  }, [map, styleRevision])

  useEffect(() => {
    syncMapRef.current?.()
  }, [map, styleRevision, bundle, situation, annotations]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncMapRef.current?.()
  }, [map, styleRevision, activeItemId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !map.isStyleLoaded?.() || !model.route.features.length) return
    fitFeaturesWhenOutside(map, model.route.features, { duration: 0, maxZoom: 9 })
  }, [map, styleRevision, bundle?.bundleId, bundle?.flight?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !map.isStyleLoaded?.() || model.route.features.length || !model.linked.features.length) return
    fitFeaturesWhenOutside(map, model.linked.features, { duration: 0, maxZoom: 9 })
  }, [map, styleRevision, situation?.sourceRevision, annotations]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !map.isStyleLoaded?.() || !pinnedItemId) return
    const selected = model.linked.features.filter((feature) => feature.properties?.itemKey === pinnedItemId)
    fitFeaturesWhenOutside(map, selected)
  }, [map, styleRevision, pinnedItemId]) // eslint-disable-line react-hooks/exhaustive-deps
}
