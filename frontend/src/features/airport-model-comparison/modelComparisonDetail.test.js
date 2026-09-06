import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonDetails } from './modelComparisonDetail.js'

test('a selected instant compares every model without using a neighbouring hour', () => {
  const at = '2026-09-06T09:00:00.000Z'
  const rows = comparisonDetails([{ id: 'kim', label: 'KIM', points: [{ at, text: '11 kt · G 15 kt', detail: { run_at: at, forecast_hour: 0, temporal_method: 'native_hourly' } }] }, { id: 'ecmwf', label: 'ECMWF', points: [{ at: '2026-09-06T08:00:00.000Z', value: 30 }] }], at, 'kt')
  assert.equal(rows.length, 2)
  assert.match(rows[0].summary, /G 15 kt.*F000.*원 1시간 자료/)
  assert.match(rows[1].summary, /예보 범위 밖/)
})
