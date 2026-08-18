import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertSatelliteJob,
  failureMessage,
  successMessage,
} from '../src/satellite/worker-protocol.js'

test('rejects invalid job before any processor is imported', () => {
  assert.throws(
    () => assertSatelliteJob({ kind: 'radar', mode: 'current', now: '2026-08-18T14:10:00.000Z' }),
    /invalid satellite worker kind/,
  )
})

test('returns a compact validated satellite job', () => {
  const job = assertSatelliteJob({
    kind: 'satellite',
    mode: 'fog_retry',
    now: '2026-08-18T14:10:00.000Z',
    frame: { tm: '202608182310', fogAttempts: 1 },
    ignored: 'credential',
  })

  assert.deepEqual(job, {
    kind: 'satellite',
    mode: 'fog_retry',
    now: '2026-08-18T14:10:00.000Z',
    frame: { tm: '202608182310', fogAttempts: 1 },
  })
})

test('rejects invalid satellite job mode and time', () => {
  assert.throws(
    () => assertSatelliteJob({ kind: 'satellite', mode: 'visible', now: '2026-08-18T14:10:00.000Z' }),
    /invalid satellite worker mode/,
  )
  assert.throws(
    () => assertSatelliteJob({ kind: 'satellite', mode: 'current', now: 'not-a-time' }),
    /invalid satellite worker time/,
  )
})

test('only permits current visible satellite jobs', () => {
  assert.deepEqual(
    assertSatelliteJob({ kind: 'satellite_visible', mode: 'current', now: '2026-08-18T14:10:00.000Z' }),
    { kind: 'satellite_visible', mode: 'current', now: '2026-08-18T14:10:00.000Z' },
  )
  assert.throws(
    () => assertSatelliteJob({ kind: 'satellite_visible', mode: 'backfill', now: '2026-08-18T14:10:00.000Z' }),
    /invalid satellite worker mode/,
  )
})

test('returns JSON-safe terminal messages', () => {
  assert.deepEqual(
    successMessage({ result: { saved: true }, followUps: [] }),
    { ok: true, result: { result: { saved: true }, followUps: [] } },
  )
})

test('rejects unsafe success payloads and malformed follow-ups before IPC', () => {
  const cyclic = {}
  cyclic.self = cyclic

  for (const result of [Buffer.from('binary'), 1n, cyclic]) {
    assert.throws(
      () => successMessage({ result, followUps: [] }),
      /JSON-safe satellite worker payload/,
    )
  }

  assert.throws(
    () => successMessage({ result: {}, followUps: [{
      kind: 'satellite_visible', mode: 'current', now: '2026-08-18T14:10:00.000Z', delayMs: 0,
    }] }),
    /invalid satellite worker follow-up/,
  )
})

test('failure messages expose only safe error identity and text', () => {
  const error = new Error('download failed')
  error.name = 'SatelliteDownloadError'
  error.stack = 'secret stack'
  error.credentials = 'secret credential'

  assert.deepEqual(failureMessage(error), {
    ok: false,
    error: { name: 'SatelliteDownloadError', message: 'download failed' },
  })
})
