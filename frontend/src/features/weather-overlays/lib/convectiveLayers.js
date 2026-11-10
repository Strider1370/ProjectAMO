import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import { MAP_LAYER_OPACITY } from './mapLayerOpacity.js'

export const CTPS_SOURCE = 'gk2a-ctps-source'
export const CTPS_LAYER = 'gk2a-ctps-raster'

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
  if (!map.getLayer(CTPS_LAYER)) map.addLayer({ id: CTPS_LAYER, type: 'raster', source: CTPS_SOURCE, slot: 'middle', paint: { 'raster-opacity': MAP_LAYER_OPACITY.ctps, 'raster-fade-duration': 0 } })
  return true
}

export function syncConvectiveLayers(map, { ctpsFrame, minFl = 'all', ctpsVisible }) {
  const hasCtps = ensureCtps(map, ctpsFrame && { ...ctpsFrame, minFl })
  setMapLayerVisible(map, CTPS_LAYER, Boolean(ctpsVisible && hasCtps))
}
