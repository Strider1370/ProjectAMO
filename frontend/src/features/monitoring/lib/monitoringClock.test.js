import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMonitoringClock, monitoringClockParts } from './monitoringClock.js'

test('formats the current monitoring time with date, weekday, and 24-hour time', () => {
  assert.equal(
    formatMonitoringClock(new Date('2026-08-23T05:20:00Z'), 'KST'),
    '2026년 8월 23일 (일) 14:20',
  )
})

test('identifies the Korean weekday separately for weekend styling', () => {
  assert.deepEqual(monitoringClockParts(new Date('2026-08-22T05:20:00Z'), 'KST'), {
    date: '2026년 8월 22일', weekday: '토', time: '14:20',
  })
  assert.deepEqual(monitoringClockParts(new Date('2026-08-23T05:20:00Z'), 'KST'), {
    date: '2026년 8월 23일', weekday: '일', time: '14:20',
  })
})

test('uses UTC calendar fields when UTC is selected', () => {
  assert.equal(
    formatMonitoringClock(new Date('2026-08-23T05:20:00Z'), 'UTC'),
    '2026년 8월 23일 (일) 05:20',
  )
})
