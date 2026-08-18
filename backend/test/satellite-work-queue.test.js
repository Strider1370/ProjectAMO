import assert from 'node:assert/strict'
import test from 'node:test'

import { createSatelliteWorkQueue } from '../src/satellite/work-queue.js'

const normalJob = {
  kind: 'satellite',
  mode: 'current',
  now: '2026-08-18T14:10:00.000Z',
}

const visibleJob = {
  kind: 'satellite_visible',
  mode: 'current',
  now: '2026-08-18T14:10:00.000Z',
}

function waitFor(predicate, timeoutMs = 1_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      if (predicate()) return resolve()
      if (Date.now() - started >= timeoutMs) return reject(new Error('timed out waiting for condition'))
      setTimeout(check, 1)
    }
    check()
  })
}

test('never overlaps normal and visible workers', async () => {
  const starts = []
  const gates = []
  const queue = createSatelliteWorkQueue({
    runWorker: async (job) => {
      starts.push(job.kind)
      await new Promise((resolve) => gates.push(resolve))
      return { result: { saved: true }, followUps: [] }
    },
  })

  const normal = queue.enqueue(normalJob)
  const visible = queue.enqueue(visibleJob)
  await waitFor(() => starts.length === 1)
  assert.deepEqual(starts, ['satellite'])

  gates.shift()()
  await waitFor(() => starts.length === 2)
  assert.deepEqual(starts, ['satellite', 'satellite_visible'])
  gates.shift()()

  await Promise.all([normal, visible])
})

test('schedules one delayed retry for duplicate follow-ups', async () => {
  const starts = []
  const queue = createSatelliteWorkQueue({
    runWorker: async (job) => {
      starts.push(job.mode)
      if (job.mode === 'current') {
        return {
          result: { saved: true },
          followUps: [
            { kind: 'satellite', mode: 'fog_retry', now: job.now, frame: { tm: '202608181410' }, delayMs: 5 },
            { kind: 'satellite', mode: 'fog_retry', now: job.now, frame: { tm: '202608181410' }, delayMs: 5 },
          ],
        }
      }
      return { result: { saved: true }, followUps: [] }
    },
  })

  await queue.enqueue(normalJob)
  await queue.whenIdle({ timeoutMs: 1_000, pollMs: 1 })

  assert.deepEqual(starts, ['current', 'fog_retry'])
})

test('cancels active and pending work, removes delayed retries, and can be reused', async () => {
  const starts = []
  let activeSignal
  const queue = createSatelliteWorkQueue({
    runWorker: (job, { signal }) => {
      starts.push(job.kind)
      if (job.kind === 'satellite') {
        activeSignal = signal
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      }
      return Promise.resolve({ result: { saved: true }, followUps: [] })
    },
  })

  const active = queue.enqueue(normalJob)
  const pending = queue.enqueue(visibleJob)
  await waitFor(() => activeSignal)
  const cancellation = new Error('collection cancelled')
  await queue.cancel(cancellation)

  await assert.rejects(active, /collection cancelled/)
  await assert.rejects(pending, /collection cancelled/)
  assert.equal(activeSignal.aborted, true)
  assert.deepEqual(starts, ['satellite'])

  await assert.doesNotReject(queue.enqueue(visibleJob))
  await queue.whenIdle({ timeoutMs: 1_000, pollMs: 1 })
})

test('cancellation clears a delayed retry before it can start', async () => {
  const starts = []
  const queue = createSatelliteWorkQueue({
    runWorker: async (job) => {
      starts.push(job.mode)
      return {
        result: { saved: true },
        followUps: job.mode === 'current'
          ? [{ kind: 'satellite', mode: 'fog_retry', now: job.now, frame: { tm: '202608181410' }, delayMs: 50 }]
          : [],
      }
    },
  })

  await queue.enqueue(normalJob)
  await queue.cancel(new Error('data transition'))
  await queue.whenIdle({ timeoutMs: 1_000, pollMs: 1 })
  await new Promise((resolve) => setTimeout(resolve, 60))

  assert.deepEqual(starts, ['current'])
})

test('whenIdle waits for delayed follow-ups as well as the active worker', async () => {
  let retried = false
  const queue = createSatelliteWorkQueue({
    runWorker: async (job) => {
      if (job.mode === 'current') {
        return {
          result: { saved: true },
          followUps: [{ kind: 'satellite', mode: 'backfill', now: job.now, frame: { tm: '202608181410' }, delayMs: 10 }],
        }
      }
      retried = true
      return { result: { saved: true }, followUps: [] }
    },
  })

  await queue.enqueue(normalJob)
  assert.equal(retried, false)
  await queue.whenIdle({ timeoutMs: 1_000, pollMs: 1 })
  assert.equal(retried, true)
})
