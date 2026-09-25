import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ICING_COLOR_RAMP,
  ICING_FIELD_LABEL,
  createIcingPotentialSampler,
  decodeIcingGrade,
  decodeIcingScore,
  pickIcingColor,
} from './icingPotentialField.js'

const FIELD = {
  encoding: 'int16-scaled-json-v1',
  scale: 0.0001,
  offset: 0,
  fieldEncoding: {
    icingScore: { encoding: 'int16-scaled-json-v1', scale: 0.0001, offset: 0 },
    icingGrade: { encoding: 'ordinal-json-v1', scale: 1, offset: 0 },
  },
}

test('decodes icing score and grade sentinel values', () => {
  assert.equal(decodeIcingScore(3456, FIELD), 0.3456)
  assert.equal(decodeIcingScore(-32768, FIELD), null)
  assert.equal(decodeIcingGrade(3, FIELD), 3)
  assert.equal(decodeIcingGrade(-32768, FIELD), null)
})

test('icing color ramp uses WAFS-like potential labels and transparent none', () => {
  assert.equal(ICING_FIELD_LABEL, 'Icing Potential')
  assert.deepEqual(ICING_COLOR_RAMP.map((entry) => entry.label), ['None', 'LIGHT', 'MODERATE', 'SEVERE'])
  assert.equal(pickIcingColor(0).alpha, 0)
  assert.equal(pickIcingColor(1).alpha, 1)
  assert.equal(pickIcingColor(2).alpha, 1)
  assert.equal(pickIcingColor(3).alpha, 1)
  assert.match(pickIcingColor(3).color, /^rgba\(/)
})

test('icing sampler returns decoded score and grade by nearest grid cell', () => {
  const sampler = createIcingPotentialSampler({
    ...FIELD,
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37, dx: 1, dy: 1 },
    icingScore: [0, 2000, -32768, 8000],
    icingGrade: [0, 1, -32768, 3],
  })

  assert.deepEqual(sampler.sample(127, 37), { score: 0.8, grade: 3, color: pickIcingColor(3) })
  assert.equal(sampler.sample(126, 37), null)
  assert.equal(sampler.sample(130, 37), null)
})
