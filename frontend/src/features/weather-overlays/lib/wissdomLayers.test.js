import test from 'node:test'
import assert from 'node:assert/strict'

import { WISSDOM_LAYER, WISSDOM_SOURCE, syncWissdomLayer } from './wissdomLayers.js'

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

test('syncWissdomLayer renders a complete frame once with its image bounds', () => {
  const map = createMockMap()
  const frame = { path: '/data/radar/wissdom_1524_202608041925.webp', bounds: [[30, 120], [40, 130]] }

  syncWissdomLayer(map, { wissdomFrame: frame })
  syncWissdomLayer(map, { wissdomFrame: frame })

  assert.equal(map.sources.size, 1)
  assert.equal(map.layers.size, 1)
  assert.equal(map.getLayer(WISSDOM_LAYER).source.startsWith(`${WISSDOM_SOURCE}-`), true)
  assert.deepEqual([...map.sources.values()][0], {
    type: 'image',
    url: '/data/radar/wissdom_1524_202608041925.webp',
    coordinates: [[120, 40], [130, 40], [130, 30], [120, 30]],
  })
  assert.deepEqual(map.layoutCalls.at(-1), [WISSDOM_LAYER, 'visibility', 'visible'])
})

test('syncWissdomLayer hides missing or malformed frames', () => {
  const map = createMockMap()

  syncWissdomLayer(map, { wissdomFrame: { path: '/wissdom.webp', bounds: [[30, 120], [40, 130]] } })
  syncWissdomLayer(map, { wissdomFrame: null })
  syncWissdomLayer(map, { wissdomFrame: { path: '/wissdom.webp', bounds: [[30, 120]] } })

  assert.deepEqual(map.layoutCalls.slice(-2), [[WISSDOM_LAYER, 'visibility', 'none'], [WISSDOM_LAYER, 'visibility', 'none']])
})
