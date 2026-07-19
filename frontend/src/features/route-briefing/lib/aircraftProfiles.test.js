import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PERFORMANCE_BY_RULE, getLastUsed, getPerformanceForRule, setPerformanceForRule } from './aircraftProfiles.js'

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

test('uses distinct IFR and VFR defaults and remembers each independently', () => {
  const s = fakeStore()
  assert.deepEqual(getPerformanceForRule('IFR', s), { tasKt: 450, altitudeFt: 31000 })
  assert.deepEqual(getPerformanceForRule('VFR', s), { tasKt: 120, altitudeFt: 5500 })
  setPerformanceForRule('IFR', { tasKt: 430 }, s)
  setPerformanceForRule('VFR', { altitudeFt: 6500 }, s)
  assert.deepEqual(getPerformanceForRule('IFR', s), { tasKt: 430, altitudeFt: 31000 })
  assert.deepEqual(getPerformanceForRule('VFR', s), { tasKt: 120, altitudeFt: 6500 })
  assert.equal(DEFAULT_PERFORMANCE_BY_RULE.IFR.tasKt, 450)
})

test('does not let a legacy shared preference override the new rule defaults', () => {
  const s = fakeStore()
  s.setItem('amo_last_perf', JSON.stringify({ tasKt: 120, altitudeFt: 9000 }))
  assert.deepEqual(getPerformanceForRule('IFR', s), { tasKt: 450, altitudeFt: 31000 })
})
