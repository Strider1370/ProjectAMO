import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createExclusiveGate } from '../src/lib/heavy-child-gate.js'
import { runKimDerivedWorker } from '../src/processors/kim-derived-worker.js'
import { runSatelliteWorker } from '../src/satellite/worker-runner.js'
import { successMessage } from '../src/satellite/worker-protocol.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('runs one task at a time in arrival order and starts immediately when free', async () => {
  const gate = createExclusiveGate()
  const order = []
  const first = deferred()
  const a = gate.run(() => { order.push('a'); return first.promise })
  assert.deepEqual(order, ['a'])
  const b = gate.run(async () => { order.push('b') })
  const c = gate.run(async () => { order.push('c') })
  await flush()
  assert.deepEqual(order, ['a'])
  assert.equal(gate.waiting, 2)
  first.resolve()
  await Promise.all([a, b, c])
  assert.deepEqual(order, ['a', 'b', 'c'])
  assert.equal(gate.busy, false)
})

test('a failed task hands over the turn, and a cancelled waiter leaves the line', async () => {
  const gate = createExclusiveGate()
  const first = deferred()
  const a = gate.run(() => first.promise)
  const controller = new AbortController()
  let ranCancelled = false
  const cancelled = gate.run(async () => { ranCancelled = true }, { signal: controller.signal })
  const later = gate.run(async () => 'later')
  controller.abort(new Error('collection_cancelled'))
  await assert.rejects(cancelled, /collection_cancelled/)
  assert.equal(gate.waiting, 1)
  first.reject(new Error('worker failed'))
  await assert.rejects(a, /worker failed/)
  assert.equal(await later, 'later')
  assert.equal(ranCancelled, false)
})

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 1
  child.connected = true
  child.sent = []
  child.send = (message) => child.sent.push(message)
  child.kill = () => true
  child.disconnect = () => {}
  return child
}

test('a satellite worker is not forked while a KIM derived worker holds an hour turn, and its timeout starts after it gets the turn', async () => {
  const gate = createExclusiveGate()
  const kimChild = fakeChild()
  const satelliteChild = fakeChild()
  let satelliteForked = false
  const kim = runKimDerivedWorker('kim_gktg', { gate, waitForMemory: async () => 0, forkImpl: () => kimChild, setPriority: () => {}, workerConfig: { timeout_ms: 1_000, max_old_space_mb: 512, nice: 10 } })
  await flush()
  // KIM 자식이 한 예보시각의 계산 순번을 받는다.
  kimChild.emit('message', { type: 'turn', id: 1 })
  await flush(); await flush()
  const satellite = runSatelliteWorker({ kind: 'satellite', mode: 'current', now: '2026-10-04T14:30:00.000Z' }, {
    gate, timeoutMs: 20, forkImpl: () => { satelliteForked = true; return satelliteChild },
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(satelliteForked, false)
  // 그 시각이 끝나 순번을 돌려주면, KIM 작업이 끝나기 전이라도 위성이 들어간다.
  kimChild.emit('message', { type: 'turn_release', id: 1 })
  await flush()
  assert.equal(satelliteForked, true)
  satelliteChild.emit('message', successMessage({ result: { saved: true }, followUps: [] }))
  satelliteChild.emit('exit', 0, null)
  assert.deepEqual(await satellite, { result: { saved: true }, followUps: [] })
  kimChild.emit('message', { type: 'done', ok: true, result: { type: 'kim_gktg' } })
  kimChild.emit('exit', 0, null)
  await kim
})
