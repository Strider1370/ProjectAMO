export function buildImageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  if (![south, west, north, east].every(Number.isFinite)) return null
  return [[west, north], [east, north], [east, south], [west, south]]
}

export function addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity }) {
  const coordinates = buildImageCoordinates(frame?.bounds)
  if (!frame?.path || !coordinates) return false

  const image = { url: frame.path, coordinates }
  const source = map.getSource(sourceId)

  if (source?.updateImage) {
    source.updateImage(image)
  } else if (!source) {
    map.addSource(sourceId, { type: 'image', ...image })
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      slot: 'middle',
      paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
    })
  }

  return true
}
