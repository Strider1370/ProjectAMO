import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../src/me/alerts.js'

const now = new Date().toISOString()
function mkUser(db, name) {
  return db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run(name, 'x', now).lastInsertRowid
}
function mkRoute(db, userId, name) {
  return db.prepare('INSERT INTO routes (user_id, name, created_at, updated_at) VALUES (?,?,?,?)').run(userId, name, now, now).lastInsertRowid
}
function mkAlert(db, userId, routeId, { type = 'CEIL', severity = 'HIGH', detectedAt = now, role = null } = {}) {
  return db.prepare(`INSERT INTO triggered_alerts (user_id, route_id, type, severity, source_id, dedup_key, detected_at)
    VALUES (?,?,?,?,?,?,?)`).run(userId, routeId, type, severity, role, `${type}:x`, detectedAt).lastInsertRowid
}

test('listNotifications: 내 알림만·최신순·경로명 조인·unreadCount', () => {
  const db = createDb(':memory:')
  try {
    const u1 = mkUser(db, 'u1'); const u2 = mkUser(db, 'u2')
    const r1 = mkRoute(db, u1, 'RKSI→RKPC')
    mkAlert(db, u1, r1, { type: 'CEIL', detectedAt: '2026-07-08T10:00:00Z' })
    mkAlert(db, u1, r1, { type: 'ALTERNATE_FLIP', detectedAt: '2026-07-08T11:00:00Z' }) // 더 최신
    mkAlert(db, u2, mkRoute(db, u2, 'other'), {}) // 남의 것

    const { notifications, unreadCount } = listNotifications(db, u1)
    assert.equal(notifications.length, 2, '내 것만')
    assert.equal(notifications[0].type, 'ALTERNATE_FLIP', '최신 먼저')
    assert.equal(notifications[0].routeName, 'RKSI→RKPC', '경로명 조인')
    assert.equal(unreadCount, 2)
  } finally { db.close() }
})

test('markNotificationRead: 한 건 읽음 → unreadCount 감소, 남의 것은 못 읽음', () => {
  const db = createDb(':memory:')
  try {
    const u1 = mkUser(db, 'u1'); const u2 = mkUser(db, 'u2')
    const a1 = mkAlert(db, u1, mkRoute(db, u1, 'r'), {})
    assert.equal(markNotificationRead(db, u1, a1, now), true)
    assert.equal(listNotifications(db, u1).unreadCount, 0)
    assert.equal(markNotificationRead(db, u2, a1, now), false, '남의 알림은 못 읽음')
  } finally { db.close() }
})

test('markAllNotificationsRead: 안 읽은 것만 일괄 → 갱신 수 반환', () => {
  const db = createDb(':memory:')
  try {
    const u1 = mkUser(db, 'u1')
    const r = mkRoute(db, u1, 'r')
    mkAlert(db, u1, r, {}); mkAlert(db, u1, r, { type: 'VIS' })
    assert.equal(markAllNotificationsRead(db, u1, now), 2)
    assert.equal(markAllNotificationsRead(db, u1, now), 0, '이미 다 읽음')
    assert.equal(listNotifications(db, u1).unreadCount, 0)
  } finally { db.close() }
})

// 역할(출발/도착/교체)은 source_id 컬럼에 담긴다. 피드가 그것을 안 내보내면
// 알림센터가 "도착 RKPC"를 "RKPC"로만 보여준다.
test('listNotifications: 역할을 함께 내보낸다 — 문구가 "도착 RKPC"로 읽히려면 필요하다', () => {
  const db = createDb(':memory:')
  try {
    const uid = mkUser(db, 'role-user')
    mkAlert(db, uid, mkRoute(db, uid, 'RKSI→RKPC'), { type: 'MINIMA', severity: 'ALERT', role: 'dest' })
    const { notifications } = listNotifications(db, uid)
    assert.equal(notifications[0].role, 'dest')
  } finally { db.close() }
})
