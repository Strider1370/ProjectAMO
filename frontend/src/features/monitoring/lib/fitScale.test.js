import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fitScale, MIN_FIT_SCALE, MAX_FIT_SCALE } from './fitScale.js'

// Stand-in for text reflow: a fixed amount of text area, so a narrower column is proportionally
// taller. Real wrapping is lumpier, but it has the same monotonic shape, which is all the search
// relies on.
function textOfArea(area) {
  return (width) => area / width
}

describe('fitScale', () => {
  it('finds the scale where the document just fills the panel', () => {
    // area = 600*800 means the content exactly fills a 600x800 panel at scale 1.
    const scale = fitScale(textOfArea(600 * 800), 600, 800)
    assert.ok(Math.abs(scale - 1) < 0.05, `expected ~1, got ${scale}`)
  })

  it('scales a short bulletin up to fill the panel', () => {
    const scale = fitScale(textOfArea(600 * 200), 600, 800)
    assert.ok(scale > 1.8, `expected >1.8, got ${scale}`)
  })

  it('scales a long bulletin down so it still fits', () => {
    const area = 600 * 3200
    const scale = fitScale(textOfArea(area), 600, 800)
    assert.ok(scale < 0.55, `expected <0.55, got ${scale}`)
    // The contract that matters: whatever it returns must actually fit.
    assert.ok(textOfArea(area)(600 / scale) * scale <= 800 + 1e-6)
  })

  it('never returns a scale whose layout overflows the panel', () => {
    for (const area of [600 * 100, 600 * 500, 600 * 900, 600 * 2000]) {
      const scale = fitScale(textOfArea(area), 600, 800)
      assert.ok(textOfArea(area)(600 / scale) * scale <= 800 + 1e-6, `overflowed at area ${area}`)
    }
  })

  it('still fits a document far too large for a short panel', () => {
    // The monitoring ops map panel measures 593x234, where the shortest real bulletin lays out
    // ~653px tall. A floor that stops the search early used to return an overflowing scale.
    const panelWidth = 593
    const panelHeight = 234
    const measure = textOfArea(1481 * 653)
    const scale = fitScale(measure, panelWidth, panelHeight)
    assert.ok(
      measure(panelWidth / scale) * scale <= panelHeight + 1e-6,
      `overflowed: ${measure(panelWidth / scale) * scale} > ${panelHeight}`
    )
  })

  it('stays inside the scale bounds', () => {
    assert.ok(fitScale(textOfArea(1), 600, 800) <= MAX_FIT_SCALE)
    assert.ok(fitScale(textOfArea(1e9), 600, 800) >= MIN_FIT_SCALE)
  })

  it('gives up on a panel with no size yet instead of dividing by zero', () => {
    assert.equal(fitScale(textOfArea(1000), 0, 800), 1)
    assert.equal(fitScale(textOfArea(1000), 600, 0), 1)
  })
})
