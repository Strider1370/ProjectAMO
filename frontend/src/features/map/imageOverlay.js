export function buildImageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  if (![south, west, north, east].every(Number.isFinite)) return null
  return [[west, north], [east, north], [east, south], [west, south]]
}

const imageOverlayState = new WeakMap()

function imageOverlayKey(image) {
  return `${image.url}|${JSON.stringify(image.coordinates)}`
}

function hashImageOverlayKey(key) {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function frameSourceId(sourceId, key) {
  return `${sourceId}-${hashImageOverlayKey(key)}`
}

function rasterLayer(layerId, sourceId, opacity) {
  return {
    id: layerId,
    type: 'raster',
    source: sourceId,
    slot: 'middle',
    paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
  }
}

export function addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity }) {
  const coordinates = buildImageCoordinates(frame?.bounds)
  if (!frame?.path || !coordinates) return false

  const image = { url: frame.path, coordinates }
  const key = imageOverlayKey(image)
  const currentSourceId = frameSourceId(sourceId, key)
  let mapState = imageOverlayState.get(map)
  if (!mapState) {
    mapState = new Map()
    imageOverlayState.set(map, mapState)
  }

  if (!map.getSource(currentSourceId)) {
    map.addSource(currentSourceId, { type: 'image', ...image })
  }

  const layer = map.getLayer(layerId)
  const previous = mapState.get(sourceId)
  if (!layer) {
    map.addLayer(rasterLayer(layerId, currentSourceId, opacity))
  } else if (previous?.sourceId !== currentSourceId) {
    map.removeLayer(layerId)
    map.addLayer(rasterLayer(layerId, currentSourceId, opacity))
    if (previous?.sourceId && map.getSource(previous.sourceId)) {
      map.removeSource(previous.sourceId)
    }
  }
  mapState.set(sourceId, { key, sourceId: currentSourceId })

  return true
}
