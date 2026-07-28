import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  activeCollectionTypes,
  quiesceCollections,
  runWithLock,
} from '../src/index.js'

test('quiesceCollections aborts an active collector and waits for its lock to clear', async () => {
  let receivedSignal = null
  let releaseStarted
  const started = new Promise((resolve) => { releaseStarted = resolve })

  const running = runWithLock('metar', async ({ signal }) => {
    receivedSignal = signal
    releaseStarted()
    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })

  await started
  assert.deepEqual(activeCollectionTypes(), ['metar'])

  await quiesceCollections({ timeoutMs: 1_000, pollMs: 5 })
  await running

  assert.equal(receivedSignal.aborted, true)
  assert.deepEqual(activeCollectionTypes(), [])
})
