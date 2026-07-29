import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasScale, CANVAS_WIDTH } from './canvasScale.js'

describe('canvasScale', () => {
  it('is 1 at the design width', () => {
    assert.equal(canvasScale(CANVAS_WIDTH), 1)
  })

  it('grows with the viewport, so text keeps its apparent size', () => {
    assert.equal(canvasScale(CANVAS_WIDTH * 2), 2)
    assert.equal(canvasScale(2560), 2560 / CANVAS_WIDTH)
  })

  it('ignores height, so a browser window loses no width to letterboxing', () => {
    // A maximised window on a 1080p screen: the browser chrome eats ~180px of height.
    assert.equal(canvasScale(1920, 900), 1)
  })

  it('is off below the responsive breakpoint', () => {
    assert.equal(canvasScale(1199), null)
    assert.equal(canvasScale(719), null)
  })
})
