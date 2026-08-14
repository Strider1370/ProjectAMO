import test from 'node:test'
import assert from 'node:assert/strict'
import { maxZoomFor, EXAGGERATION_STEPS } from './cameraLimit.js'

test('과장을 안 걸면 지도 기본 한계를 그대로 쓴다', () => {
  assert.equal(maxZoomFor(1), 16)
})

test('배수가 커질수록 더 물러나야 한다', () => {
  const zooms = EXAGGERATION_STEPS.map(maxZoomFor)
  for (let i = 1; i < zooms.length; i += 1) {
    assert.ok(zooms[i] < zooms[i - 1], `${EXAGGERATION_STEPS[i]}배가 ${EXAGGERATION_STEPS[i - 1]}배보다 더 물러나야 한다`)
  }
})

test('10배에서는 갇히지 않는 거리까지 물러난다', () => {
  // 실측: zoom 10.5에서 갇히고 8.5에서 잘 보였다.
  assert.ok(maxZoomFor(10) <= 9, '10배는 zoom 9 이하로 제한해야 한다')
})

test('표에 없는 배수는 가장 가까운 아래 단계를 따른다', () => {
  assert.equal(maxZoomFor(7), maxZoomFor(5))
  assert.equal(maxZoomFor(100), maxZoomFor(20))
})

test('이상한 값에도 던지지 않는다', () => {
  assert.equal(maxZoomFor(0), 16)
  assert.equal(maxZoomFor(-3), 16)
  assert.equal(maxZoomFor(null), 16)
  assert.equal(maxZoomFor('열배'), 16)
})
