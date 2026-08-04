import test from 'node:test'
import assert from 'node:assert/strict'

import { QPF_LAYER, QPF_SOURCE, syncQpfLayer } from './qpfLayers.js'

function createMockMap() {
  const sources = new Map()
  const layers = new Map()
  const layoutCalls = []
  return {
    sources,
    layers,
    layoutCalls,
    addSource(id, source) { sources.set(id, source) },
    getSource(id) { return sources.get(id) ?? null },
    removeSource(id) { sources.delete(id) },
    addLayer(layer) { layers.set(layer.id, layer) },
    getLayer(id) { return layers.get(id) ?? null },
    removeLayer(id) { layers.delete(id) },
    setLayoutProperty(id, property, value) { layoutCalls.push([id, property, value]) },
  }
}

test('syncQpfLayer renders a complete frame once with its image bounds', () => {
  const map = createMockMap()
  const frame = { path: '/data/radar/qpf_202608041925_p10.webp', bounds: [[30, 120], [40, 130]] }

  syncQpfLayer(map, { qpfFrame: frame })
  syncQpfLayer(map, { qpfFrame: frame })

  assert.equal(map.sources.size, 1)
  assert.equal(map.layers.size, 1)
  assert.equal(map.getLayer(QPF_LAYER).source.startsWith(`${QPF_SOURCE}-`), true)
  assert.deepEqual([...map.sources.values()][0], {
    type: 'image',
    url: '/data/radar/qpf_202608041925_p10.webp',
    coordinates: [[120, 40], [130, 40], [130, 30], [120, 30]],
  })
  assert.deepEqual(map.layoutCalls.at(-1), [QPF_LAYER, 'visibility', 'visible'])
})

test('syncQpfLayer hides missing or malformed frames', () => {
  const map = createMockMap()

  syncQpfLayer(map, { qpfFrame: { path: '/qpf.webp', bounds: [[30, 120], [40, 130]] } })
  syncQpfLayer(map, { qpfFrame: null })
  syncQpfLayer(map, { qpfFrame: { path: '/qpf.webp', bounds: [[30, 120]] } })

  assert.deepEqual(map.layoutCalls.slice(-2), [[QPF_LAYER, 'visibility', 'none'], [QPF_LAYER, 'visibility', 'none']])
})
