import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, calculateScore } from './calculation.mjs'

test('known inputs, cutoff endpoints, saturation, and reversed OLR', () => {
  assert.equal(calculateScore({ cape: 0, rainRate: 0, olr: 250 }).score, 0)
  assert.equal(calculateScore({ cape: 1000, rainRate: 5, olr: 150 }).score, 1)
  assert.equal(calculateScore({ cape: 500, rainRate: 2.5, olr: 200 }).score, 0.5)
  assert.equal(calculateScore({ cape: 2000, rainRate: 10, olr: 100 }).score, 1)
})
test('each predictor is monotonic in its intended direction', () => {
  const base = { cape: 250, rainRate: 1, olr: 210 }
  const value = calculateScore(base).score
  assert.ok(calculateScore({ ...base, cape: 750 }).score > value)
  assert.ok(calculateScore({ ...base, rainRate: 4 }).score > value)
  assert.ok(calculateScore({ ...base, olr: 160 }).score > value)
})
test('weights normalize, zero weight is allowed, missing is not zero', () => {
  const s = { ...DEFAULTS, capeWeight: 2, rainWeight: 0, olrWeight: 0 }
  assert.equal(calculateScore({ cape: 500, rainRate: 5, olr: 150 }, s).score, 0.5)
  for (const x of [null, undefined, NaN, -1]) assert.equal(calculateScore({ cape: x, rainRate: 1, olr: 200 }), null)
  assert.throws(() => calculateScore({ cape: 1, rainRate: 1, olr: 200 }, { ...s, capeWeight: 0 }))
  assert.throws(() => calculateScore({ cape: 1, rainRate: 1, olr: 200 }, { ...DEFAULTS, capeHigh: 0 }))
})
