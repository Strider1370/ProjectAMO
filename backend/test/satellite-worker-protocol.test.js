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
  assert.throws(
    () => assertSatelliteJob({ kind: 'satellite', mode: 'current', now: '2026-08-18T14:10:00Z' }),
    /invalid satellite worker time/,
  )
  assert.throws(
    () => assertSatelliteJob({ kind: 'satellite', mode: 'current', now: '2026-02-30T14:10:00.000Z' }),
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

test('normalizes valid follow-ups into the IPC allowlist', () => {
  const message = successMessage({
    result: { saved: true },
    followUps: [{
      kind: 'satellite',
      mode: 'fog_retry',
      now: '2026-08-18T14:10:00.000Z',
      frame: { tm: '202608182310' },
      delayMs: 0,
      credentials: 'must not cross IPC',
    }],
  })

  assert.deepEqual(message.result.followUps, [{
    kind: 'satellite',
    mode: 'fog_retry',
    now: '2026-08-18T14:10:00.000Z',
    frame: { tm: '202608182310' },
    delayMs: 0,
  }])
  assert.deepEqual(JSON.parse(JSON.stringify(message)), message)
})

test('rejects sparse and invalid-timestamp follow-up arrays', () => {
  const sparse = []
  sparse[1] = {
    kind: 'satellite', mode: 'fog_retry', now: '2026-08-18T14:10:00.000Z', delayMs: 0,
  }
  assert.throws(
    () => successMessage({ result: {}, followUps: sparse }),
    /invalid satellite worker follow-up/,
  )
  assert.throws(
    () => successMessage({ result: {}, followUps: [{
      kind: 'satellite', mode: 'fog_retry', now: '2026-08-18T14:10:00Z', delayMs: 0,
    }] }),
    /invalid satellite worker follow-up/,
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

test('rejects hidden serialization hazards before constructing terminal messages', () => {
  const hiddenToJson = {}
  Object.defineProperty(hiddenToJson, 'toJSON', { value: () => 1n })
  const hiddenBigInt = {}
  Object.defineProperty(hiddenBigInt, 'value', { value: 1n })
  const hiddenCycle = {}
  Object.defineProperty(hiddenCycle, 'self', { value: hiddenCycle })

  for (const result of [hiddenToJson, hiddenBigInt, hiddenCycle]) {
    assert.throws(
      () => successMessage({ result, followUps: [] }),
      /JSON-safe satellite worker payload/,
    )
  }
})

test('failure messages classify errors without exposing raw secrets', () => {
  const error = new Error('download failed: token=super-secret')
  error.name = 'SatelliteDownloadError'
  error.stack = 'secret stack'
  error.credentials = 'secret credential'

  assert.deepEqual(failureMessage(error), {
    ok: false,
    error: { name: 'SatelliteWorkerError', message: 'satellite worker failed' },
  })
})
