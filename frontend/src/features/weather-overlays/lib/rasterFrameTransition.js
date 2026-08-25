import { buildImageCoordinates } from '../../map/imageOverlay.js'

function frameKey(frame) {
  const coordinates = buildImageCoordinates(frame?.bounds)
  return frame?.path && coordinates ? `${frame.path}|${JSON.stringify(coordinates)}` : null
}

function rasterLayer(id, source, opacity, rasterPaint = {}) {
  return {
    id,
    type: 'raster',
    source,
    slot: 'middle',
    paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, ...rasterPaint },
  }
}

function defaultPreload({ url }) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Unable to preload ${url}`))
    image.src = url
  })
}

function removeResource(map, sourceId, layerId) {
  if (map.getLayer?.(layerId)) map.removeLayer(layerId)
  if (map.getSource?.(sourceId)) map.removeSource(sourceId)
}

function layerBeforeId(map, layerId) {
  const layers = map.getStyle?.()?.layers || []
  const index = layers.findIndex((layer) => layer.id === layerId)
  return index >= 0 ? layers[index + 1]?.id : undefined
}

function availableBeforeId(map, preferredBeforeId, layerId) {
  if (preferredBeforeId && map.getLayer?.(preferredBeforeId)) return preferredBeforeId
  return layerBeforeId(map, layerId)
}

function waitForSource(map, sourceId) {
  if (map.isSourceLoaded?.(sourceId)) return Promise.resolve(true)
  if (!map.on || !map.off) return Promise.resolve(true)
  return new Promise((resolve) => {
    let fallbackTimer = null
    const cleanup = () => {
      map.off('sourcedata', onSourceData)
      map.off('error', onError)
      if (fallbackTimer) clearTimeout(fallbackTimer)
    }
    const onSourceData = (event) => {
      if (event?.sourceId !== sourceId) return
      if (event?.isSourceLoaded === false) return
      cleanup()
      resolve(true)
    }
    const onError = (event) => {
      if (event?.sourceId !== sourceId) return
      cleanup()
      resolve(false)
    }
    map.on('sourcedata', onSourceData)
    map.on('error', onError)
    // Browsers have already decoded the image in preload. Some Mapbox image
    // sources do not emit sourcedata again after being added, so keep the
    // previous-frame error path briefly, then commit the known-good preload.
    fallbackTimer = setTimeout(() => {
      cleanup()
      resolve(Boolean(map.getSource?.(sourceId)))
    }, 100)
  })
}

export function createRasterFrameTransition(map, {
  sourceId,
  layerId,
  opacity,
  rasterPaint = {},
  beforeLayerId,
  onInstalled,
  transitionMs = 200,
  preload = defaultPreload,
} = {}) {
  let currentOpacity = opacity
  let currentRasterPaint = rasterPaint
  let currentBeforeLayerId = beforeLayerId
  let currentOnInstalled = onInstalled
  let generation = 0
  let active = null
  let incoming = null
  let timer = null
  let pending = null

  function restoreActive() {
    if (!active) return false
    const coordinates = buildImageCoordinates(active.frame.bounds)
    if (!map.getSource?.(active.sourceId)) {
      map.addSource(active.sourceId, { type: 'image', url: active.frame.path, coordinates })
    }
    if (!map.getLayer?.(layerId)) {
      map.addLayer(rasterLayer(layerId, active.sourceId, currentOpacity, currentRasterPaint), availableBeforeId(map, currentBeforeLayerId, layerId))
      currentOnInstalled?.(map, layerId)
    }
    return true
  }

  function cancel() {
    generation += 1
    if (timer) clearTimeout(timer)
    timer = null
    if (incoming) removeResource(map, incoming.sourceId, incoming.layerId)
    incoming = null
    if (pending) pending.settle(false)
    pending = null
  }

  async function sync(frame, visible) {
    if (!visible) {
      cancel()
      if (map.getLayer?.(layerId)) map.setLayoutProperty?.(layerId, 'visibility', 'none')
      return false
    }
    const key = frameKey(frame)
    if (!key) return false

    if (active?.key === key) {
      restoreActive()
      map.setPaintProperty?.(layerId, 'raster-opacity', currentOpacity)
      Object.entries(currentRasterPaint).forEach(([property, value]) => map.setPaintProperty?.(layerId, property, value))
      map.setLayoutProperty?.(layerId, 'visibility', 'visible')
      return true
    }

    if (pending?.key === key) return pending.promise

    cancel()
    const requestGeneration = generation
    let settlePending
    const pendingPromise = new Promise((resolve) => { settlePending = resolve })
    pending = { key, generation: requestGeneration, promise: pendingPromise, settle: settlePending }
    let result = false
    try {
      try {
        await preload({ url: frame.path })
      } catch {
        return false
      }
    if (requestGeneration !== generation) return false

    const next = {
      key,
      frame,
      sourceId: `${sourceId}--incoming-${requestGeneration}`,
      layerId: `${layerId}--incoming-${requestGeneration}`,
    }
    incoming = next
    try {
      const coordinates = buildImageCoordinates(frame.bounds)
      map.addSource(next.sourceId, { type: 'image', url: frame.path, coordinates })
      map.addLayer(rasterLayer(next.layerId, next.sourceId, 0, currentRasterPaint), availableBeforeId(map, currentBeforeLayerId, layerId))
    } catch {
      if (incoming === next) removeResource(map, next.sourceId, next.layerId)
      if (incoming === next) incoming = null
      return false
    }

    const sourceLoaded = await waitForSource(map, next.sourceId)
    if (requestGeneration !== generation || !sourceLoaded) {
      if (incoming === next) removeResource(map, next.sourceId, next.layerId)
      if (incoming === next) incoming = null
      return false
    }

    if (!active) {
      const beforeId = layerBeforeId(map, next.layerId)
      map.removeLayer(next.layerId)
      map.addLayer(rasterLayer(layerId, next.sourceId, currentOpacity, currentRasterPaint), beforeId || availableBeforeId(map, currentBeforeLayerId, layerId))
      currentOnInstalled?.(map, layerId)
      map.setLayoutProperty?.(layerId, 'visibility', 'visible')
      active = next
      incoming = null
      result = true
      return result
    }

    map.setPaintProperty(layerId, 'raster-opacity', 0)
    map.setLayoutProperty?.(layerId, 'visibility', 'visible')
    map.setLayoutProperty?.(next.layerId, 'visibility', 'visible')
    map.setPaintProperty(next.layerId, 'raster-opacity', currentOpacity)
    await new Promise((resolve) => { timer = setTimeout(resolve, transitionMs) })
    timer = null
    if (requestGeneration !== generation || incoming !== next) return false

    const previous = active
    const beforeId = layerBeforeId(map, layerId)
    map.removeLayer(layerId)
    map.addLayer(rasterLayer(layerId, next.sourceId, currentOpacity, currentRasterPaint), beforeId || availableBeforeId(map, currentBeforeLayerId, layerId))
    currentOnInstalled?.(map, layerId)
    map.setLayoutProperty?.(layerId, 'visibility', 'visible')
    removeResource(map, previous.sourceId, next.layerId)
    active = next
    incoming = null
    result = true
    return result
    } finally {
      if (pending?.generation === requestGeneration) {
        pending.settle(result)
        pending = null
      }
    }
  }

  function dispose() {
    cancel()
  }

  function updatePresentation(presentation = {}) {
    const { opacity: nextOpacity, rasterPaint: nextRasterPaint, beforeLayerId: nextBeforeLayerId, onInstalled: nextOnInstalled } = presentation
    if (Number.isFinite(nextOpacity)) currentOpacity = nextOpacity
    if (nextRasterPaint) currentRasterPaint = nextRasterPaint
    if ('beforeLayerId' in presentation) currentBeforeLayerId = nextBeforeLayerId
    if ('onInstalled' in presentation) currentOnInstalled = nextOnInstalled
    if (currentBeforeLayerId && map.getLayer?.(layerId) && map.getLayer?.(currentBeforeLayerId)) {
      map.moveLayer?.(layerId, currentBeforeLayerId)
    }
    if (!map.getLayer?.(layerId)) return
    map.setPaintProperty?.(layerId, 'raster-opacity', currentOpacity)
    Object.entries(currentRasterPaint).forEach(([property, value]) => map.setPaintProperty?.(layerId, property, value))
  }

  return { sync, cancel, dispose, updatePresentation }
}

const transitionsByMap = new WeakMap()

export function syncRasterFrame(map, options) {
  let transitions = transitionsByMap.get(map)
  if (!transitions) {
    transitions = new Map()
    transitionsByMap.set(map, transitions)
  }
  const key = `${options.sourceId}|${options.layerId}`
  let transition = transitions.get(key)
  if (!transition) {
    transition = createRasterFrameTransition(map, options)
    transitions.set(key, transition)
  } else {
    transition.updatePresentation(options)
  }
  void transition.sync(options.frame, options.visible)
  return transition
}
