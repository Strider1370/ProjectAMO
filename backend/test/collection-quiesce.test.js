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

test('quiesceCollections aborts an active satellite collection before reporting idle', async () => {
  let signal
  let releaseStarted
  const started = new Promise((resolve) => { releaseStarted = resolve })
  const running = runWithLock('satellite', async ({ signal: collectionSignal }) => {
    signal = collectionSignal
    releaseStarted()
    await new Promise((resolve, reject) => {
      collectionSignal.addEventListener('abort', () => reject(collectionSignal.reason), { once: true })
    })
  })

  await started
  await quiesceCollections({ timeoutMs: 1_000, pollMs: 5 })
  await running

  assert.equal(signal.aborted, true)
  assert.deepEqual(activeCollectionTypes(), [])
})
