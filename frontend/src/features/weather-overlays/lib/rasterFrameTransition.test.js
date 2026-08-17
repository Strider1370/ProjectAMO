import test from 'node:test'
import assert from 'node:assert/strict'

import { createRasterFrameTransition } from './rasterFrameTransition.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail('expected asynchronous controller step to settle')
}

function createMap() {
  const sources = new Map()
  const layers = new Map()
  const listeners = new Map()
  const layerOrder = []
  const loaded = new Set()
  return {
    sources,
    layers,
    layerOrder,
    addSource(id, source) { sources.set(id, source) },
    getSource(id) { return sources.get(id) ?? null },
    removeSource(id) { sources.delete(id) },
    addLayer(layer, beforeId) {
      layers.set(layer.id, layer)
      const index = layerOrder.indexOf(beforeId)
      if (index < 0) layerOrder.push(layer.id)
      else layerOrder.splice(index, 0, layer.id)
    },
    getLayer(id) { return layers.get(id) ?? null },
    removeLayer(id) {
      layers.delete(id)
      layerOrder.splice(layerOrder.indexOf(id), 1)
    },
    setPaintProperty(id, property, value) {
      layers.get(id).paint[property] = value
    },
    getStyle() { return { layers: layerOrder.map((id) => layers.get(id)) } },
    isSourceLoaded(id) { return loaded.has(id) },
    on(type, listener) { listeners.set(type, [...(listeners.get(type) || []), listener]) },
    off(type, listener) { listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener)) },
    emit(type, event) { (listeners.get(type) || []).forEach((listener) => listener(event)) },
    emitSourceData(id) { loaded.add(id); this.emit('sourcedata', { sourceId: id, isSourceLoaded: true }) },
  }
}

const firstFrame = { path: '/a.webp', bounds: [[30, 120], [40, 130]] }
const secondFrame = { path: '/b.webp', bounds: [[30, 120], [40, 130]] }

test('keeps the active frame visible until an incoming image and source load', async () => {
  const map = createMap()
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: async () => undefined,
  })

  const first = transition.sync(firstFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-1'))
  map.emitSourceData('radar-source--incoming-1')
  await first
  const second = transition.sync(secondFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-2'))

  assert.equal(map.getLayer('radar-layer').paint['raster-opacity'], 0.88)
  assert.equal(map.getLayer('radar-layer--incoming-2').paint['raster-opacity'], 0)
  map.emitSourceData('radar-source--incoming-2')
  await second
  assert.equal(map.getLayer('radar-layer').paint['raster-opacity'], 0.88)
  assert.equal(map.getSource('radar-source--incoming-1'), null)
})

test('a stale preload cannot replace a newer selection', async () => {
  const first = deferred()
  const second = deferred()
  const map = createMap()
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: ({ url }) => url.endsWith('a.webp') ? first.promise : second.promise,
  })

  const a = transition.sync(firstFrame, true)
  const b = transition.sync(secondFrame, true)
  second.resolve()
  await waitFor(() => map.getSource('radar-source--incoming-2'))
  map.emitSourceData('radar-source--incoming-2')
  await b
  first.resolve()
  await a

  assert.equal(map.getLayer('radar-layer').source, 'radar-source--incoming-2')
})

test('repeated syncs for the same pending frame share one preload', async () => {
  const pending = deferred()
  const map = createMap()
  let preloadCount = 0
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: () => { preloadCount += 1; return pending.promise },
  })

  const first = transition.sync(firstFrame, true)
  const repeated = transition.sync(firstFrame, true)
  assert.equal(preloadCount, 1)
  pending.resolve()
  await waitFor(() => map.getSource('radar-source--incoming-1'))
  map.emitSourceData('radar-source--incoming-1')
  await Promise.all([first, repeated])

  assert.equal(map.getLayer('radar-layer').source, 'radar-source--incoming-1')
})

test('a Mapbox source error keeps the previous normal frame', async () => {
  const map = createMap()
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: async () => undefined,
  })
  const first = transition.sync(firstFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-1'))
  map.emitSourceData('radar-source--incoming-1')
  await first

  const second = transition.sync(secondFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-2'))
  map.emit('error', { sourceId: 'radar-source--incoming-2', error: new Error('bad image source') })
  await second

  assert.equal(map.getLayer('radar-layer').source, 'radar-source--incoming-1')
  assert.equal(map.getLayer('radar-layer--incoming-2'), null)
})

test('a style recreation restores the active frame without preloading another image', async () => {
  const map = createMap()
  let preloadCount = 0
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: async () => { preloadCount += 1 },
  })
  const initial = transition.sync(firstFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-1'))
  map.emitSourceData('radar-source--incoming-1')
  await initial

  map.removeLayer('radar-layer')
  map.removeSource('radar-source--incoming-1')
  await transition.sync(firstFrame, true)

  assert.equal(preloadCount, 1)
  assert.equal(map.getLayer('radar-layer').source, 'radar-source--incoming-1')
})

test('updates raster presentation on an already active frame', async () => {
  const map = createMap()
  const transition = createRasterFrameTransition(map, {
    sourceId: 'satellite-source', layerId: 'satellite-layer', opacity: 0.9, transitionMs: 0,
    rasterPaint: { 'raster-brightness-min': 0.12, 'raster-contrast': 0 },
    preload: async () => undefined,
  })
  const initial = transition.sync(firstFrame, true)
  await waitFor(() => map.getSource('satellite-source--incoming-1'))
  map.emitSourceData('satellite-source--incoming-1')
  await initial

  transition.updatePresentation({
    opacity: 0.5,
    rasterPaint: { 'raster-brightness-min': 0.24, 'raster-contrast': 0.3 },
  })
  await transition.sync(firstFrame, true)

  assert.equal(map.getLayer('satellite-layer').paint['raster-opacity'], 0.5)
  assert.equal(map.getLayer('satellite-layer').paint['raster-brightness-min'], 0.24)
  assert.equal(map.getLayer('satellite-layer').paint['raster-contrast'], 0.3)
})

test('style cleanup during preload cannot commit and same frame restores without a second preload', async () => {
  const pending = deferred()
  const map = createMap()
  let preloadCount = 0
  const transition = createRasterFrameTransition(map, {
    sourceId: 'radar-source', layerId: 'radar-layer', opacity: 0.88, transitionMs: 0,
    preload: () => { preloadCount += 1; return pending.promise },
  })

  const sync = transition.sync(firstFrame, true)
  transition.dispose()
  pending.resolve()
  await sync
  assert.equal(map.getLayer('radar-layer'), null)

  const restored = transition.sync(firstFrame, true)
  await waitFor(() => map.getSource('radar-source--incoming-3'))
  map.emitSourceData('radar-source--incoming-3')
  await restored
  assert.equal(preloadCount, 2)
})
