import test from 'node:test'
import assert from 'node:assert/strict'
import { airportWarningState } from './airportWarningModel.js'
import { addAirportWarningLayers, animateAirportWarnings, AIRPORT_WARNING_RING_LAYER, AIRPORT_WARNING_PULSE_LAYER, AIRPORT_WARNING_HALO_LAYER } from './airportWarningLayers.js'
import { createAirportGeoJSON, addAirportLayers, AIRPORT_SOURCE_ID, AIRPORT_CIRCLE_LAYER, AIRPORT_STATION_CENTER_LAYER, AIRPORT_INTERACTIVE_LAYERS } from './baseMapLayers.js'

const NOW = Date.parse('2026-10-04T03:00:00Z')
const payload = (warnings) => ({ airports: { RKSI: { warnings } } })

test('warning activity uses inclusive UTC start and exclusive end, irrespective of display timezone', () => {
  assert.deepEqual(airportWarningState(payload([
    { wrng_type_key: 'STRONG_WIND', valid_start: '2026-10-04T12:00:00+09:00', valid_end: '2026-10-04T04:00:00Z' },
    { wrng_type_key: 'HEAVY_RAIN', valid_end: '2026-10-04T03:00:00Z' },
    { wrng_type_key: 'HEAVY_SNOW', valid_start: '2026-10-04T05:00:00Z' },
  ]), NOW), {
    warnedAirports: ['RKSI'], warningLabels: { RKSI: ['강풍'] }, nextChangeAtMs: NOW + 3600000,
  })
})

test('future warnings start and expire without a new collection', () => {
  const data = payload([{ valid_start: '2026-10-04T04:00:00Z', valid_end: '2026-10-04T05:00:00Z' }])
  assert.deepEqual(airportWarningState(data, NOW).warnedAirports, [])
  assert.equal(airportWarningState(data, NOW).nextChangeAtMs, NOW + 3600000)
  assert.deepEqual(airportWarningState(data, NOW + 3600000).warnedAirports, ['RKSI'])
  assert.deepEqual(airportWarningState(data, NOW + 7200000).warnedAirports, [])
})

test('multiple warnings share one airport ring and duplicate labels are removed', () => {
  const state = airportWarningState(payload([{ wrng_type_key: 'WIND_SHEAR' }, { wrng_type_key: 'WIND_SHEAR' }, { wrng_type_name: '뇌우' }]), NOW)
  assert.deepEqual(state.warnedAirports, ['RKSI'])
  assert.deepEqual(state.warningLabels.RKSI, ['급변풍', '뇌우'])
  assert.equal(state.nextChangeAtMs, Infinity)
})

test('empty/cancelled data and invalid intervals do not mark an airport', () => {
  for (const data of [null, { airports: {} }, payload([]), payload(null), payload([null]), payload([{ valid_start: '2026-10-04T05:00:00Z', valid_end: '2026-10-04T04:00:00Z' }])]) {
    assert.deepEqual(airportWarningState(data, NOW).warnedAirports, [])
  }
})

function target() {
  const handlers = new Map()
  return {
    on(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler) },
    off(type, handler) { handlers.get(type)?.delete(handler) },
    emit(type) { for (const handler of [...(handlers.get(type) || [])]) handler() },
    listenerCount() { return [...handlers.values()].reduce((sum, set) => sum + set.size, 0) },
    addEventListener(type, handler) { this.on(type, handler) },
    removeEventListener(type, handler) { this.off(type, handler) },
  }
}
function harness({ reduced = false, hidden = false } = {}) {
  const layers = new Map()
  const sources = new Map()
  const map = Object.assign(target(), {
    getLayer: (id) => layers.get(id),
    getSource: (id) => sources.get(id),
    addSource: (id, source) => sources.set(id, source),
    addLayer: (layer) => { layers.set(layer.id, layer); map.emit('styledata') },
    getFilter: (id) => layers.get(id)?.filter,
    setFilter: (id, filter) => { layers.get(id).filter = filter; map.emit('styledata') },
    getPaintProperty: (id, name) => layers.get(id)?.paint[name],
    setPaintProperty: (id, name, value) => { layers.get(id).paint[name] = value; map.emit('styledata') },
  })
  const media = Object.assign(target(), { matches: reduced })
  const document = Object.assign(target(), { hidden })
  const timers = new Map()
  let time = 0, timerId = 0
  const environment = {
    document, matchMedia: () => media, performance: { now: () => time },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId },
    clearTimeout: (id) => timers.delete(id),
  }
  return { map, layers, media, document, environment, timers,
    advance(ms) { time += ms; const tasks = [...timers.values()]; timers.clear(); tasks.forEach((task) => task()) },
  }
}

