import { Worker } from 'node:worker_threads'
import { briefingFailure } from './briefing-contracts.js'

// One calculation at a time, with a small queue for a model's parallel tool calls.
// The deadline includes queueing/startup and can interrupt synchronous geometry.
export function createWorkerExecutor(options, { timeoutMs = 20_000, maxPending = 4 } = {}) {
  let worker = null
  let ready = null
  let active = null
  let sequence = 0
  let closed = false
  const queue = []
  function start() {
    worker = new Worker(new URL('./tool-worker.js', import.meta.url), { workerData: options })
    const current = worker
    ready = new Promise((resolve, reject) => {
      current.on('message', (message) => {
        if (message.ready) resolve()
        if (active?.id === message.id) active.finish(message.result ?? briefingFailure(message.error))
      })
      const failed = () => {
        reject(new Error('Worker unavailable'))
        if (worker === current) {
          worker = null
          active?.finish(briefingFailure('TOOL_FAILED'))
        }
      }
      current.on('error', failed)
      current.on('exit', failed)
    })
    ready.catch(() => {})
  }
  function pump() {
    if (closed || active || !queue.length) return
    active = queue.shift()
    const job = active
    if (!worker) start()
    ready.then(() => {
      if (active === job) worker?.postMessage({ id: job.id, operation: job.operation, name: job.name, input: job.input, owner: job.owner })
    }).catch(() => { if (active === job) job.finish(briefingFailure('TOOL_FAILED')) })
  }
  function submit(operation, name, input, owner, signal) {
      if (closed) return Promise.resolve(briefingFailure('SERVER_CLOSED'))
      if (queue.length + Number(Boolean(active)) >= maxPending) return Promise.resolve(briefingFailure('BUSY'))
      return new Promise((resolve) => {
        let settled = false
        const job = { id: ++sequence, operation, name, input, owner, finish(result) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          if (active === job) active = null
          const index = queue.indexOf(job)
          if (index !== -1) queue.splice(index, 1)
          resolve(result)
          queueMicrotask(pump)
        } }
        const abort = () => {
          if (active === job) {
            const old = worker
            worker = null
            void old?.terminate()
          }
          job.finish(briefingFailure(signal?.aborted ? 'CANCELLED' : 'TIMEOUT'))
        }
        const timer = setTimeout(abort, timeoutMs)
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) { abort(); return }
        queue.push(job)
        pump()
      })
  }
  return {
    call: (name, input, owner, signal) => submit('call', name, input, owner, signal),
    registerContext: (input, owner, signal) => submit('registerContext', null, input, owner, signal),
    getResult: (ref, owner, signal) => submit('getResult', null, ref, owner, signal),
    clearOwner(owner) { worker?.postMessage({ clear: true, owner }) },
    async close() {
      closed = true
      active?.finish(briefingFailure('SERVER_CLOSED'))
      for (const job of [...queue]) job.finish(briefingFailure('SERVER_CLOSED'))
      const old = worker
      worker = null
      await old?.terminate()
    },
  }
}
