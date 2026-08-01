import test from 'node:test'
import assert from 'node:assert/strict'
import { createDailyByteBudget } from './daily-byte-budget.js'

test('한도에 닿으면 막는다', () => {
  const b = createDailyByteBudget({ limitBytes: 100, now: () => new Date('2026-08-01T00:00:00Z') })
  b.add(100)
  assert.equal(b.canSpend(), false)
})

test('KST 자정을 넘기면 초기화된다', () => {
  let t = new Date('2026-08-01T05:00:00Z')   // KST 14:00
  const b = createDailyByteBudget({ limitBytes: 100, now: () => t })
  b.add(100)
  assert.equal(b.canSpend(), false)
  t = new Date('2026-08-01T16:00:00Z')       // KST 다음날 01:00
  assert.equal(b.canSpend(), true)
  assert.equal(b.spent(), 0)
})
