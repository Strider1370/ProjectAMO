import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerminalMotionReplay } from './terminalMotionReplay.js'

test('view switch cancellation prevents a captured motion frame from advancing', () => {
  let callback
  const cancelled = []
  let advances = 0
  const replay = createTerminalMotionReplay({
    clock: {
      requestAnimationFrame(next) { callback = next; return 7 },
      cancelAnimationFrame(id) { cancelled.push(id) },
    },
    advance: () => { advances += 1 },
  })
  replay.schedule()
  replay.cancel()
  callback()
  assert.deepEqual(cancelled, [7])
  assert.equal(advances, 0)
})
