import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { satellite as satelliteConfig } from '../src/config.js'
import { successMessage } from '../src/satellite/worker-protocol.js'
import { runSatelliteWorker } from '../src/satellite/worker-runner.js'

const job = {
  kind: 'satellite',
  mode: 'current',
  now: '2026-08-18T14:10:00.000Z',
}

function fakeChild() {
  const child = new EventEmitter()
  child.connected = true
  child.killCalls = []
  child.sendCalls = []
  child.kill = (signal) => {
    child.killCalls.push(signal)
    return true
  }
  child.send = (message) => child.sendCalls.push(message)
  child.disconnect = () => {
    child.connected = false
    child.emit('disconnect')
  }
  return child
}

test('resolves only after success IPC and exit 0', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.emit('message', successMessage({ result: { saved: true }, followUps: [] }))
  child.emit('exit', 0, null)

  await assert.doesNotReject(run)
  assert.deepEqual(await run, { result: { saved: true }, followUps: [] })
  assert.deepEqual(child.sendCalls, [job])
})

test('terminates the child on collection abort', async () => {
  const controller = new AbortController()
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, signal: controller.signal, timeoutMs: 100 })

  controller.abort(new Error('collection_cancelled_for_data_transition'))

  assert.equal(child.killCalls[0], 'SIGTERM')
  child.emit('exit', null, 'SIGTERM')
  await assert.rejects(run, /collection_cancelled_for_data_transition/)
})

test('rejects malformed terminal IPC and cleans up the child', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.emit('message', { ok: true, result: { result: { saved: true }, followUps: [{ nope: true }] } })
  child.emit('exit', 1, null)

  await assert.rejects(run, /SatelliteWorkerProtocolError/)
  assert.equal(child.killCalls[0], 'SIGTERM')
  assert.equal(child.listenerCount('message'), 0)
})

test('rejects a terminal success payload that is not JSON-safe', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.emit('message', { ok: true, result: { result: { saved: true, bytes: 1n }, followUps: [] } })
  child.emit('exit', 1, null)

  await assert.rejects(run, (error) => error.name === 'SatelliteWorkerProtocolError')
})

test('rejects a non-zero child exit without a terminal message', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.emit('exit', 1, null)

  await assert.rejects(run, (error) => error.name === 'SatelliteWorkerExitError')
})

test('waits for exit after a child error and rejects with an exit error', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.emit('error', new Error('spawn failed'))
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  child.emit('exit', 1, null)

  await assert.rejects(run, (error) => error.name === 'SatelliteWorkerExitError')
})

test('treats IPC disconnect before a terminal message as a protocol failure', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })

  child.disconnect()
  child.emit('exit', 1, null)

  await assert.rejects(run, (error) => error.name === 'SatelliteWorkerProtocolError')
})

test('escalates a timed-out child from SIGTERM to SIGKILL and clears listeners', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, {
    forkImpl: () => child,
    timeoutMs: 5,
    killGraceMs: 5,
  })

  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(child.killCalls, ['SIGTERM', 'SIGKILL'])
  child.emit('exit', null, 'SIGKILL')

  await assert.rejects(run, (error) => error.name === 'SatelliteWorkerTimeoutError')
  assert.equal(child.listenerCount('message'), 0)
  assert.equal(child.listenerCount('exit'), 0)
})

test('uses a finite configured production timeout when no test override is supplied', async () => {
  assert.equal(satelliteConfig.worker_timeout_ms, 180_000)
  const child = fakeChild()
  satelliteConfig.worker_timeout_ms = 5
  try {
    const run = runSatelliteWorker(job, {
      forkImpl: () => child,
      killGraceMs: 0,
    })

    await new Promise((resolve) => setTimeout(resolve, 15))
    child.emit('exit', null, 'SIGTERM')
    await assert.rejects(run, (error) => error.name === 'SatelliteWorkerTimeoutError')
    assert.equal(child.listenerCount('error'), 0)
  } finally {
    satelliteConfig.worker_timeout_ms = 180_000
  }
})
