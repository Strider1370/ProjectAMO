// Lazy geoJSON source loading: sources start empty and only fetch their real
// data the first time a layer using them is actually made visible, so hidden
// layers stop downloading megabytes of data nobody asked to see.
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] }
const loadedSourcesByMap = new WeakMap()

function getLoadedSources(map) {
  let loaded = loadedSourcesByMap.get(map)
  if (!loaded) {
    loaded = new Set()
    loadedSourcesByMap.set(map, loaded)
  }
  return loaded
}

// Call once per style load, before adding any lazy sources for that style —
// a style reload tears down all sources, so previous load-state is stale.
export function resetLazyGeoJsonSources(map) {
  loadedSourcesByMap.delete(map)
}

export function addLazyGeoJsonSource(map, sourceId, dataUrl, { eager = false, ...sourceOptions } = {}) {
  if (map.getSource(sourceId)) return
  map.addSource(sourceId, { type: 'geojson', data: eager ? dataUrl : EMPTY_FEATURE_COLLECTION, ...sourceOptions })
  if (eager) getLoadedSources(map).add(sourceId)
}

export function ensureGeoJsonSourceLoaded(map, sourceId, dataUrl) {
  const loaded = getLoadedSources(map)
  if (loaded.has(sourceId)) return
  const source = map.getSource(sourceId)
  if (!source) return
  source.setData(dataUrl)
  loaded.add(sourceId)
}

export function setLayerVisibility(map, layer, isVisible) {
  if (!map || !layer) return
  const visibility = isVisible ? 'visible' : 'none'

  if (isVisible && layer.sourceId && layer.dataUrl) {
    ensureGeoJsonSourceLoaded(map, layer.sourceId, layer.dataUrl)
  }
  const ids = [
    layer.fillLayerId,
    layer.activeFillLayerId,
    layer.activeLineLayerId,
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
