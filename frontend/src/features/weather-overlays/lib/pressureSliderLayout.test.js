import assert from 'node:assert/strict'
import test from 'node:test'

import { mobilePressureSliderBounds } from './pressureSliderLayout.js'

test('mobile pressure slider occupies only the measured gap between map controls', () => {
  assert.deepEqual(
    mobilePressureSliderBounds({ bottom: 58.2 }, { top: 460.8 }),
    { top: 67, height: 385 },
  )
})

test('mobile pressure slider is omitted when the map controls leave no usable gap', () => {
  assert.equal(mobilePressureSliderBounds({ bottom: 200 }, { top: 210 }), null)
})
