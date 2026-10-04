import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { runKimDerivedWorker } from '../src/processors/kim-derived-worker.js'
import { createWorkerSide } from '../src/processors/kim-derived-worker-entry.js'

const workerConfig = { timeout_ms: 1_000, max_old_space_mb: 512, nice: 10 }

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 4242
  child.connected = true
  child.sent = []
  child.killCalls = []
  child.send = (message) => child.sent.push(message)
  child.kill = (signal) => child.killCalls.push(signal)
  return child
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('relays grid requests to the parent fetcher and resolves with the child result at low priority', async () => {
  const child = fakeChild()
  const forks = []
  const priorities = []
  const requests = []
  const run = runKimDerivedWorker('kim_gktg', {
    workerConfig,
    forkImpl: (...args) => { forks.push(args); return child },
    setPriority: (pid, value) => priorities.push([pid, value]),
    fetchGrid: async (params) => { requests.push(params); return `grid:${params.name}` },
  })
  await flush()
  assert.deepEqual(child.sent[0], { type: 'job', kind: 'kim_gktg' })
  assert.deepEqual(forks[0][2].execArgv, ['--max-old-space-size=512'])
  assert.deepEqual(priorities, [[4242, 10]])
  child.emit('message', { type: 'fetch', id: 1, params: { name: 'ps', level: 0, credential: 'kim-key' } })
  await flush()
  assert.equal(requests[0].name, 'ps')
  assert.ok(requests[0].signal instanceof AbortSignal)
  assert.deepEqual(child.sent[1], { type: 'fetch_result', id: 1, ok: true, text: 'grid:ps' })
  child.emit('message', { type: 'done', ok: true, result: { type: 'kim_gktg', fields: 273, collection: { outcome: 'complete' } } })
  child.emit('exit', 0, null)
  assert.equal((await run).fields, 273)
})

test('a failed parent fetch reaches the child with its code, and a child failure rejects the job', async () => {
  const child = fakeChild()
  const run = runKimDerivedWorker('kim_tropopause', {
    workerConfig, forkImpl: () => child, setPriority: () => {},
    fetchGrid: async () => { const error = new Error('blocked'); error.code = 'api_hub_key_blocked'; throw error },
  })
  await flush()
  child.emit('message', { type: 'fetch', id: 7, params: { name: 'T' } })
  await flush()
  assert.deepEqual(child.sent[1], { type: 'fetch_result', id: 7, ok: false, error: { name: 'Error', message: 'blocked', code: 'api_hub_key_blocked' } })
  child.emit('message', { type: 'done', ok: false, error: { name: 'Error', message: 'Invalid tropopause forecast hours' } })
  child.emit('exit', 1, null)
  await assert.rejects(run, /Invalid tropopause forecast hours/)
})

test('cancellation asks the child to stop first and kills it only after the grace period', async () => {
  const child = fakeChild()
  const controller = new AbortController()
  const run = runKimDerivedWorker('kim_gktg', { workerConfig, forkImpl: () => child, setPriority: () => {}, signal: controller.signal, killGraceMs: 20 })
  await flush()
  controller.abort(new Error('collection_cancelled_for_data_transition'))
  assert.deepEqual(child.sent.at(-1), { type: 'abort' })
  assert.deepEqual(child.killCalls, [])
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.deepEqual(child.killCalls, ['SIGKILL'])
  child.emit('exit', null, 'SIGKILL')
  await assert.rejects(run, /collection_cancelled_for_data_transition/)
})

test('only one worker runs at a time', async () => {
  const children = [fakeChild(), fakeChild()]
  let forks = 0
  const options = { workerConfig, forkImpl: () => children[forks++], setPriority: () => {} }
  const first = runKimDerivedWorker('kim_gktg', options)
  const second = runKimDerivedWorker('kim_tropopause', options)
  await flush()
  assert.equal(forks, 1)
  children[0].emit('message', { type: 'done', ok: true, result: { type: 'kim_gktg' } })
  children[0].emit('exit', 0, null)
  await first
  await flush()
  assert.equal(forks, 2)
  children[1].emit('message', { type: 'done', ok: true, result: { type: 'kim_tropopause' } })
  children[1].emit('exit', 0, null)
  assert.equal((await second).type, 'kim_tropopause')
})

test('worker side asks the parent for grids over IPC and fails pending requests when cancelled', async () => {
  const sent = []
  const processor = { process: async ({ fetchGrid, signal }) => {
    const first = await fetchGrid({ name: 'ps', level: 0, signal })
    await assert.rejects(fetchGrid({ name: 'topo', signal }), /cancelled/)
    return { type: 'kim_gktg', first }
  } }
  const side = createWorkerSide({ send: async (message) => { sent.push(message) }, load: { kim_gktg: async () => processor } })
  const done = side.run('kim_gktg')
  await flush()
  assert.deepEqual(sent[0], { type: 'fetch', id: 1, params: { name: 'ps', level: 0 } })
  side.onMessage({ type: 'fetch_result', id: 1, ok: true, text: 'ps-grid' })
  await flush()
  assert.equal(sent[1].params.name, 'topo')
  side.onMessage({ type: 'abort' })
  assert.equal(await done, 0)
  assert.deepEqual(sent.at(-1), { type: 'done', ok: true, result: { type: 'kim_gktg', first: 'ps-grid' } })
})

test('a real child process loads the processor and reports base waiting without touching the network', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-worker-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const result = await runKimDerivedWorker('kim_gktg', {
    workerConfig: { ...workerConfig, timeout_ms: 30_000 },
    setPriority: () => {},
    forkImpl: (entry, args, options) => fork(entry, args, { ...options, env: { ...process.env, DATA_PATH: root } }),
    fetchGrid: async () => assert.fail('must not fetch'),
  })
  assert.equal(result.type, 'kim_gktg')
  assert.equal(result.collection.outcome, 'partial')
})
