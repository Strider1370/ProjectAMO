import assert from 'node:assert/strict'
import test from 'node:test'

import { createKimFieldCache, estimateFieldBytes } from './kimFieldCache.js'

const field = (size) => ({ grid: { nx: size, ny: 1 }, values: Array.from({ length: size }, (_, i) => i) })

test('estimateFieldBytes counts long numeric arrays by length', () => {
  assert.equal(estimateFieldBytes(Array.from({ length: 1000 }, () => 1)), 8000)
  assert.equal(estimateFieldBytes(new Float32Array(1000)), 4000)
  assert.ok(estimateFieldBytes(field(1000)) > 8000)
})

test('layers share one byte budget and the least recently used field leaves first', () => {
  const cache = createKimFieldCache({ maxBytes: 30_000 })
  const wind = cache.view('wind')
  const gktg = cache.view('gktg')
  wind.set('a', field(1000))
  gktg.set('a', field(1000))
  wind.get('a')
  wind.set('b', field(1000))
  wind.set('c', field(1000))
  assert.equal(gktg.has('a'), false, 'oldest untouched field evicted')
  assert.equal(wind.has('a'), true, 'recently read field kept')
  assert.ok(cache.totalBytes <= 30_000)
})

test('namespaces do not collide and clear() only empties its own layer', () => {
  const cache = createKimFieldCache()
  const wind = cache.view('wind')
  const temperature = cache.view('temperature')
  wind.set('2026100700:6:850hPa', { kind: 'wind' })
  temperature.set('2026100700:6:850hPa', { kind: 'temperature' })
  assert.equal(wind.get('2026100700:6:850hPa').kind, 'wind')
  wind.clear()
  assert.equal(wind.has('2026100700:6:850hPa'), false)
  assert.equal(temperature.get('2026100700:6:850hPa').kind, 'temperature')
})

test('a single field larger than the budget is not cached', () => {
  const cache = createKimFieldCache({ maxBytes: 1000 })
  const view = cache.view('tropopause')
  view.set('big', field(1000))
  assert.equal(view.has('big'), false)
  assert.equal(cache.totalBytes, 0)
})
