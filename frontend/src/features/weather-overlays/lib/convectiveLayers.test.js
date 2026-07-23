import test from 'node:test'
import assert from 'node:assert/strict'
import { CI_LAYER, CI_SOURCE, CTPS_LAYER, CTPS_SOURCE, queryCiAtPoint, syncConvectiveLayers } from './convectiveLayers.js'

function mapMock() {
  const sources = new Map(); const layers = new Map()
  return { sources, layers, getSource: (id) => sources.get(id), getLayer: (id) => layers.get(id), addSource(id, value) { sources.set(id, { ...value, setData(data) { this.data = data }, updateImage(image) { this.image = image } }) }, addLayer(layer) { layers.set(layer.id, layer) }, setLayoutProperty(id, key, value) { layers.get(id)[key] = value }, removeLayer(id) { layers.delete(id) }, removeSource(id) { sources.delete(id) }, queryRenderedFeatures() { return [{ properties: { signal: 3 } }, { properties: { signal: 4, level: 'strong' } }] } }
}

test('convective layers keep CTPS below CI and independently visible', () => {
  const map = mapMock()
  syncConvectiveLayers(map, { ciVisible: true, ctpsVisible: true, minFl: 100, ciFrame: { path: '/ci.geojson' }, ctpsFrame: { bounds: [[29, 114], [46, 138]], images: { 100: '/fl100.webp' } } })
  assert.equal(map.getLayer(CTPS_LAYER).source, CTPS_SOURCE)
  assert.equal(map.getLayer(CI_LAYER).source, CI_SOURCE)
  assert.equal(map.getLayer(CTPS_LAYER).slot, 'middle')
  assert.equal(map.getLayer(CI_LAYER).slot, 'top')
  assert.equal(map.getSource(CTPS_SOURCE).url, '/fl100.webp')
  assert.equal(queryCiAtPoint(map, { x: 0, y: 0 }).signal, 4)
})