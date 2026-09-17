import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { recordVisit } from '../src/admin/visits.js'
import { bucketByDay, visitTrend, newVisitorTrend, signupTrend, readTrends } from '../src/admin/trends.js'

test('bucketByDay: day는 그대로, week는 일요일 시작으로, month는 YYYY-MM으로 묶는다', () => {
  const rows = [
    { day: '2026-07-05', n: 2 }, // 일요일
    { day: '2026-07-06', n: 3 }, // 같은 주(월요일)
    { day: '2026-07-13', n: 1 }, // 다음 주 일요일
    { day: '2026-08-01', n: 4 }, // 다음 달
  ]
  assert.deepEqual(bucketByDay(rows, 'day'), rows.map((r) => ({ period: r.day, n: r.n })))
  assert.deepEqual(bucketByDay(rows, 'week'), [
    { period: '2026-07-05', n: 5 }, // 7/5(일)~7/6(월)이 속한 주
    { period: '2026-07-12', n: 1 }, // 7/13(월)이 속한 주의 일요일
    { period: '2026-07-26', n: 4 }, // 8/1(토)이 속한 주의 일요일
  ])
  assert.deepEqual(bucketByDay(rows, 'month'), [
    { period: '2026-07', n: 6 },
    { period: '2026-08', n: 4 },
  ])
})

test('visit_days는 방문자당 하루 한 줄로 중복 없이 쌓여 visitTrend에 그대로 반영된다', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'v1'); recordVisit(db, 'v1'); recordVisit(db, 'v1') // 같은 날 세 번
  recordVisit(db, 'v2')
  const trend = visitTrend(db, 'day')
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(trend.find((t) => t.period === today)?.n, 2, '같은 날 재방문은 한 번만 잡힌다')
})

test('newVisitorTrend: first_seen 기준, 재방문으로는 안 늘어난다', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'v1'); recordVisit(db, 'v1')
  recordVisit(db, 'v2')
  const trend = newVisitorTrend(db, 'day')
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(trend.find((t) => t.period === today)?.n, 2)
})

test('signupTrend: users.created_at 날짜별 집계', () => {
  const db = createDb(':memory:')
  const now = new Date().toISOString()
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run('a', 'x', now)
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run('b', 'x', now)
  const trend = signupTrend(db, 'day')
  const today = now.slice(0, 10)
  assert.equal(trend.find((t) => t.period === today)?.n, 2)
})

test('trend DTO는 UTC business day와 방문자·신규 방문자 보관 한계를 명시한다', () => {
  const db = createDb(':memory:')
  const out = readTrends(db, 'month')
  assert.equal(out.measurement.timezone, 'UTC')
  assert.equal(out.measurement.businessDay, 'UTC_calendar_day')
  assert.equal(out.measurement.visits.unit, 'unique_browser_cookie_visitor_ids_per_utc_day')
  assert.equal(out.measurement.newVisitors.retentionMs, 90 * 24 * 60 * 60 * 1000)
  assert.equal(out.measurement.newVisitors.historicalCompleteness, 'limited_to_retained_visits')
})