test('warning rings share airport coordinates and stay below selection/station symbols', () => {
  const { map, layers } = harness()
  const airports = [{ icao: 'RKSI', lon: 126.4, lat: 37.46 }, { icao: 'RKSS', lon: 126.8, lat: 37.62 }, { icao: 'INVALID', lon: NaN, lat: 37 }]
  const data = createAirportGeoJSON(airports, null, ['RKSI'], 'RKSI')
  assert.deepEqual(data.features.map((f) => [f.properties.icao, f.properties.selected]), [['RKSI', true], ['RKSS', false]])
  assert.deepEqual(data.features.map((f) => [f.properties.icao, f.properties.warningActive]), [['RKSI', true], ['RKSS', false]])
  assert.deepEqual(data.features[0].geometry.coordinates, [126.4, 37.46])
  addAirportLayers(map, data)
  assert.equal(map.getSource(AIRPORT_SOURCE_ID).promoteId, 'icao')
  const order = [...layers.keys()]
  assert.ok(order.indexOf(AIRPORT_WARNING_PULSE_LAYER) < order.indexOf(AIRPORT_WARNING_RING_LAYER))
  assert.equal(map.getLayer(AIRPORT_WARNING_HALO_LAYER), undefined)
  assert.ok(order.indexOf(AIRPORT_WARNING_RING_LAYER) < order.indexOf(AIRPORT_CIRCLE_LAYER))
  assert.ok(order.indexOf(AIRPORT_CIRCLE_LAYER) < order.indexOf(AIRPORT_STATION_CENTER_LAYER))
  assert.equal(map.getLayer(AIRPORT_WARNING_RING_LAYER).source, AIRPORT_SOURCE_ID)
  assert.ok(AIRPORT_INTERACTIVE_LAYERS.includes(AIRPORT_WARNING_RING_LAYER))
  const count = layers.size
  addAirportLayers(map, data)
  assert.equal(layers.size, count)
})

test('outward pulse waits for installation, grows and fades, restarts in 1s, and cleans up', () => {
  const h = harness()
  const cleanup = animateAirportWarnings(h.map, { hasWarnings: true, environment: h.environment })
  assert.equal(h.timers.size, 0)
  addAirportWarningLayers(h.map, AIRPORT_SOURCE_ID)
  assert.equal(h.timers.size, 1)
  const initialRadius = h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-radius')[4]
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity'), 0.3)
  h.advance(500)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-radius')[4], initialRadius + 8)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity'), 0.15)
  h.advance(499)
  assert.ok(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity') < 0.001)
  h.advance(1)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-radius')[4], initialRadius)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity'), 0.3)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_RING_LAYER, 'circle-stroke-opacity'), 1)
  cleanup()
  assert.equal(h.timers.size + h.map.listenerCount() + h.media.listenerCount() + h.document.listenerCount(), 0)
})

test('reduced motion and hidden tabs retain a static ring, and resume without duplicate timers', () => {
  const h = harness({ reduced: true })
  addAirportWarningLayers(h.map, AIRPORT_SOURCE_ID)
  const cleanup = animateAirportWarnings(h.map, { hasWarnings: true, environment: h.environment })
  assert.equal(h.timers.size, 0)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_RING_LAYER, 'circle-stroke-opacity'), 1)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity'), 0)
  h.media.matches = false; h.media.emit('change')
  assert.equal(h.timers.size, 1)
  h.document.hidden = true; h.document.emit('visibilitychange')
  assert.equal(h.timers.size, 0)
  assert.equal(h.map.getPaintProperty(AIRPORT_WARNING_RING_LAYER, 'circle-stroke-opacity'), 1)
  h.document.hidden = false; h.document.emit('visibilitychange'); h.map.emit('styledata')
  assert.equal(h.timers.size, 1)
  cleanup()
})

test('style removal stops animation and replacement layers restart a single pulse', () => {
  const h = harness()
  addAirportWarningLayers(h.map, AIRPORT_SOURCE_ID)
  const cleanup = animateAirportWarnings(h.map, { hasWarnings: true, environment: h.environment })
  h.layers.clear(); h.map.emit('styledata')
  assert.equal(h.timers.size, 0)
  addAirportWarningLayers(h.map, AIRPORT_SOURCE_ID)
  assert.equal(h.timers.size, 1)
  cleanup()
})

test('maps without active warnings schedule no animation or listeners', () => {
  const h = harness()
  animateAirportWarnings(h.map, { hasWarnings: false, environment: h.environment })()
  assert.equal(h.timers.size + h.map.listenerCount() + h.media.listenerCount() + h.document.listenerCount(), 0)
})

test('a preview filter on the fixed ring also controls the expanding pulse', () => {
  const h = harness()
  addAirportWarningLayers(h.map, AIRPORT_SOURCE_ID)
  const preview = ['in', ['get', 'icao'], ['literal', ['RKSI', 'RKPC']]]
  h.map.setFilter(AIRPORT_WARNING_RING_LAYER, preview)
  const cleanup = animateAirportWarnings(h.map, { hasWarnings: true, environment: h.environment })
  assert.deepEqual(h.map.getFilter(AIRPORT_WARNING_PULSE_LAYER), preview)
  assert.equal(h.timers.size, 1)
  cleanup()
})
