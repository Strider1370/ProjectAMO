import test from 'node:test'
import assert from 'node:assert/strict'
import { outputTokenBudget } from '../src/ai/output-budget.js'

test('operator output token budget is bounded with an unchanged default', () => {
  for (const value of [undefined, '']) assert.equal(outputTokenBudget(value), 1600)
  for (const value of ['256', '1600', '3200', '8192']) assert.equal(outputTokenBudget(value), Number(value))
  for (const value of ['0', '-1', '255', '8193', '1e3', '3200.5', 'Infinity', 'invalid', ' ', null, 3200]) {
    assert.throws(() => outputTokenBudget(value), /INVALID_OUTPUT_TOKEN_BUDGET/)
  }
})
