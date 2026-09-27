import test from 'node:test'
import assert from 'node:assert/strict'
import { floatingWindow, formatCopilotTime } from './floatingWindow.js'

test('desktop window fills the available height above its launcher; tablet stays compact', () => {
  const viewport = { width: 1440, height: 900 }
  const size = floatingWindow(viewport, false)
  assert.equal(size.width, 400)
  assert.equal(size.height, 772)
  assert.equal(size.y, 16)
  assert.equal(size.y + size.height, 788)
  assert.equal(floatingWindow(viewport, true).width, 480)
  assert.equal(floatingWindow(viewport, true).height, 772)
  assert.equal(floatingWindow({ width: 1194, height: 834 }, false).height, 560)
  const moved = floatingWindow({ width: 1024, height: 768 }, true, { x: 5000, y: -5000 })
  assert.equal(moved.y, 16)
  assert.ok(moved.x + moved.width <= 1024 - 16)
  assert.deepEqual(viewport, { width: 1440, height: 900 })
})

test('source times honor selected UTC/KST and preserve unknown', () => {
  const time = '2026-09-23T16:00:00Z'
  assert.match(formatCopilotTime(time, 'Asia/Seoul'), /24.*01:00 KST/)
  assert.match(formatCopilotTime(time, 'UTC'), /23.*16:00 UTC/)
  assert.equal(formatCopilotTime(null, 'UTC'), '시각 미상')
})
