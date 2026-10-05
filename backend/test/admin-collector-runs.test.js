import test from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { recordCollectorRun, readCollectionTimeline, scheduledMinutes } from '../src/admin/collector-runs.js'
import stats, { __setPersistenceForTest } from '../src/stats.js'

// 2026-10-05 00:00 KST = 2026-10-04 15:00 UTC
const DAY_START = Date.UTC(2026, 9, 4, 15, 0)

test('UTC and KST cron schedules become KST minutes of the day', () => {
  // KIM 기본 격자: UTC 01·05시 12분 = KST 10:12, 14:12
  assert.deepEqual(scheduledMinutes('12 1,5 * * *', 'Etc/UTC', DAY_START), [10 * 60 + 12, 14 * 60 + 12])
  assert.equal(scheduledMinutes('15 * * * *', 'Asia/Seoul', DAY_START).length, 24)
  assert.equal(scheduledMinutes('*/5 * * * *', 'Etc/UTC', DAY_START).length, 288)
  const flights = scheduledMinutes('*/1 4-23 * * *', 'Asia/Seoul', DAY_START)
  assert.equal(flights[0], 4 * 60)
  assert.equal(flights.length, 20 * 60)
  assert.deepEqual(scheduledMinutes('0 */6 * * *', 'Etc/UTC', DAY_START), [3 * 60, 9 * 60, 15 * 60, 21 * 60])
})

test('timeline returns today’s runs in KST minutes, the schedule for each collector and yesterday on request', () => {
  const db = createDb(':memory:')
  const now = DAY_START + 10 * 3_600_000 + 20 * 60_000 // 10:20 KST
  recordCollectorRun(db, { type: 'metar', startedAt: new Date(DAY_START + 600 * 60_000).toISOString(), finishedAt: new Date(DAY_START + 600 * 60_000 + 20_000).toISOString(), outcome: 'succeeded', durationMs: 20_000 }, now)
  recordCollectorRun(db, { type: 'amos', startedAt: new Date(DAY_START + 605 * 60_000).toISOString(), finishedAt: new Date(DAY_START + 605 * 60_000 + 8_000).toISOString(), outcome: 'failed', durationMs: 8_000, reason: 'api_operation_timeout' }, now)
  recordCollectorRun(db, { type: 'metar', startedAt: new Date(DAY_START - 30 * 60_000).toISOString(), finishedAt: new Date(DAY_START - 29 * 60_000).toISOString(), outcome: 'succeeded', durationMs: 60_000 }, now)
  recordCollectorRun(db, { type: 'metar', startedAt: 'x', finishedAt: 'y', outcome: 'bogus' }, now)

  const today = readCollectionTimeline(db, { nowMs: now })
  assert.equal(today.dayStart, new Date(DAY_START).toISOString())
  assert.equal(Math.round(today.nowMinute), 620)
  assert.deepEqual(today.collectors.metar.runs, [{ at: 600, durationMs: 20_000, outcome: 'succeeded', reason: null }])
  assert.equal(today.collectors.amos.runs[0].reason, 'api_operation_timeout')
  assert.equal(today.collectors.metar.cadence, '5분마다')
  assert.equal(today.collectors.kim_surface_wind.cadence, '하루 11번')
  assert.equal(today.collectors.kim_gktg.childProcess, true)

  const yesterday = readCollectionTimeline(db, { nowMs: now, dayOffset: 1 })
  assert.equal(yesterday.nowMinute, null)
  assert.equal(yesterday.collectors.metar.runs.length, 1)
  assert.equal(Math.round(yesterday.collectors.metar.runs[0].at), 1410)
})

test('stats notifies every finished run with its start time, outcome and reason', () => {
  const seen = []
  let clock = 1_000_000
  __setPersistenceForTest({ now: () => clock, write: () => {} })
  stats.setRunListener((entry) => seen.push(entry))
  try {
    const run = stats.recordStart('amos')
    clock += 9_000
    stats.recordFailure('amos', 'api_operation_timeout', 9_000, run)
    stats.recordSkip('metar', 'already_running', stats.recordStart('metar'))
    stats.recordSuccess('taf', { failedAirports: ['RKPC'] }, 1_200, stats.recordStart('taf'))
    stats.noteSkippedRun('nwp_ecmwf', 'nwp_complete_or_disabled')
  } finally {
    stats.setRunListener(null)
    __setPersistenceForTest()
  }
  assert.deepEqual(seen.map((entry) => [entry.type, entry.outcome, entry.reason]), [
    ['amos', 'failed', 'api_operation_timeout'],
    ['metar', 'skipped', 'already_running'],
    ['taf', 'succeeded', '공항 1곳 실패: RKPC'],
    ['nwp_ecmwf', 'skipped', 'nwp_complete_or_disabled'],
  ])
  assert.equal(seen[0].startedAt, new Date(1_000_000).toISOString())
  assert.equal(seen[0].durationMs, 9_000)
})
