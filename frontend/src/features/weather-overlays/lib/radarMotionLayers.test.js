import assert from 'node:assert/strict'
import test from 'node:test'
import { RADAR_MOTION_ARROW_LAYER, RADAR_MOTION_SOURCE, selectVisibleMotionFeatures, syncRadarMotionLayer } from './radarMotionLayers.js'

function feature(lon, lat, confidence = 0.8) {
  return {
    type: 'Feature',
    properties: { confidence, bearingDeg: 90 },
    geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.1, lat]] },
  }
}

function createMockMap() {
  const sources = new Map()
  const layers = new Map()
  const layoutCalls = []
  return {
    layoutCalls,
    addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data } }) },
    getSource(id) { return sources.get(id) || null },
    addLayer(layer) { layers.set(layer.id, layer) },
    getLayer(id) { return layers.get(id) || null },
    setLayoutProperty(id, property, value) { layoutCalls.push([id, property, value]) },
    getBounds() { return { getWest: () => 120, getEast: () => 140, getSouth: () => 30, getNorth: () => 45 } },
    hasImage() { return true }, addImage() {}, on() {},
  }
}

test('selectVisibleMotionFeatures keeps only one best vector per dense viewport cell', () => {
  const data = {
    type: 'FeatureCollection',
    features: Array.from({ length: 180 }, (_, index) => {
      const column = index % 15
      const row = Math.floor(index / 15)
      return feature(120 + (column + 0.5) * 20 / 15, 30 + (row + 0.5) * 15 / 12, index / 100)
    }),
  }
  const result = selectVisibleMotionFeatures(data, { west: 120, east: 140, south: 30, north: 45 })
  assert.equal(result.features.length, 180)
})

test('syncRadarMotionLayer installs a zoom-gated layer and hides it without exact data', () => {
  const map = createMockMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.ok(map.getSource(RADAR_MOTION_SOURCE))
  assert.equal(map.getLayer(RADAR_MOTION_ARROW_LAYER).minzoom, 5)
  assert.equal(map.getLayer('kma-radar-motion-shaft'), null)
  assert.ok(map.layoutCalls.some(([id, property, value]) => id === RADAR_MOTION_ARROW_LAYER && property === 'visibility' && value === 'none'))
})

test('syncRadarMotionLayer preloads exact-frame motion while the toggle is off', async () => {
  const map = createMockMap()
  const originalFetch = globalThis.fetch
  const payload = { type: 'FeatureCollection', features: [feature(126, 37)] }
  let requestedUrl = null
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return { ok: true, json: async () => payload }
  }
  try {
    syncRadarMotionLayer(map, { visible: false, dataUrl: '/data/radar/motion_korea_202605141205.geojson' })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(requestedUrl, '/data/radar/motion_korea_202605141205.geojson')
    assert.deepEqual(map.getSource(RADAR_MOTION_SOURCE).data, { type: 'FeatureCollection', features: [] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('syncRadarMotionLayer loads the exact URL, hides with radar off, and reinstalls after a style reload', async () => {
  const originalFetch = globalThis.fetch
  const payload = { type: 'FeatureCollection', features: [feature(126, 37)] }
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(url)
    return { ok: true, json: async () => payload }
  }
  try {
    const model = { visible: true, dataUrl: '/data/radar/motion_korea_202605141205.geojson' }
    const firstMap = createMockMap()
    syncRadarMotionLayer(firstMap, model)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(urls, [model.dataUrl])
    assert.equal(firstMap.getSource(RADAR_MOTION_SOURCE).data.features.length, 1)
    assert.ok(firstMap.layoutCalls.some(([id, property, value]) => id === RADAR_MOTION_ARROW_LAYER && property === 'visibility' && value === 'visible'))

    syncRadarMotionLayer(firstMap, { ...model, visible: false })
    assert.ok(firstMap.layoutCalls.some(([id, property, value]) => id === RADAR_MOTION_ARROW_LAYER && property === 'visibility' && value === 'none'))

    const reloadedMap = createMockMap()
    syncRadarMotionLayer(reloadedMap, model)
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(reloadedMap.getLayer(RADAR_MOTION_ARROW_LAYER))
    assert.equal(reloadedMap.getSource(RADAR_MOTION_SOURCE).data.features.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
