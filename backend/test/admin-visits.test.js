import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { recordVisit, trafficStats, visitExclusionReason, visitTracker } from '../src/admin/visits.js'

function sendVisit(tracker, { path = '/api/auth/me', method = 'GET', ua = '', analytics = '', cookies = {} } = {}) {
  const req = {
    path, method, cookies,
    get(name) { return name.toLowerCase() === 'user-agent' ? ua : name.toLowerCase() === 'x-projectamo-analytics' ? analytics : '' },
  }
  const issued = []
  const res = { cookie(...args) { issued.push(args) } }
  let nextCalls = 0
  tracker(req, res, () => { nextCalls += 1 })
  assert.equal(nextCalls, 1)
  return issued
}

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

test('visitTracker는 봇과 내부 점검을 세 방문 표에서 제외하고 응답 흐름은 이어간다', () => {
  const db = createDb(':memory:')
  const tracker = visitTracker(() => db)
  const before = trafficStats(db).excludedRequests.counts
  const candidates = [
    { ua: 'Mozilla/5.0 HeadlessChrome/149.0.7827.55 Safari/537.36', reason: 'headless' },
    { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)', reason: 'known_bot' },
    { ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', reason: 'known_bot' },
    { ua: 'python-urllib3/2.8.0', reason: 'http_tool' },
    { ua: 'Mozilla/5.0 Chrome/155.0.0.0', analytics: 'ignore', reason: 'internal_test' },
  ]
  for (const { reason, ...request } of candidates) {
    assert.equal(visitExclusionReason({ get: (name) => name.toLowerCase() === 'user-agent' ? request.ua : request.analytics }), reason)
    assert.equal(sendVisit(tracker, request).length, 0)
  }
  for (const table of ['visits', 'visit_days', 'visit_hours']) {
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0, table)
  }
  const after = trafficStats(db).excludedRequests.counts
  assert.equal(after.headless - before.headless, 1)
  assert.equal(after.known_bot - before.known_bot, 2)
  assert.equal(after.http_tool - before.http_tool, 1)
  assert.equal(after.internal_test - before.internal_test, 1)
  assert.equal(trafficStats(db).measurement.visitorFilter.historicalRecordsMayIncludeAutomatedVisits, true)
})

test('visitTracker는 일반 브라우저의 익명 방문과 재방문을 기록한다', () => {
  const db = createDb(':memory:')
  const tracker = visitTracker(() => db)
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156.0.0.0 Edg/156.0.0.0',
    'Mozilla/5.0 (Linux; Android 10; K) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 16) KAKAOTALK/26.7.2 (INAPP)',
  ]
  const first = sendVisit(tracker, { ua: uas[0] })
  assert.equal(first.length, 1)
  assert.equal(first[0][0], 'amo.vid')
  const vid = first[0][1]
  assert.equal(sendVisit(tracker, { ua: uas[0], cookies: { 'amo.vid': vid } }).length, 0)
  for (const ua of uas.slice(1)) assert.equal(sendVisit(tracker, { ua }).length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM visits').get().n, 4)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM visit_days').get().n, 4)
  assert.equal(db.prepare('SELECT SUM(n) n FROM visit_hours').get().n, 5)

  sendVisit(tracker, { ua: 'Mozilla/5.0 HeadlessChrome/149.0.7827.55', cookies: { 'amo.vid': vid } })
  assert.equal(db.prepare('SELECT SUM(n) n FROM visit_hours').get().n, 5, '기존 방문 쿠키를 보낸 봇도 재방문으로 기록하지 않는다')
  sendVisit(tracker, { path: '/api/metar', ua: uas[0] })
  assert.equal(db.prepare('SELECT SUM(n) n FROM visit_hours').get().n, 5)
})
