import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSigwxLowDebugSamplePayload,
  listSigwxLowDebugSamples,
} from '../src/sigwx-low/sigwx-low-debug-samples.js'

test('lists collected SIGWX_LOW reference samples', () => {
  const samples = listSigwxLowDebugSamples()
  assert.ok(samples.some((sample) => sample.tmfc === '2026051411'))
})

test('builds debug sample payload with phenomena and special line features', () => {
  const payload = buildSigwxLowDebugSamplePayload('2026051411')
  assert.equal(payload.tmfc, '2026051411')
  assert.equal(Array.isArray(payload.items), true)
  assert.equal(Array.isArray(payload.phenomena), true)
  assert.equal(Boolean(payload.specialLineFeatures), true)
  assert.equal(payload.debugSample.targetImageUrl, '/api/debug/sigwx-low-samples/2026051411/target.png')
})
