export function setLayerVisibility(map, layer, isVisible) {
  if (!map || !layer) return
  const visibility = isVisible ? 'visible' : 'none'
  const ids = [
    layer.fillLayerId,
    layer.maskLayerId,
    layer.hoverLayerId,
    layer.pointMaskLayerId,
    layer.pointLayerId,
    layer.lineLayerId,
    layer.routeLabelLayerId,
    layer.tickLayerId,
    layer.externalLabelLayerId,
    layer.internalLabelLayerId,
    layer.labelLayerId,
    layer.pointLabelLayerId ? (layer.pointLabelMaskLayerId ?? `${layer.pointLabelLayerId}-mask`) : null,
    layer.pointLabelLayerId,
  ].filter(Boolean)

  ids.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
  })

  layer.neighborBoundaries?.forEach((boundary) => {
    if (map.getLayer(boundary.tickLayerId)) {
      map.setLayoutProperty(boundary.tickLayerId, 'visibility', visibility)
    }
  })
}

export function setMapLayerVisible(map, layerId, isVisible) {
  if (!map || !layerId || !map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
}

export function addOrUpdateGeoJsonSource(map, sourceId, data) {
  const source = map.getSource(sourceId)
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
}
