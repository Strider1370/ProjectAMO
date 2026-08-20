import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { listAlertWatches, watchStatus } from '../src/admin/alert-watches.js'

const NOW = Date.parse('2026-08-21T12:00:00Z')
const at = (h) => new Date(NOW + h * 3600 * 1000).toISOString()

test('watchStatus: 감시창 안이면 감시중', () => {
  // ETD 1시간 뒤, 감시 시작 6시간 전 → 이미 창 안이다.
  assert.equal(watchStatus({ etd: at(1), alert_start_min_before_etd: 360 }, NOW), 'watching')
})

test('watchStatus: 감시창 전이면 대기중 — 등록은 됐지만 아직 안 본다', () => {
  // ETD 10시간 뒤, 감시 시작 6시간 전 → 아직 4시간 남았다.
  assert.equal(watchStatus({ etd: at(10), alert_start_min_before_etd: 360 }, NOW), 'pending')
})

test('watchStatus: ETD를 지나면 종료 — 이륙하면 폰이 비행모드다', () => {
  assert.equal(watchStatus({ etd: at(-1), alert_start_min_before_etd: 360 }, NOW), 'ended')
})

test('watchStatus: 감시 시작이 비어 있으면 기본 6시간으로 본다', () => {
  assert.equal(watchStatus({ etd: at(5), alert_start_min_before_etd: null }, NOW), 'watching')
  assert.equal(watchStatus({ etd: at(7), alert_start_min_before_etd: null }, NOW), 'pending')
})

test('watchStatus: ETD가 없거나 깨졌으면 판정하지 않는다', () => {
  assert.equal(watchStatus({ etd: null, alert_start_min_before_etd: 360 }, NOW), 'unknown')
  assert.equal(watchStatus({ etd: 'not-a-time', alert_start_min_before_etd: 360 }, NOW), 'unknown')
})

function seed(db, { username, etd, startMin = 360, withPush = false, alerts = 0 }) {
  const now = new Date(NOW).toISOString()
  const uid = db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)')
    .run(username, 'x', 'pilot', now).lastInsertRowid
  if (withPush) {
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)')
      .run(uid, `https://push.example/${username}`, 'p', 'a', now)
  }
  const payload = JSON.stringify({ base: { routeForm: { departureAirport: 'RKSI', arrivalAirport: 'RKPK' } } })
  const rid = db.prepare(`INSERT INTO routes (user_id, name, etd, payload, alert_enabled, alert_start_min_before_etd, created_at, updated_at)
    VALUES (?,?,?,?,1,?,?,?)`).run(uid, `${username} 비행`, etd, payload, startMin, now, now).lastInsertRowid
  for (let i = 0; i < alerts; i += 1) {
    db.prepare(`INSERT INTO triggered_alerts (user_id, route_id, type, severity, dedup_key, detected_at)
      VALUES (?,?,?,?,?,?)`).run(uid, rid, 'TS', 'ALERT', `k${i}`, now)
  }
  return rid
}

test('listAlertWatches: 등록된 감시를 전부 내되 감시중을 먼저 보여준다', () => {
  const db = createDb(':memory:')
  try {
    seed(db, { username: 'ended', etd: at(-2) })
    seed(db, { username: 'pending', etd: at(20), startMin: 360 })
    seed(db, { username: 'watching', etd: at(1), withPush: true, alerts: 3 })

    const rows = listAlertWatches(db, NOW)
    assert.deepEqual(rows.map((r) => r.status), ['watching', 'pending', 'ended'], '급한 것이 위로')

    const w = rows[0]
    assert.equal(w.username, 'watching')
    assert.equal(w.departureAirport, 'RKSI')
    assert.equal(w.arrivalAirport, 'RKPK')
    assert.equal(w.alertCount, 3, '이 비행에서 발생한 알림 수')
    assert.equal(w.pushSubscribed, true)
    assert.equal(rows[2].pushSubscribed, false, '구독이 없으면 폰으로는 못 간다 — 관리자가 알아야 한다')
  } finally { db.close() }
})

test('listAlertWatches: 감시가 꺼진 경로는 목록에 없다 — 더는 보고 있지 않다', () => {
  const db = createDb(':memory:')
  try {
    const rid = seed(db, { username: 'off', etd: at(1) })
    db.prepare('UPDATE routes SET alert_enabled=0 WHERE id=?').run(rid)
    assert.deepEqual(listAlertWatches(db, NOW), [])
  } finally { db.close() }
})
