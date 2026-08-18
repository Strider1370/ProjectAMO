import test from 'node:test'
import assert from 'node:assert/strict'

import { runSatelliteJob } from '../src/satellite/worker-jobs.js'
import { processSatelliteVisibleJob } from '../src/processors/satellite-visible-processor.js'

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
