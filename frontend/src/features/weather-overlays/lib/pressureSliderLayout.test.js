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

test('SIGWX detail clearance includes every rail and its protruding value label', async () => {
  const { sigwxRailLayout } = await import('./pressureSliderLayout.js')
  const mapRect = { top: 80, right: 1200, bottom: 900 }
  const cardRect = { bottom: 240 }
  assert.equal(sigwxRailLayout({ mapRect, cardRect }).clearance, 12)
  const one = sigwxRailLayout({ mapRect, cardRect, sliderRects: [{ left: 1072 }, { left: 1055 }] })
  assert.equal(1200 - one.clearance, 1055 - 12)
  const several = sigwxRailLayout({ mapRect, cardRect, sliderRects: [{ left: 1072 }, { left: 948 }, { left: 922 }] })
  assert.equal(1200 - several.clearance, 922 - 12)
})

test('HIGH rails clear a growing legend and shorten before the bottom controls', async () => {
  const { sigwxRailLayout } = await import('./pressureSliderLayout.js')
  const mapRect = { top: 80, right: 1200, bottom: 700 }
  const options = { mapRect, lowerTop: 590 }
  const short = sigwxRailLayout({ ...options, cardRect: { bottom: 220 } })
  const tall = sigwxRailLayout({ ...options, cardRect: { bottom: 300 } })
  assert.equal(mapRect.top + tall.top, 312)
  assert.equal(short.trackHeight - tall.trackHeight, 80)
  assert.ok(mapRect.top + tall.top + tall.trackHeight + 64 <= options.lowerTop)
  const mobile = mobilePressureSliderBounds({ bottom: 300 }, { top: 590 })
  assert.ok(mobile.top > 300)
  assert.ok(mobile.top + mobile.height < 590)
})
