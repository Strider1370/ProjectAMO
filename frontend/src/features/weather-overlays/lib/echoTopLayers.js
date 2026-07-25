import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const ECHO_TOP_SOURCE = 'radar-echotop-source'
export const ECHO_TOP_LAYER = 'radar-echotop-raster'

function imageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  return [south, west, north, east].every(Number.isFinite)
    ? [[west, north], [east, north], [east, south], [west, south]]
    : null
}

export function syncEchoTopLayer(map, { frame, visible }) {
  const url = frame?.path
  const coordinates = imageCoordinates(frame?.bounds)
  const usable = Boolean(url && coordinates)

  if (usable) {
    const source = map.getSource(ECHO_TOP_SOURCE)
    if (source?.updateImage) source.updateImage({ url, coordinates })
    else if (!source) map.addSource(ECHO_TOP_SOURCE, { type: 'image', url, coordinates })
    if (!map.getLayer(ECHO_TOP_LAYER)) {
      map.addLayer({ id: ECHO_TOP_LAYER, type: 'raster', source: ECHO_TOP_SOURCE, slot: 'middle', paint: { 'raster-opacity': 0.65, 'raster-fade-duration': 0 } })
    }
  }

  const shown = Boolean(usable && visible)
  if (map.getLayer(ECHO_TOP_LAYER)) setMapLayerVisible(map, ECHO_TOP_LAYER, shown)
  return shown
}
