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
    frame: { tm: '202608182310', fogAttempts: 1, credentials: 'must not cross IPC' },
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

test('preserves direct and nested dense JSON arrays in allowlisted frame results', () => {
  const message = successMessage({
    result: {
      saved: true,
      frames: [{
        tm: '202608182310',
        path: '/data/satellite/sat_korea_202608182310.webp',
        bounds: [[124, 32], [132, 40]],
      }],
    },
    followUps: [],
  })

  assert.deepEqual(message.result.result.frames, [{
    tm: '202608182310',
    path: '/data/satellite/sat_korea_202608182310.webp',
    bounds: [[124, 32], [132, 40]],
  }])
  assert.deepEqual(JSON.parse(JSON.stringify(message)), message)
})

test('drops credential-shaped fields from outbound job frames and results', () => {
  const job = assertSatelliteJob({
    kind: 'satellite', mode: 'fog_retry', now: '2026-08-18T14:10:00.000Z',
    frame: { tm: '202608182310', apiKey: 'secret' },
  })
  const message = successMessage({
    result: { saved: true, credentials: 'secret', authKey: 'also-secret' },
    followUps: [],
  })

  assert.deepEqual(job.frame, { tm: '202608182310' })
  assert.deepEqual(message.result.result, { saved: true })
  assert.throws(
    () => successMessage({ result: {
      saved: true,
      frames: [{ tm: '202608182310', bounds: [[124, 32], [132, { credentials: 'secret' }]] }],
    }, followUps: [] }),
    /invalid satellite worker success result/,
  )
})

test('preserves the visible collector no-status result without opening arbitrary reasons', () => {
  assert.deepEqual(
    successMessage({ result: { saved: false, tm: '202608182310', reason: 'http-undefined' }, followUps: [] }),
    { ok: true, result: { result: { saved: false, tm: '202608182310', reason: 'http-undefined' }, followUps: [] } },
  )
})

test('normalizes valid follow-ups into the IPC allowlist', () => {
  const message = successMessage({
    result: { saved: true },
    followUps: [{
      kind: 'satellite',
      mode: 'fog_retry',
      now: '2026-08-18T14:10:00.000Z',
      frame: { tm: '202608182310', credentials: 'must not cross IPC' },
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

test('failure messages remain safe when an error name accessor throws', () => {
  const error = {}
  Object.defineProperty(error, 'name', { get: () => { throw new Error('hostile accessor') } })

  assert.deepEqual(failureMessage(error), {
    ok: false,
    error: { name: 'SatelliteWorkerError', message: 'satellite worker failed' },
  })
})
