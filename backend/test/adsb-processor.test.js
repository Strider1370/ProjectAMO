import assert from 'node:assert/strict'
import test from 'node:test'
import { isInFir, loadFirPolygon } from '../src/processors/adsb-processor.js'

test('ADS-B FIR filter loads the local FIR polygon', () => {
  const polygon = loadFirPolygon()

  assert.ok(Array.isArray(polygon))
  assert.ok(polygon.length > 0)
})

test('ADS-B FIR filter excludes aircraft outside the FIR', () => {
  assert.equal(isInFir(127.0, 36.0), true)
  assert.equal(isInFir(140.0, 36.0), false)
})
