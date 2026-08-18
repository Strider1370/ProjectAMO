import test from 'node:test'
import assert from 'node:assert/strict'

import { runSatelliteJob } from '../src/satellite/worker-jobs.js'
import { processSatelliteVisibleJob } from '../src/processors/satellite-visible-processor.js'
import { runWorkerEntry } from '../src/satellite/worker-entry.js'

test('current satellite work returns follow-ups instead of retaining timers', async () => {
  const work = await runSatelliteJob({
    kind: 'satellite',
    mode: 'current',
    now: '2026-08-18T14:10:00.000Z',
    deps: {
      processSatellite: async () => ({
        result: { type: 'satellite', saved: true },
        followUps: [{ kind: 'satellite', mode: 'backfill', now: '2026-08-18T14:10:00.000Z', delayMs: 0 }],
      }),
    },
  })

  assert.equal(work.result.type, 'satellite')
  assert.ok(work.followUps.every(({ delayMs }) => Number.isInteger(delayMs) && delayMs >= 0))
})

test('visible work shares the contract but has no deferred work', async () => {
  const work = await runSatelliteJob({
    kind: 'satellite_visible',
    mode: 'current',
    now: '2026-08-18T14:10:00.000Z',
    deps: {
      processSatelliteVisible: async () => ({ saved: false, reason: 'no-auth-key' }),
    },
  })

  assert.deepEqual(work.followUps, [])
  assert.equal(work.result.type, 'satellite_visible')
})

test('visible processor exposes its one-shot result without changing the legacy result shape', async () => {
  const work = await processSatelliteVisibleJob({
    now: new Date('2026-08-18T14:10:00.000Z'),
    deps: { config: { api: { radar_satellite_auth_key: '' } } },
  })

  assert.deepEqual(work, { result: { type: 'satellite_visible', saved: false, reason: 'no-auth-key' }, followUps: [] })
})

test('entry validates one job, returns the nested terminal success envelope, and disconnects', async () => {
  const sent = []
  let disconnected = false

  const exitCode = await runWorkerEntry({
    job: { kind: 'satellite', mode: 'current', now: '2026-08-18T14:10:00.000Z' },
    runJob: async () => ({ result: { saved: true }, followUps: [] }),
    send: (message) => sent.push(message),
    disconnect: () => { disconnected = true },
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(sent, [{ ok: true, result: { result: { saved: true }, followUps: [] } }])
  assert.equal(disconnected, true)
})

test('entry sends a safe failure envelope for invalid jobs without importing a processor', async () => {
  const sent = []
  let ran = false

  const exitCode = await runWorkerEntry({
    job: { kind: 'radar', mode: 'current', now: '2026-08-18T14:10:00.000Z' },
    runJob: async () => { ran = true },
    send: (message) => sent.push(message),
    disconnect: () => {},
  })

  assert.equal(exitCode, 1)
  assert.equal(ran, false)
  assert.deepEqual(sent, [{ ok: false, error: { name: 'SatelliteWorkerError', message: 'satellite worker failed' } }])
})
