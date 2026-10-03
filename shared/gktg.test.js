import test from 'node:test'
import assert from 'node:assert/strict'
import { gktgIntensity, gktgBand } from './gktg.js'
test('TURB grades agree at every boundary; missing is different from NIL', () => {
  for (const [value, grade] of [[0, 0], [.149999, 0], [.15, 1], [.219999, 1], [.22, 2], [.339999, 2], [.34, 3]]) assert.equal(gktgIntensity(value), grade)
  for (const value of [null, undefined, NaN, -1, '0.2']) assert.equal(gktgIntensity(value), null)
  assert.equal(gktgBand(.15).color, '#33ff00')
  assert.equal(gktgBand(.22).color, '#ffcc00')
  assert.equal(gktgBand(.34).color, '#ff2900')
  for (const [value, grade] of [[.15, 1], [.22, 2], [.34, 3]]) assert.equal(gktgIntensity(Math.fround(value)), grade)
  assert.equal(gktgIntensity(Math.fround(Math.fround(.22) - 2 ** -26)), 1)
})
