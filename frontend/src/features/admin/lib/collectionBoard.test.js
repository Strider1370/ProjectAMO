import test from 'node:test'
import assert from 'node:assert/strict'

import { boardGroups, hourCell, minuteClock, nextScheduled, reasonText, runSummary, upcomingRuns } from './collectionBoard.js'

const fiveMinute = Array.from({ length: 288 }, (_, i) => i * 5)

test('a frequent collector paints the hour by its outcomes and keeps the rest of the current hour as planned', () => {
  const entry = { scheduled: fiveMinute, runs: [
    { at: 600, outcome: 'succeeded', durationMs: 1000 },
    { at: 605, outcome: 'failed', durationMs: 8000, reason: 'api_operation_timeout' },
    { at: 610, outcome: 'succeeded', durationMs: 1000 },
  ] }
  const current = hourCell(entry, 10, 612)
  assert.equal(current.frequent, true)
  assert.equal(current.tone, 'part')
  assert.deepEqual(current.count, { succeeded: 2, failed: 1, skipped: 0 })
  assert.equal(current.futureFrom, 612)
  assert.equal(hourCell(entry, 11, 612).tone, 'plan')
  assert.equal(hourCell(entry, 9, 612).tone, 'none')
  assert.equal(hourCell({ scheduled: fiveMinute, runs: [{ at: 60, outcome: 'skipped', reason: 'api_hub_key_blocked' }] }, 1, 600).tone, 'skip')
})

test('a scheduled collector shows a dot per run, a no-record mark for a missed slot and hollow future slots', () => {
  const entry = { scheduled: [132, 852, 1212], runs: [{ at: 132.2, outcome: 'succeeded', durationMs: 540000 }, { at: 141, outcome: 'succeeded' }] }
  assert.deepEqual(hourCell(entry, 2, 600).dots.map((dot) => dot.kind), ['ok', 'ok'])
  assert.deepEqual(hourCell({ scheduled: [132], runs: [] }, 2, 600).dots.map((dot) => dot.kind), ['none'])
  assert.deepEqual(hourCell(entry, 14, 600).dots.map((dot) => dot.kind), ['plan'])
  assert.equal(hourCell(entry, 14, 600).tone, 'plan')
})

test('summaries, next run, clock and reasons read the way an operator speaks', () => {
  const entry = { scheduled: [132, 852], runs: [{ at: 1, outcome: 'succeeded', durationMs: 3000 }, { at: 2, outcome: 'failed', durationMs: 9000 }, { at: 3, outcome: 'skipped' }] }
  assert.deepEqual(runSummary(entry), { total: 3, count: { succeeded: 1, failed: 1, skipped: 1 }, medianMs: 9000, maxMs: 9000 })
  assert.equal(nextScheduled(entry, 600), 852)
  assert.equal(nextScheduled(entry, null), null)
  assert.equal(minuteClock(852.7), '14:12')
  assert.equal(reasonText('api_operation_timeout'), '기상청 응답 없음')
  assert.equal(reasonText('already_running'), '이전 실행이 아직 진행 중')
  assert.equal(reasonText('HTTP 503'), 'HTTP 503')
  assert.equal(reasonText(null), null)
})

test('rows group by data source, filter to problems and list the next timed runs', () => {
  const health = {
    groups: { source: [{ id: 'kma_aviation', label: '기상청 항공키' }, { id: 'kma_nwp', label: '수치예보키' }, { id: 'noaa', label: 'NOAA' }] },
    rows: [
      { key: 'metar', statsKey: 'metar', source: 'kma_aviation', status: 'ok', label: 'METAR 국내' },
      { key: 'amos', statsKey: 'amos', source: 'kma_aviation', status: 'late', label: 'AMOS' },
      { key: 'kim_nwp', statsKey: 'kim_surface_wind', source: 'kma_nwp', status: 'ok', label: 'KIM 수치예보 격자' },
    ],
  }
  assert.deepEqual(boardGroups(health).map((group) => [group.id, group.rows.length]), [['kma_aviation', 2], ['kma_nwp', 1]])
  assert.deepEqual(boardGroups(health, { onlyProblems: true }).map((group) => group.rows.map((row) => row.key)), [['amos']])
  const timeline = { nowMinute: 600, collectors: { metar: { scheduled: fiveMinute }, kim_surface_wind: { scheduled: [612, 852] } } }
  assert.deepEqual(upcomingRuns(health, timeline), [{ minute: 612, label: 'KIM 수치예보 격자' }])
  assert.deepEqual(upcomingRuns(health, { ...timeline, nowMinute: null }), [])
})
