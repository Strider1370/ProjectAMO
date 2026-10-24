import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ENCODE_STEPS, MAX_EDGE_PX, fitWithin } from './imagePrep.js'

test('fitWithin keeps aspect ratio and never enlarges', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1920, height: 1440 })
  assert.deepEqual(fitWithin(1170, 2532), { width: 887, height: 1920 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
})

test('encode steps never exceed the stored edge and only get smaller', () => {
  assert.ok(ENCODE_STEPS.every((step) => step.edge <= MAX_EDGE_PX))
  for (let index = 1; index < ENCODE_STEPS.length; index += 1) {
    const before = ENCODE_STEPS[index - 1]
    const step = ENCODE_STEPS[index]
    assert.ok(step.edge < before.edge || step.quality < before.quality)
  }
})
