import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUrls, isInFir, loadFirPolygon, normalizeState } from '../src/processors/adsb-processor.js'

test('ADS-B uses two 250NM coverage requests', () => {
  assert.equal(buildUrls().length, 2)
  assert.ok(buildUrls().every((url) => url.endsWith('/dist/250')))
})

test('ADS-B FIR filter loads the local FIR polygon', () => {
  const polygon = loadFirPolygon()

  assert.ok(Array.isArray(polygon))
  assert.ok(polygon.length > 0)
})

test('ADS-B FIR filter excludes aircraft outside the FIR', () => {
  assert.equal(isInFir(127.0, 36.0), true)
  assert.equal(isInFir(140.0, 36.0), false)
})

test('ADS-B normalizer preserves aircraft-reported wind and temperatures', () => {
  const aircraft = normalizeState({ hex: 'abc123', lat: 37, lon: 127, wd: 216, ws: 34, oat: -18, tat: 9 })
  assert.deepEqual([aircraft.wind_direction, aircraft.wind_speed, aircraft.outside_air_temperature], [216, 34, -18])
})
