import test from 'node:test'
import assert from 'node:assert/strict'

import { addOrUpdateImageOverlay } from './imageOverlay.js'

function createMap() {
  const sources = new Map()
  const layers = new Map()
  const addSourceCalls = []
  const removeLayerCalls = []
  const removeSourceCalls = []
  const layerOrder = []

  return {
    addSourceCalls,
    removeLayerCalls,
    removeSourceCalls,
    layerOrder,
    addSource(id, source) {
      addSourceCalls.push({ id, source })
      sources.set(id, source)
    },
    getSource(id) {
      return sources.get(id) ?? null
    },
    getLayer(id) {
      return layers.get(id) ?? null
    },
    getStyle() {
      return { layers: layerOrder.map((id) => layers.get(id)) }
    },
    addLayer(layer, beforeId) {
      layers.set(layer.id, layer)
      const beforeIndex = layerOrder.indexOf(beforeId)
      if (beforeIndex === -1) layerOrder.push(layer.id)
      else layerOrder.splice(beforeIndex, 0, layer.id)
    },
    removeLayer(id) {
      removeLayerCalls.push(id)
      layers.delete(id)
      layerOrder.splice(layerOrder.indexOf(id), 1)
    },
    removeSource(id) {
      removeSourceCalls.push(id)
      sources.delete(id)
    },
  }
}

test('addOrUpdateImageOverlay installs unchanged frame URL only once', () => {
  const map = createMap()
  const frame = { path: '/data/radar/echo_korea_202605201200.png', bounds: [[30, 120], [40, 130]] }

  assert.equal(addOrUpdateImageOverlay(map, {
    sourceId: 'radar',
    layerId: 'radar-layer',
    frame,
    opacity: 0.88,
  }), true)
  assert.equal(addOrUpdateImageOverlay(map, {
    sourceId: 'radar',
    layerId: 'radar-layer',
    frame,
    opacity: 0.88,
  }), true)

  assert.equal(map.addSourceCalls.length, 1)
  assert.equal(map.removeLayerCalls.length, 0)
})

test('addOrUpdateImageOverlay preserves its same-slot sibling order when looping A to B to A', () => {
  const map = createMap()

  addOrUpdateImageOverlay(map, {
    sourceId: 'radar',
    layerId: 'radar-layer',
    frame: { path: '/data/radar/echo_korea_202605201200.png', bounds: [[30, 120], [40, 130]] },
    opacity: 0.88,
  })
  map.addLayer({ id: 'same-slot-sibling', slot: 'middle' })
  addOrUpdateImageOverlay(map, {
    sourceId: 'radar',
    layerId: 'radar-layer',
    frame: { path: '/data/radar/echo_korea_202605201210.png', bounds: [[30, 120], [40, 130]] },
    opacity: 0.88,
  })
  assert.deepEqual(map.layerOrder, ['radar-layer', 'same-slot-sibling'])
  addOrUpdateImageOverlay(map, {
    sourceId: 'radar',
    layerId: 'radar-layer',
    frame: { path: '/data/radar/echo_korea_202605201200.png', bounds: [[30, 120], [40, 130]] },
    opacity: 0.88,
  })

  assert.equal(map.addSourceCalls.length, 3)
  assert.equal(map.removeLayerCalls.length, 2)
  assert.equal(map.removeSourceCalls.length, 2)
  assert.notEqual(map.removeSourceCalls[0], map.removeSourceCalls[1])
  assert.deepEqual(map.layerOrder, ['radar-layer', 'same-slot-sibling'])
  assert.equal(map.getLayer('radar-layer').source, map.addSourceCalls.at(-1).id)
})
