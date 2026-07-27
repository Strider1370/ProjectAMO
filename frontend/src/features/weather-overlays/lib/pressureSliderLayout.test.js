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

// 오른쪽에 눈금 라벨이 없는 모바일에서는 슬라이더 중심축을 줌 컨트롤 중심축에 맞춘다.
test('mobile pressure slider centers on the navigation control when viewport width is known', () => {
  assert.deepEqual(
    mobilePressureSliderBounds(
      { bottom: 58.2 },
      { top: 460.8, left: 380, width: 40 },
      { viewportWidth: 440 },
    ),
    { top: 67, height: 385, right: 12 },
  )
})

test('mobile pressure slider omits right when the navigation rect has no position', () => {
  assert.deepEqual(
    mobilePressureSliderBounds({ bottom: 58.2 }, { top: 460.8 }, { viewportWidth: 440 }),
    { top: 67, height: 385 },
  )
})
