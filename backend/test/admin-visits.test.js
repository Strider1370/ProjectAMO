import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { recordVisit, trafficStats } from '../src/admin/visits.js'

test('recordVisit upserts; trafficStats counts online(5m) and total', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'vis-1'); recordVisit(db, 'vis-1'); recordVisit(db, 'vis-2')
  const s = trafficStats(db)
  assert.equal(s.total, 2)
  assert.equal(s.online, 2) // 방금 기록 → 5분 내
})

test('trafficStats.activeUsers: 로그인 계정의 last_active_at 기준, 방문 쿠키와는 별개 집계', () => {
  const db = createDb(':memory:')
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 40 * 86400e3).toISOString()
  db.prepare("INSERT INTO users (username, password_hash, created_at, last_active_at) VALUES (?,?,?,?)").run('recent', 'x', now, now)
  db.prepare("INSERT INTO users (username, password_hash, created_at, last_active_at) VALUES (?,?,?,?)").run('stale', 'x', now, old)
  db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)").run('never', 'x', now)

  const s = trafficStats(db)
  assert.equal(s.activeUsers.last7d, 1)
  assert.equal(s.activeUsers.last30d, 1)
})

test('traffic DTO는 visitor cookie 분모와 KST request-event 시간대를 명시한다', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'v1')
  const s = trafficStats(db)
  assert.equal(s.measurement.visitors.unit, 'unique_browser_cookie_visitor_ids')
  assert.equal(s.measurement.visitors.total.retentionMs, 90 * 24 * 60 * 60 * 1000)
  assert.equal(s.measurement.hourlyRequests.businessDay, 'Asia/Seoul_calendar_day')
  assert.equal(s.measurement.byHour.timezone, 'Asia/Seoul')
  assert.equal(s.measurement.byHour.unit, 'unique_browser_cookie_visitor_ids_at_last_seen')
  assert.equal(s.measurement.activeUsers.unit, 'authenticated_user_accounts')
})

test('trafficStats.byHour는 UTC last_seen을 KST 현재 날짜·시각 bucket으로 낸다', () => {
  const db = createDb(':memory:')
  db.prepare('INSERT INTO visits (visitor_id,first_seen,last_seen) VALUES (?,?,?)').run('kst-morning', '2026-08-11T00:30:00.000Z', '2026-08-11T00:30:00.000Z')
  db.prepare('INSERT INTO visits (visitor_id,first_seen,last_seen) VALUES (?,?,?)').run('previous-kst-day', '2026-08-10T14:59:00.000Z', '2026-08-10T14:59:00.000Z')

  const stats = trafficStats(db, { now: Date.parse('2026-08-11T00:40:00.000Z') })
  assert.deepEqual(stats.byHour, [{ hh: '09', n: 1 }], 'UTC 00:30은 KST 09시이고 UTC 14:59 전날은 현재 KST 날짜에서 제외한다')
})
