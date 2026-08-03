import assert from 'node:assert/strict'
import test from 'node:test'
import { TERMINAL_CANVAS_WIDTH, terminalCanvasScale } from './terminalCanvasScale.js'

test('설계 폭에서는 배율이 1이다', () => {
  assert.equal(terminalCanvasScale(TERMINAL_CANVAS_WIDTH), 1)
})

test('화면이 커지면 같은 비율로 커진다', () => {
  assert.equal(terminalCanvasScale(3840), 2)
  assert.equal(terminalCanvasScale(2560), 2560 / TERMINAL_CANVAS_WIDTH)
  assert.equal(terminalCanvasScale(1366), 1366 / TERMINAL_CANVAS_WIDTH)
})

test('좁은 화면에서도 배율을 끄지 않는다', () => {
  // 모니터링과 다른 점. 터미널에는 좁은 화면용 반응형 규칙이 없어서,
  // 배율을 끄면 화면이 그냥 잘린다.
  assert.equal(terminalCanvasScale(1199), 1199 / TERMINAL_CANVAS_WIDTH)
  assert.equal(terminalCanvasScale(800), 800 / TERMINAL_CANVAS_WIDTH)
})

test('폭을 모르면 원래 크기로 둔다', () => {
  assert.equal(terminalCanvasScale(0), 1)
  assert.equal(terminalCanvasScale(-100), 1)
  assert.equal(terminalCanvasScale(undefined), 1)
})
