import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getCandidateTms as getRadarCandidateTms } from '../src/processors/radar-echo-processor.js'
import { getCandidateTms as getSatelliteCandidateTms } from '../src/processors/satellite-processor.js'

const REFERENCE_TIME = new Date('2026-07-22T10:00:00.495Z')

test('radar candidates can be anchored to a historical demo clock', () => {
  assert.deepEqual(getRadarCandidateTms(10, REFERENCE_TIME), [
    '202607221850',
    '202607221845',
    '202607221840',
  ])
})

test('satellite candidates can be anchored to a historical demo clock', () => {
  assert.deepEqual(getSatelliteCandidateTms(20, REFERENCE_TIME), [
    { requestTm: '202607220940', displayTm: '202607221840' },
    { requestTm: '202607220930', displayTm: '202607221830' },
    { requestTm: '202607220920', displayTm: '202607221820' },
  ])
})
