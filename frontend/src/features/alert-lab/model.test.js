import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, initialRules } from './model.js'

test('strict minima and inclusive wind boundaries', () => {
  const result = evaluate(initialRules(), { visibility: 1500, ceiling: 500, wind: 25, gust: 35 })
  assert.deepEqual(result.entered, ['wind', 'gust'])
  assert.equal(result.states.visibility, 'clear')
})
test('initial risk notifies, persistence does not, recovery rearms', () => {
  const rules = initialRules(), bad = { visibility: 1000, ceiling: 800, wind: 10, gust: 15 }
  const first = evaluate(rules, bad)
  assert.deepEqual(first.entered, ['visibility'])
  assert.deepEqual(evaluate(rules, bad, first.memory).entered, [])
  const missing = evaluate(rules, { ...bad, visibility: null }, first.memory)
  assert.equal(missing.states.visibility, 'unknown')
  assert.deepEqual(missing.resolved, [])
  assert.deepEqual(evaluate(rules, bad, missing.memory).entered, [])
  const recovered = evaluate(rules, { ...bad, visibility: 3000 }, missing.memory)
  assert.deepEqual(recovered.resolved, ['visibility'])
  assert.deepEqual(evaluate(rules, bad, recovered.memory).entered, ['visibility'])
})
test('disabled conditions and absent data do not create alerts', () => {
  const rules = initialRules()
  rules.visibility.enabled = false
  const result = evaluate(rules, { visibility: 0, ceiling: null, wind: null, gust: null })
  assert.deepEqual(result.entered, [])
  assert.equal(result.states.visibility, 'off')
})

test('temperature supports negative values and inclusive lower thresholds; windshear is a report', () => {
  const rules = initialRules()
  rules.temperature = { enabled: true, threshold: 0, direction: '이하' }
  rules.windshear.enabled = true
  const result = evaluate(rules, { temperature: -5, windshear: 1 })
  assert.deepEqual(result.entered, ['temperature', 'windshear'])
  assert.equal(evaluate(rules, { temperature: 0, windshear: 0 }).states.temperature, 'active')
  assert.equal(evaluate(rules, { temperature: 1, windshear: null }).states.windshear, 'unknown')
})
