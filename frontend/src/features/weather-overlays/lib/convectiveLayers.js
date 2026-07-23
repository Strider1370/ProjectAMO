import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const CTPS_SOURCE = 'gk2a-ctps-source'
export const CTPS_LAYER = 'gk2a-ctps-raster'
export const CI_SOURCE = 'gk2a-ci-source'
export const CI_LAYER = 'gk2a-ci-fill'
const EMPTY = { type: 'FeatureCollection', features: [] }

function coordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  return [south, west, north, east].every(Number.isFinite)
    ? [[west, north], [east, north], [east, south], [west, south]]
    : null
}

function ensureCtps(map, frame) {
  const url = frame?.images?.[frame.minFl] || frame?.images?.[String(frame.minFl)] || frame?.path
  const imageCoordinates = coordinates(frame?.bounds)
  if (!url || !imageCoordinates) return false
  const source = map.getSource(CTPS_SOURCE)
  if (source?.updateImage) source.updateImage({ url, coordinates: imageCoordinates })
  else if (!source) map.addSource(CTPS_SOURCE, { type: 'image', url, coordinates: imageCoordinates })
  else {
    if (map.getLayer(CTPS_LAYER)) map.removeLayer(CTPS_LAYER)
    map.removeSource?.(CTPS_SOURCE)
    map.addSource(CTPS_SOURCE, { type: 'image', url, coordinates: imageCoordinates })
  }
  if (!map.getLayer(CTPS_LAYER)) map.addLayer({ id: CTPS_LAYER, type: 'raster', source: CTPS_SOURCE, slot: 'middle', paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 } })
  map.moveLayer?.(CI_LAYER)
  return true
}

export function installConvectiveLayers(map) {
  addOrUpdateGeoJsonSource(map, CI_SOURCE, EMPTY)
  if (!map.getLayer(CI_LAYER)) map.addLayer({ id: CI_LAYER, type: 'fill', source: CI_SOURCE, slot: 'top', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 } })
  setMapLayerVisible(map, CI_LAYER, false)
}

export function syncConvectiveLayers(map, { ciFrame, ctpsFrame, minFl = 'all', ciVisible, ctpsVisible }) {
  installConvectiveLayers(map)
  const hasCtps = ensureCtps(map, ctpsFrame && { ...ctpsFrame, minFl })
  map.getSource(CI_SOURCE)?.setData(ciVisible && ciFrame?.path ? ciFrame.path : EMPTY)
  setMapLayerVisible(map, CTPS_LAYER, Boolean(ctpsVisible && hasCtps))
  setMapLayerVisible(map, CI_LAYER, Boolean(ciVisible && ciFrame?.path))
}

export function queryCiAtPoint(map, point) {
  const features = map?.queryRenderedFeatures?.(point, { layers: [CI_LAYER] }) || []
  const feature = features.reduce((best, candidate) => !best || Number(candidate?.properties?.signal) > Number(best?.properties?.signal) ? candidate : best, null)
  return feature?.properties ? { ...feature.properties } : null
}
