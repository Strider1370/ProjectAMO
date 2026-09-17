import assert from 'node:assert/strict'
import test from 'node:test'
import { createSigwxMarkerImage } from './sigwxMarkerImages.js'

function render(kind, text) {
  const calls = []
  const ctx = Object.fromEntries(['scale', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillRect', 'fillText'].map(name => [name, (...args) => calls.push([name, ...args])]))
  ctx.measureText = text => ({ width: text.length * 7 })
  ctx.getImageData = (_x, _y, width, height) => ({ width, height })
  const canvas = { getContext: () => ctx }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } })
  try {
    return { calls, image: createSigwxMarkerImage({ kind, text }) }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else delete globalThis.document
  }
}

test('turbulence draws the two source altitudes right of the anchored symbol with a separator', () => {
  const { image, calls } = render('turbulence-moderate', '050\n010')
  assert.equal(image.height, 64)
  const text = calls.filter(c => c[0] === 'fillText')
  assert.deepEqual(text.map(c => c[1]), ['050', '010'])
  assert.ok(text.every(c => c[2] > image.width / 4))
  assert.equal(text[1][3] - text[0][3], 14)
  assert.equal(calls.filter(c => c[0] === 'stroke').length, 2)
  const firstMove = calls.find(c => c[0] === 'moveTo')
  assert.equal(firstMove[1] + 12, image.width / 4, 'symbol remains at the image center at pixel ratio 2')
})

test('severe turbulence adds a second chevron and missing altitudes invent no text', () => {
  const moderate = render('turbulence-moderate', '')
  const severe = render('turbulence-severe', '')
  assert.equal(severe.calls.filter(c => c[0] === 'lineTo').length, moderate.calls.filter(c => c[0] === 'lineTo').length + 2)
  assert.equal(severe.calls.filter(c => c[0] === 'fillText').length, 0)
  assert.equal(severe.calls.filter(c => c[0] === 'fillRect').length, 0)
})

test('visibility set has fixed 24px symbols and non-overlapping 8px gutters', () => {
  const { image, calls } = render('visibility-set', '')
  assert.deepEqual(image, { width: 176, height: 56 })
  assert.deepEqual(calls[0], ['scale', 2, 2])
  const strokes = calls.filter(c => c[0] === 'lineTo')
  assert.equal(strokes.length, 8 + 3 + 2)
  assert.ok(strokes.slice(0, 8).every(c => c[1] <= 24))
  assert.ok(strokes.slice(8, 11).every(c => c[1] === 56))
  assert.ok(strokes.slice(11).every(c => c[1] === 88))
  const starts = calls.filter(c => c[0] === 'moveTo')
  assert.ok(starts.slice(8, 11).every(c => c[1] === 32))
  assert.ok(starts.slice(11).every(c => c[1] === 64))
  assert.equal(calls.filter(c => c[0] === 'fillText').length, 0)
})
