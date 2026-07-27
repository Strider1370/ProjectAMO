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

export function addLazyGeoJsonSource(map, sourceId, dataUrl, { eager = false, shareJson = false, ...sourceOptions } = {}) {
  if (map.getSource(sourceId)) return
  // shareJson이면 URL을 mapbox에 넘기지 않는다 — 넘기는 순간 워커가 자기 몫으로 또 받는다.
  // 빈 상태로 만들어 두고 공유 로더가 받아온 객체를 넣는다.
  const initialData = eager && !shareJson ? dataUrl : EMPTY_FEATURE_COLLECTION
  map.addSource(sourceId, { type: 'geojson', data: initialData, ...sourceOptions })
  if (!eager) return

  getLoadedSources(map).add(sourceId)
  if (!shareJson) return
  loadGeoJsonOnce(dataUrl)
    .then((data) => { const source = map.getSource(sourceId); if (source) source.setData(data) })
    .catch(() => getLoadedSources(map).delete(sourceId)) // 실패하면 가시화 시 다시 시도
}

// URL 단위로 한 번만 받아 공유한다. 실패는 캐시하지 않는다(다음 호출이 재시도).
const geoJsonLoads = new Map()

export function loadGeoJsonOnce(url) {
  const pending = geoJsonLoads.get(url)
  if (pending) return pending

  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Failed to load ${url}`)
    return res.json()
  })
  promise.catch(() => geoJsonLoads.delete(url))
  geoJsonLoads.set(url, promise)
  return promise
}

// 보통은 URL을 그대로 넘겨 mapbox 워커가 받고 파싱하게 둔다(메인스레드를 안 막는다).
// shareJson인 레이어만 예외: 자바스크립트 쪽에도 같은 파일이 필요해(FIR 틱 오버레이가
// 좌표로 눈금을 계산한다) URL을 넘기면 워커와 앱이 같은 파일을 각각 받는다. 첫 방문에
// 둘이 동시에 나가므로 브라우저 캐시로도 안 막힌다. 이때만 한 번 받아 객체를 공유한다.
export function ensureGeoJsonSourceLoaded(map, sourceId, dataUrl, { shareJson = false } = {}) {
  const loaded = getLoadedSources(map)
  if (loaded.has(sourceId)) return
  const source = map.getSource(sourceId)
  if (!source) return
  loaded.add(sourceId) // 중복 진입 방지 — shareJson은 비동기라 먼저 표시한다
  if (shareJson) {
    loadGeoJsonOnce(dataUrl)
      .then((data) => { if (map.getSource(sourceId)) source.setData(data) })
      .catch(() => { loaded.delete(sourceId) }) // 실패하면 다시 시도할 수 있게
    return
  }
  source.setData(dataUrl)
}

export function setLayerVisibility(map, layer, isVisible) {
  if (!map || !layer) return
  const visibility = isVisible ? 'visible' : 'none'

  if (isVisible && layer.sourceId && layer.dataUrl) {
    ensureGeoJsonSourceLoaded(map, layer.sourceId, layer.dataUrl, { shareJson: layer.shareJson })
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
