import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_LAYER, ECHO_TOP_SOURCE, syncEchoTopLayer } from './echoTopLayers.js'

function fakeMap() {
  const sources = new Map()
  const layers = new Map()
  return {
    sources, layers,
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, { ...def, updateImage: (next) => sources.set(id, { ...def, ...next }) }),
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, { ...def, layout: {} }),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value },
  }
}

const frame = { path: '/data/radar/echotop/echotop_202607252035.webp', bounds: [[30, 120], [44, 136]] }

test('a valid frame installs the image source and shows the layer', () => {
  const map = fakeMap()
  assert.equal(syncEchoTopLayer(map, { frame, visible: true }), true)
  assert.ok(map.getSource(ECHO_TOP_SOURCE))
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'visible')
})

test('turning the layer off hides it without tearing the source down', () => {
  const map = fakeMap()
  syncEchoTopLayer(map, { frame, visible: true })
  assert.equal(syncEchoTopLayer(map, { frame, visible: false }), false)
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'none')
})

test('a null frame hides the layer — no stale image is left on the map', () => {
  const map = fakeMap()
  syncEchoTopLayer(map, { frame, visible: true })
  assert.equal(syncEchoTopLayer(map, { frame: null, visible: true }), false)
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'none')
})

test('a frame without bounds is refused rather than rendered at the wrong place', () => {
  const map = fakeMap()
  assert.equal(syncEchoTopLayer(map, { frame: { path: '/x.webp' }, visible: true }), false)
})
