import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db/index.js'
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../src/me/alerts.js'

const at = '2026-10-23T10:00:00.000Z'
const user = (db, name) => Number(db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)')
  .run(name, 'x', at).lastInsertRowid)
const airport = (db, userId, icao = 'RKSI', time = at) => Number(db.prepare(`INSERT INTO airport_alert_events
  (user_id,icao,kind,payload,detected_at) VALUES (?,?,?,?,?)`)
  .run(userId, icao, 'metar', JSON.stringify({ title: `${icao} 관측`, metrics: [] }), time).lastInsertRowid)
function route(db, userId, name = '김포 → 제주') {
  const watchId = Number(db.prepare(`INSERT INTO route_sigmet_watches
    (user_id,route_id,route_name,route_snapshot,updated_at) VALUES (?,?,?,?,?)`)
    .run(userId, 10, name, '{}', at).lastInsertRowid)
  return Number(db.prepare(`INSERT INTO route_sigmet_events
    (watch_id,user_id,route_id,source_key,payload,detected_at) VALUES (?,?,?,?,?,?)`)
    .run(watchId, userId, 10, 'sigmet-1', JSON.stringify({ routeName: name, phenomenon: '뇌우' }), at).lastInsertRowid)
}
function organization(db, userId) {
  const orgId = Number(db.prepare(`INSERT INTO organizations(name,created_by,created_at,updated_at) VALUES (?,?,?,?)`)
    .run('기상팀', userId, at, at).lastInsertRowid)
  db.prepare(`INSERT INTO organization_members(organization_id,user_id,role,status,created_at,updated_at)
    VALUES (?,?,'member','active',?,?)`).run(orgId, userId, at, at)
  const eventId = Number(db.prepare(`INSERT INTO organization_alerts
    (organization_id,event_key,kind,payload,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
    .run(orgId, 'warning-1', 'airport_warning', JSON.stringify({ targetName: '김포국제공항', title: '강풍경보' }), at, at).lastInsertRowid)
  return { orgId, eventId }
}

test('공항·경로·기관 알림을 한 피드에 모으고 옛 예정비행 기록은 이력에서만 보인다', () => {
  const db = createDb(':memory:')
  try {
    const alice = user(db, 'alice'), bob = user(db, 'bob')
    airport(db, alice, 'RKSI', '2026-10-23T09:00:00.000Z')
    route(db, alice)
    const org = organization(db, alice)
    airport(db, bob, 'RKPC')
    const oldRoute = db.prepare('INSERT INTO routes(user_id,name,created_at,updated_at) VALUES (?,?,?,?)')
      .run(alice, '이전 비행', at, at).lastInsertRowid
    db.prepare(`INSERT INTO triggered_alerts(user_id,route_id,type,severity,dedup_key,detected_at)
      VALUES (?,?,'TS','ALERT','old',?)`).run(alice, oldRoute, at)
    const feed = listNotifications(db, alice)
    assert.equal(feed.notifications.length, 3)
    assert.equal(feed.unreadCount, 3)
    assert.deepEqual(new Set(feed.notifications.map((item) => item.source)), new Set(['airport', 'route', 'organization']))
    assert.equal(feed.notifications.find((item) => item.source === 'organization').routeName, '기상팀 · 김포국제공항')
    assert.equal(markNotificationRead(db, bob, `organization:${org.eventId}`, at), false)
  } finally { db.close() }
})

test('읽음은 소유자·활성 기관 구성원에게만 허용하고 모두 읽음은 세 종류를 갱신한다', () => {
  const db = createDb(':memory:')
  try {
    const alice = user(db, 'alice'), bob = user(db, 'bob')
    const airportId = airport(db, alice)
    const routeId = route(db, alice)
    const org = organization(db, alice)
    assert.equal(markNotificationRead(db, bob, `airport:${airportId}`, at), false)
    assert.equal(markNotificationRead(db, bob, `route:${routeId}`, at), false)
    assert.equal(markNotificationRead(db, bob, `organization:${org.eventId}`, at), false)
    assert.equal(markNotificationRead(db, alice, `airport:${airportId}`, at), true)
    assert.equal(markAllNotificationsRead(db, alice, at), 2)
    assert.equal(markAllNotificationsRead(db, alice, at), 0)
    assert.equal(listNotifications(db, alice).unreadCount, 0)
    db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?")
      .run(org.orgId, alice)
    assert.equal(markNotificationRead(db, alice, `organization:${org.eventId}`, at), false)
    assert.equal(listNotifications(db, alice).notifications.some((item) => item.source === 'organization'), false)
  } finally { db.close() }
})
