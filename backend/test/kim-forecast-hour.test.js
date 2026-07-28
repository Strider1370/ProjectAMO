import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectClosestForecastTime,
  selectNearestForecastHour,
} from '../src/processors/kim-forecast-hour.js'

test('picks the smallest valid time at or after now', () => {
  const tmfc = '2026060600'
  const nowMs = Date.UTC(2026, 5, 6, 5) // 05:00Z — run+5h, nearest future = hf6
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6, 9] }), 6)
})

test('falls back to last candidate when now is past all valid times', () => {
  const tmfc = '2026060600'
  const nowMs = Date.UTC(2026, 5, 7, 0) // +24h, beyond [0..9]
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6, 9] }), 9)
})

test('returns first candidate when run is in the future', () => {
  const tmfc = '2026060612'
  const nowMs = Date.UTC(2026, 5, 6, 6) // before run
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6] }), 0)
})

test('picks the available valid time closest to ETD instead of the next future time', () => {
  const selected = selectClosestForecastTime({
    tmfc: '2026072200',
    targetMs: Date.parse('2026-07-22T10:00:00.000Z'),
    candidateTimes: [
      { hf: 9, validTime: '2026-07-22T09:00:00.000Z' },
      { hf: 12, validTime: '2026-07-22T12:00:00.000Z' },
      { hf: 30, validTime: '2026-07-23T06:00:00.000Z' },
    ],
  })

  assert.deepEqual(selected, {
    hf: 9,
    validTime: '2026-07-22T09:00:00.000Z',
  })
})

test('derives missing valid times from each source run and prefers the later time on a tie', () => {
  const selected = selectClosestForecastTime({
    tmfc: '2026072206',
    targetMs: Date.parse('2026-07-22T10:30:00.000Z'),
    candidateTimes: [{ hf: 3 }, { hf: 6 }],
  })

  assert.deepEqual(selected, {
    hf: 6,
    validTime: '2026-07-22T12:00:00.000Z',
  })
})
