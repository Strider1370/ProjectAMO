import assert from 'node:assert/strict'
import test from 'node:test'
import { createOneShotNotifier } from './createOneShotNotifier.js'

test('notifies an optional callback only once', () => {
  let calls = 0
  const notify = createOneShotNotifier(() => { calls += 1 })
  notify()
  notify()
  assert.equal(calls, 1)
})

test('accepts an omitted callback', () => {
  const notify = createOneShotNotifier()
  assert.doesNotThrow(() => { notify(); notify() })
})
