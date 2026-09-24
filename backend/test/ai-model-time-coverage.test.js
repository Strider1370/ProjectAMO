import test from 'node:test'
import assert from 'node:assert/strict'
import { modelTimeCoverage } from '../src/ai/model-time-coverage.js'

const model = { availableTimes: [{ validTime: '2026-09-10T12:00:00Z' }, { validTime: '2026-09-10T15:00:00Z' }],
  crossSection: { run: { tmfc: '2026091006', validTime: '2026-09-10T15:00:00Z' } } }
test('old stored NWP is explicitly outside the current request, without a guessed freshness allowance', () => {
  const value = modelTimeCoverage({ etd: '2026-09-23T12:00:00Z', eta: '2026-09-23T13:00:00Z' }, model)
  assert.equal(value.status, 'outside_available_frames')
  assert.equal(value.selectedKimRun.tmfc, '2026091006')
  assert.equal(value.availableEnd, '2026-09-10T15:00:00.000Z')
  assert.equal(value.selectedKtgRun, null)
})
test('explicit waypoint offsets control comparison instants, while unknown range stays unknown', () => {
  const request = { etd: '2026-09-23T12:00:00Z', eta: '2026-09-23T13:00:00Z',
    nwpTimeSelection: { baseTime: '2026-09-10T12:00:00Z', waypointOverrides: [{ waypointId: 'A', offsetHours: 3 }] } }
  assert.equal(modelTimeCoverage(request, model).status, 'within_available_frames')
  request.nwpTimeSelection.waypointOverrides[0].offsetHours = 6
  assert.equal(modelTimeCoverage(request, model).status, 'outside_available_frames')
  assert.equal(modelTimeCoverage(request, { availableTimes: [{ hf: 0 }] }).status, 'unknown')
})
