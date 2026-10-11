import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { createKimDownloadOffload } from '../src/processors/kim-download-offload.js'

// 작업 스레드 흉내: 받은 메시지를 sent에 쌓고, 시험이 reply/emit으로 답한다.
function fakeWorker() {
  const worker = new EventEmitter()
  worker.sent = []
  worker.terminated = false
  worker.postMessage = (message) => worker.sent.push(message)
  worker.terminate = async () => { worker.terminated = true; worker.emit('exit', 1) }
  worker.reply = (message) => worker.emit('message', message)
  return worker
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
const task = { level: { id: '500hPa' }, tmfc: '2026101106', hf: 12, credential: 'k', domain: 'ea' }

test('a task goes to the worker and its entry comes back', async () => {
  const workers = []
  const offload = createKimDownloadOffload({ root: '/data', createWorker: () => { const w = fakeWorker(); workers.push(w); return w } })
  const pending = offload.collectTask({ task })
  const [sent] = workers[0].sent
  assert.equal(sent.type, 'task')
  assert.equal(sent.root, '/data')
  workers[0].reply({ type: 'task_result', id: sent.id, entry: { levelId: '500hPa' }, reused: false, lastError: { name: 'Error', message: 'rh missing' } })
  const result = await pending
  assert.deepEqual(result.entry, { levelId: '500hPa' })
  assert.equal(result.lastError.message, 'rh missing')
  await offload.close()
})

test('worker fetch requests are served on the main thread and errors keep their code', async () => {
  const calls = []
  const worker = fakeWorker()
  const offload = createKimDownloadOffload({
    createWorker: () => worker,
    fetchGrid: async (params) => {
      calls.push(params)
      if (params.name === 'bad') { const error = new Error('HTTP 403'); error.code = 'E403'; throw error }
      return 'text'
    },
  })
  offload.collectTask({ task }).catch(() => {})
  worker.reply({ type: 'fetch', id: 1, params: { name: 'T', level: 500 } })
  worker.reply({ type: 'fetch', id: 2, params: { name: 'bad', level: 500 } })
  await tick(); await tick()
  assert.deepEqual(calls.map((call) => call.name), ['T', 'bad'])
  const results = worker.sent.filter((message) => message.type === 'fetch_result')
  assert.deepEqual(results[0], { type: 'fetch_result', id: 1, text: 'text' })
  assert.equal(results[1].error.code, 'E403')
  await offload.close()
})

test('a lost worker fails its tasks for the collector retry and the next task starts a new worker', async () => {
  const workers = []
  const offload = createKimDownloadOffload({ createWorker: () => { const w = fakeWorker(); workers.push(w); return w } })
  const first = offload.collectTask({ task })
  const second = offload.collectTask({ task })
  workers[0].emit('error', new Error('out of memory'))
  await assert.rejects(first, (error) => error.code === 'kim_download_worker_lost')
  await assert.rejects(second, (error) => error.code === 'kim_download_worker_lost')
  const third = offload.collectTask({ task })
  assert.equal(workers.length, 2)
  const sent = workers[1].sent[0]
  workers[1].reply({ type: 'task_result', id: sent.id, entry: { levelId: '500hPa' }, reused: true, lastError: null })
  assert.equal((await third).reused, true)
  await offload.close()
})

test('close fails pending tasks and terminates the worker; an aborted run takes no new task', async () => {
  const worker = fakeWorker()
  const controller = new AbortController()
  const offload = createKimDownloadOffload({ createWorker: () => worker, signal: controller.signal })
  const pending = offload.collectTask({ task })
  await offload.close()
  await assert.rejects(pending, (error) => error.code === 'kim_download_worker_closed')
  assert.equal(worker.terminated, true)
  controller.abort(new Error('cancelled'))
  await assert.rejects(offload.collectTask({ task }), /cancelled/)
})
