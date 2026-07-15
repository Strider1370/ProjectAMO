import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getLastUsed } from './aircraftProfiles.js'

function fakeStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

test('getLastUsed returns null for empty storage', () => {
  assert.equal(getLastUsed(fakeStore()), null)
})

test('getLastUsed returns valid stored performance', () => {
  const s = fakeStore()
  s.setItem('amo_last_perf', JSON.stringify({ tasKt: 140, altitudeFt: 7500 }))
  assert.deepEqual(getLastUsed(s), { tasKt: 140, altitudeFt: 7500 })
})

test('getLastUsed returns null for invalid stored JSON', () => {
  const s = fakeStore()
  s.setItem('amo_last_perf', 'not json')
  assert.equal(getLastUsed(s), null)
})

test('exports only the live last-used reader', async () => {
  const module = await import('./aircraftProfiles.js')
  assert.deepEqual(Object.keys(module), ['getLastUsed'])
})
