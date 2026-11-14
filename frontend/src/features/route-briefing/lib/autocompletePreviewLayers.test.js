import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAutocompletePreview, buildAutocompletePreviewGeoJSON, syncAutocompletePreview, AUTOCOMPLETE_PREVIEW_SOURCE } from './autocompletePreviewLayers.js'

test('waypoint preview uses actual coordinates and does not invent missing data', () => {
  const lookups = { navpoints: { BEDES: { coordinates: { lon: 127, lat: 36 } } }, fixCoords: { OSPAT: { lon: 126, lat: 37 } }, userWaypoints: [{ name: '내지점', lon: 127.5, lat: 35.5 }] }
  const item = (name) => ({ kind: 'FIX', name })
  assert.deepEqual(buildAutocompletePreview(item('BEDES'), lookups).coordinates, [[127, 36]])
  assert.deepEqual(buildAutocompletePreview(item('OSPAT'), lookups).coordinates, [[126, 37]])
  assert.deepEqual(buildAutocompletePreview(item('내지점'), lookups).coordinates, [[127.5, 35.5]])
  assert.equal(buildAutocompletePreview(item('UNKNOWN'), lookups), null)
  assert.equal(buildAutocompletePreview({ kind: 'AIRWAY', name: 'Y711' }, lookups), null)
})

test('procedure preview uses published geometry or complete fixes and rejects missing coordinates', () => {
  const proc = { fixes: [{ lon: 126, lat: 37 }, { lon: 127, lat: 36 }] }
  const item = { kind: 'SID', name: 'BULTI2U', procedure: proc }
  const preview = buildAutocompletePreview(item)
  const features = buildAutocompletePreviewGeoJSON(preview).features
  assert.deepEqual(features[0].geometry.coordinates, [[126, 37], [127, 36]])
  assert.equal(features[1].properties.label, '미리보기 · SID BULTI2U')
  assert.equal(buildAutocompletePreview({ ...item, procedure: { fixes: [...proc.fixes, { lat: 35 }] } }), null)
  assert.equal(buildAutocompletePreview({ ...item, procedure: { geometry: { coordinates: [[126, 37], [300, 36]] } } }), null)
})

test('map sync uses a separate source and clears it when the candidate disappears', () => {
  let data
  const map = { getStyle: () => ({}), getSource: (name) => name === AUTOCOMPLETE_PREVIEW_SOURCE ? { setData: (value) => { data = value } } : null, getLayer: () => true }
  syncAutocompletePreview(map, { kind: 'FIX', name: 'BEDES', coordinates: [[127, 36]] })
  assert.equal(data.features[0].properties.label, '미리보기 · BEDES')
  syncAutocompletePreview(map, null)
  assert.deepEqual(data.features, [])
})
