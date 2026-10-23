import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createDb } from '../src/db/index.js'
import { queueUserAlertDeliveries, dispatchPendingUserAlerts } from '../src/user-alerts/delivery.js'

const start = Date.parse('2026-10-23T10:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()

function fixture() {
  const db = createDb(':memory:')
  const userId = Number(db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)')
    .run('recipient', 'x', iso(start)).lastInsertRowid)
  const subscriptionId = Number(db.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,created_at)
    VALUES (?,?,?,?,?)`).run(userId, 'https://push.example/one', 'p256', 'auth', iso(start)).lastInsertRowid)
  const eventId = Number(db.prepare(`INSERT INTO airport_alert_events(user_id,icao,kind,payload,detected_at)
    VALUES (?,?,?,?,?)`).run(userId, 'RKSI', 'taf', JSON.stringify({ title: '인천국제공항 TAF AMD',
      reportType: 'AMD', issuedAt: iso(start), text: 'TAF AMD RKSI ...' }), iso(start)).lastInsertRowid)
  return { db, userId, subscriptionId, eventId }
}

test('한 사건·기기당 한 번 발송하고 일시 오류는 재시작 후 대기열에서 재시도한다', async (t) => {
  const { db, userId, eventId } = fixture()
  t.after(() => db.close())
  assert.equal(queueUserAlertDeliveries(db, { source: 'airport', eventId, userId, nowIso: iso(start) }), 1)
  assert.equal(queueUserAlertDeliveries(db, { source: 'airport', eventId, userId, nowIso: iso(start) }), 0)
  const failed = await dispatchPendingUserAlerts(db, { nowMs: start, sendPushImpl: async () => { throw new Error('temporary') } })
  assert.equal(failed.retried, 1)
  assert.equal(db.prepare('SELECT state FROM user_alert_deliveries').get().state, 'retry')
  let sends = 0
  await dispatchPendingUserAlerts(db, { nowMs: start + 60_000, sendPushImpl: async () => { sends++ } })
  assert.equal(sends, 0, 'backoff before retry')
  const sent = await dispatchPendingUserAlerts(db, { nowMs: start + 120_000,
    sendPushImpl: async (_subscription, payload) => {
      sends++
      assert.equal(payload.url, `/?alert=airport:${eventId}`)
      assert.match(payload.body, /TAF AMD RKSI/)
    } })
  assert.equal(sent.sent, 1)
  assert.equal(db.prepare('SELECT state FROM user_alert_deliveries').get().state, 'sent')
  assert.ok(db.prepare('SELECT pushed_at FROM airport_alert_events WHERE id=?').get(eventId).pushed_at)
  await dispatchPendingUserAlerts(db, { nowMs: start + 180_000, sendPushImpl: async () => { sends++ } })
  assert.equal(sends, 1)
})

test('구독이 계정을 옮기거나 만료되면 원래 계정의 사건을 보내지 않는다', async (t) => {
  const { db, userId, subscriptionId, eventId } = fixture()
  t.after(() => db.close())
  queueUserAlertDeliveries(db, { source: 'airport', eventId, userId, nowIso: iso(start) })
  const another = Number(db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)')
    .run('other', 'x', iso(start)).lastInsertRowid)
  db.prepare('UPDATE push_subscriptions SET user_id=? WHERE id=?').run(another, subscriptionId)
  const result = await dispatchPendingUserAlerts(db, { nowMs: start,
    sendPushImpl: async () => { throw new Error('wrong owner received push') } })
  assert.equal(result.expired, 1)
  assert.equal(db.prepare('SELECT state FROM user_alert_deliveries').get().state, 'expired')
})

test('기존 대기열에 endpoint 열을 추가해도 이미 접수된 발송이 이어진다', async (t) => {
  const root = path.resolve('artifacts')
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.mkdtempSync(path.join(root, 'user-alert-delivery-migration-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const dbPath = path.join(dir, 'old.db')
  const initial = createDb(dbPath)
  const userId = Number(initial.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)')
    .run('migration-recipient', 'x', iso(start)).lastInsertRowid)
  const subscriptionId = Number(initial.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,created_at)
    VALUES (?,?,?,?,?)`).run(userId, 'https://push.example/migrated', 'p256', 'auth', iso(start)).lastInsertRowid)
  const eventId = Number(initial.prepare(`INSERT INTO airport_alert_events(user_id,icao,kind,payload,detected_at)
    VALUES (?,?,?,?,?)`).run(userId, 'RKSI', 'taf', '{"title":"TAF"}', iso(start)).lastInsertRowid)
  initial.close()
  const old = new Database(dbPath)
  old.exec('DROP TABLE user_alert_deliveries')
  old.exec(`CREATE TABLE user_alert_deliveries (
    source TEXT NOT NULL,event_id INTEGER NOT NULL,subscription_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,
    sent_at TEXT,last_error TEXT,PRIMARY KEY(source,event_id,subscription_id))`)
  old.prepare(`INSERT INTO user_alert_deliveries(source,event_id,subscription_id,user_id,next_attempt_at)
    VALUES (?,?,?,?,?)`).run('airport', eventId, subscriptionId, userId, iso(start))
  old.close()
  const db = createDb(dbPath)
  t.after(() => db.close())
  assert.equal(db.prepare('SELECT endpoint FROM user_alert_deliveries').get().endpoint, 'https://push.example/migrated')
  const result = await dispatchPendingUserAlerts(db, { nowMs: start, sendPushImpl: async () => {} })
  assert.equal(result.sent, 1)
})
