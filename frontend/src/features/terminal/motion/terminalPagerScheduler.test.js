import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerminalPagerScheduler } from './terminalPagerScheduler.js'

function createFakeClock() {
  let identifier = 0
  const intervals = new Map()
  const timeouts = new Map()
  return {
    intervals,
    timeouts,
    setInterval(callback) { const id = ++identifier; intervals.set(id, callback); return id },
    clearInterval(id) { intervals.delete(id) },
    setTimeout(callback) { const id = ++identifier; timeouts.set(id, callback); return id },
    clearTimeout(id) { timeouts.delete(id) },
  }
}

test('scheduler manages automatic advance, completion, cancellation, disposal, and stale callbacks', () => {
  const clock = createFakeClock()
  const events = []
  const pager = createTerminalPagerScheduler({ clock, intervalMs: 9000, transitionMs: 1800, dispatch: (event) => events.push(event) })
  pager.start()
  const automatic = [...clock.intervals.values()][0]
  automatic()
  assert.deepEqual(events, [{ type: 'ADVANCE', source: 'automatic' }])

  pager.scheduleCompletion()
  const staleCompletion = [...clock.timeouts.values()][0]
  pager.cancel()
  assert.deepEqual(events.at(-1), { type: 'CANCEL' })
  staleCompletion()
  assert.deepEqual(events.at(-1), { type: 'CANCEL' })

  pager.scheduleCompletion()
  ;[...clock.timeouts.values()][0]()
  assert.deepEqual(events.at(-1), { type: 'COMPLETE' })
  pager.dispose()
  assert.equal(clock.intervals.size, 0)
  assert.equal(clock.timeouts.size, 0)
})
