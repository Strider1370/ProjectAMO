import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExperimentPixels, experimentColor, gktgBand, sampleExperimentField, syncExperimentOverlay, destroyExperimentOverlay, EXPERIMENT_LAYER } from './turbulenceExperimentOverlay.js'

const field = { grid: { nx: 2, ny: 2, lonMin: 120, lonMax: 121, latMin: 30, latMax: 31 },
  diagnostic: { colorMax: 10 }, values: [0, null, 10, 5] }

test('raw zero is valid, missing is transparent, image flips north/south', () => {
  assert.equal(experimentColor(0, 10)[3], 185)
  assert.equal(experimentColor(null, 10)[3], 0)
  assert.equal(experimentColor(NaN, 10)[3], 0)
  const pixels = buildExperimentPixels(field)
  assert.deepEqual([...pixels.slice(0, 4)], experimentColor(10, 10))
  assert.deepEqual([...pixels.slice(8, 12)], experimentColor(0, 10))
  assert.equal(pixels[15], 0)
  assert.equal(sampleExperimentField(field, 120, 30), 0)
  assert.equal(sampleExperimentField(field, 121, 30), null)
  assert.equal(sampleExperimentField(field, 119, 30), null)
})

test('combined results use original TURB thresholds and gui_default colours, independent of colorMax', () => {
  for (const [value, label, rgba] of [
    [0, 'NIL', [0, 0, 0, 0]], [.149999, 'NIL', [0, 0, 0, 0]],
    [.15, 'LGT', [51, 255, 0, 185]], [.219999, 'LGT', [51, 255, 0, 185]],
    [.22, 'MOD', [255, 204, 0, 185]], [.339999, 'MOD', [255, 204, 0, 185]],
    [.34, 'SEV', [255, 41, 0, 185]], [1, 'SEV', [255, 41, 0, 185]],
  ]) {
    assert.equal(gktgBand(value).label, label)
    assert.deepEqual(experimentColor(value, .5, true), rgba)
    assert.deepEqual(experimentColor(value, 100, true), rgba)
  }
  for (const value of [null, undefined, NaN, Infinity, -.01]) {
    assert.equal(gktgBand(value), null)
    assert.equal(experimentColor(value, .5, true)[3], 0)
  }
  const combined = { ...field, diagnostic: { combined: true, colorMax: .5 }, values: [0, null, .15, .34] }
  assert.deepEqual([...buildExperimentPixels(combined)], [51, 255, 0, 185, 255, 41, 0, 185, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(sampleExperimentField(combined, 120, 30), 0)
})

test('recreates source after style reload, hides and destroys without stale imagery', () => {
  const previous = globalThis.document
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData() {},
  }), toDataURL: () => 'data:image/png;base64,test' }) }
  const sources = new Map(), layers = new Map()
  const map = {
    getSource: (id) => sources.get(id), getLayer: (id) => layers.get(id),
    addSource: (id, source) => sources.set(id, { ...source, updateImage() {} }),
    addLayer: (layer) => layers.set(layer.id, layer),
    setLayoutProperty: (id, key, value) => { layers.get(id)[key] = value },
    removeLayer: (id) => layers.delete(id), removeSource: (id) => sources.delete(id),
  }
  try {
    syncExperimentOverlay(map, field, true)
    assert.equal(layers.get(EXPERIMENT_LAYER).visibility, 'visible')
    layers.clear(); sources.clear()
    syncExperimentOverlay(map, field, true)
    assert.equal(sources.size, 1)
    syncExperimentOverlay(map, null, true)
    assert.equal(layers.get(EXPERIMENT_LAYER).visibility, 'none')
    destroyExperimentOverlay(map)
    assert.equal(sources.size + layers.size, 0)
  } finally { globalThis.document = previous }
})
