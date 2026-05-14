import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSigwxDebugSampleTargetUrl,
  normalizeSigwxDebugSamples,
} from './sigwxDebugApi.js'

test('normalizes debug sample list by newest tmfc first', () => {
  assert.deepEqual(normalizeSigwxDebugSamples([
    { tmfc: '2026051205', itemCount: 1 },
    { tmfc: '2026051411', itemCount: 2 },
  ]).map((sample) => sample.tmfc), ['2026051411', '2026051205'])
})

test('builds target image URL for a debug sample', () => {
  assert.equal(
    buildSigwxDebugSampleTargetUrl('2026051411'),
    '/api/debug/sigwx-low-samples/2026051411/target.png',
  )
})
