import assert from 'node:assert/strict'
import test from 'node:test'

import { approach, pinnedProgress, segment, stepIndex } from './scrollTimeline.js'

test('segment maps the global progress onto a sub-range and clamps outside it', () => {
  assert.equal(segment(0.1, 0.2, 0.4), 0)
  assert.ok(Math.abs(segment(0.3, 0.2, 0.4) - 0.5) < 1e-12)
  assert.equal(segment(0.9, 0.2, 0.4), 1)
})

test('pinned progress runs from the section top until the section bottom meets the viewport bottom', () => {
  assert.equal(pinnedProgress(900, 1000, 4000, 1000), 0)
  assert.equal(pinnedProgress(2500, 1000, 4000, 1000), 0.5)
  assert.equal(pinnedProgress(4500, 1000, 4000, 1000), 1)
})

test('pinned progress of a section no taller than the viewport is a step', () => {
  assert.equal(pinnedProgress(999, 1000, 800, 1000), 0)
  assert.equal(pinnedProgress(1000, 1000, 800, 1000), 1)
})

test('step index counts the thresholds already passed', () => {
  const thresholds = [0.2, 0.4, 0.6]
  assert.equal(stepIndex(0, thresholds), 0)
  assert.equal(stepIndex(0.4, thresholds), 2)
  assert.equal(stepIndex(1, thresholds), 3)
})

test('approach moves toward the target and settles on it', () => {
  let value = 0
  for (let i = 0; i < 200; i += 1) value = approach(value, 1)
  assert.equal(value, 1)
  assert.ok(approach(0, 1) > 0 && approach(0, 1) < 1)
})
