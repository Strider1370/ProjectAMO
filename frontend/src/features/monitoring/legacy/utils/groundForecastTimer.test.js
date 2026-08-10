import assert from 'node:assert/strict'
import test from 'node:test'

import { scheduleGroundForecastAdvance } from './groundForecastTimer.js'

test('forecast advance cleanup clears the scheduled 12-second handle', () => {
  const calls = []
  const timerApi = { setTimeout(callback, delay) { calls.push(['set', callback, delay]); return 41 }, clearTimeout(handle) { calls.push(['clear', handle]) } }
  const cleanup = scheduleGroundForecastAdvance(() => {}, timerApi)
  assert.equal(calls[0][2], 12_000)
  cleanup()
  assert.deepEqual(calls.at(-1), ['clear', 41])
})
