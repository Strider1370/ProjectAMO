import test from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { DEFAULT_AIRPORT_ALERT_RULES } from '../src/airport-alerts/rules.js'
import { metarMetricStates } from '../src/airport-alerts/evaluate.js'
import { runAirportAlertTick } from '../src/airport-alerts/service.js'
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../src/me/alerts.js'

const start = Date.parse('2026-10-21T03:00:00Z')
const iso = (ms) => new Date(ms).toISOString()
const rules = structuredClone(DEFAULT_AIRPORT_ALERT_RULES)

function dbWithWatches() {
  const db = createDb(':memory:')
  for (const id of [1, 2]) {
    db.prepare('INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,?)').run(id, `pilot${id}`, 'hash', iso(start))
    db.prepare('INSERT INTO airport_alert_watches (user_id,icao,rules,updated_at) VALUES (?,?,?,?)')
      .run(id, 'RKSS', JSON.stringify(rules), iso(start))
  }
  return db
}

function weather(now, { adverse = true, warning = true, strike = true, staleMetar = false, complete = true } = {}) {
  return {
    metar: { fetched_at: iso(now), airports: { RKSS: {
      header: { observation_time: iso(now - (staleMetar ? 3 * 60 * 60_000 : 5 * 60_000)) },
      observation: { visibility: { value: adverse ? 1200 : 5000 }, clouds: [{ amount: 'BKN', base: adverse ? 400 : 2000 }],
        wind: { speed: adverse ? 28 : 10, gust: adverse ? 38 : null }, temperature: { air: 20 } },
    } } },
    warning: { fetched_at: iso(now), airports: { RKSS: { warnings: warning ? [{ wrng_type_key: 'STRONG_WIND', wrng_type_name: '강풍경보', issued: iso(start), valid_start: iso(start - 60_000), valid_end: iso(now + 3_600_000) }] : [] } } },
    lightning: { fetched_at: iso(now), nationwide: {
      strikes: strike ? [{ time: iso(now - 2 * 60_000), lon: 126.7906, lat: 37.5586, type: 'G' }] : [],
      coverage: { status: complete ? 'complete' : 'partial', successfulWindows: complete
        ? [{ from: iso(now - 60 * 60_000), to: iso(now + 60_000) }]
        : [{ from: iso(now - 10 * 60_000), to: iso(now - 5 * 60_000) }] },
    } },
  }
}

test('공항별 여러 임계값·공항경보·낙뢰를 사용자마다 한 번만 기록하고 해소 후 재발을 알린다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  const first = await runAirportAlertTick(db, { weather: weather(start), nowMs: start })
  assert.deepEqual(first, { evaluated: 2, created: 6 })
  const feed = listNotifications(db, 1)
  assert.equal(feed.notifications.length, 3)
  assert.equal(feed.unreadCount, 3)
  assert.equal(feed.notifications.find((item) => item.type === 'metar').payload.metrics.length, 4)
  assert.equal(listNotifications(db, 2).notifications.length, 3)

  const same = await runAirportAlertTick(db, { weather: weather(start + 60_000), nowMs: start + 60_000 })
  assert.equal(same.created, 0)

  // 자료 범위가 불완전하면 '낙뢰 없음'을 해소로 단정하지 않는다.
  await runAirportAlertTick(db, { weather: weather(start + 120_000, { adverse: false, warning: false, strike: false, complete: false }), nowMs: start + 120_000 })
  assert.equal(db.prepare("SELECT active FROM airport_alert_events WHERE user_id=1 AND kind='lightning'").get().active, 1)

  await runAirportAlertTick(db, { weather: weather(start + 180_000, { adverse: false, warning: false, strike: false }), nowMs: start + 180_000 })
  assert.equal(db.prepare('SELECT COUNT(*) n FROM airport_alert_events WHERE user_id=1 AND active=1').get().n, 0)
  // 공항경보·낙뢰는 새로 생기고, METAR는 해소 1시간 안에 다시 들어와 방금 끝난 알림이 다시 진행 중이 된다.
  const again = await runAirportAlertTick(db, { weather: weather(start + 240_000), nowMs: start + 240_000 })
  assert.equal(again.created, 4)
  assert.equal(listNotifications(db, 1).notifications.length, 5)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM airport_alert_events WHERE user_id=1 AND kind='metar' AND active=1").get().n, 1)

  const airportId = listNotifications(db, 1).notifications[0].id
  assert.equal(markNotificationRead(db, 2, airportId, iso(start)), false)
  assert.equal(markNotificationRead(db, 1, airportId, iso(start)), true)
  assert.equal(markAllNotificationsRead(db, 1, iso(start)), 4)
  assert.equal(listNotifications(db, 1).unreadCount, 0)
  assert.equal(listNotifications(db, 2).unreadCount, 3)
})

test('METAR 기준을 오가도 1시간 안에는 다시 울리지 않고, 1시간이 지나면 새 알림을 보낸다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  const quiet = { warning: false, strike: false }
  const sent = []
  const tick = (ms, adverse) => runAirportAlertTick(db, { weather: weather(ms, { ...quiet, adverse }), nowMs: ms,
    sendPushImpl: async (_sub, payload) => { sent.push(payload.title) } })
  db.prepare("INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth,created_at) VALUES (1,'https://push.example/a','k','a',?)").run(iso(start))
  const metarCount = () => db.prepare("SELECT COUNT(*) n FROM airport_alert_events WHERE user_id=1 AND kind='metar'").get().n

  await tick(start, true)
  await tick(start + 30 * 60_000, false)
  await tick(start + 60 * 60_000, true) // 해소 30분 뒤 다시 기준 안 → 같은 알림을 이어 간다
  assert.equal(metarCount(), 1)
  assert.equal(sent.length, 1)

  await tick(start + 90 * 60_000, false)
  await tick(start + 160 * 60_000, true) // 해소 70분 뒤 → 새 알림
  assert.equal(metarCount(), 2)
  assert.equal(sent.length, 2)
})

test('밤 시간 푸시 끄기: 그 시간에는 알림만 기록하고 푸시는 보내지 않는다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  const { writeQuietHours } = await import('../src/user-alerts/quiet-hours.js')
  db.prepare("INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth,created_at) VALUES (1,'https://push.example/a','k','a',?)").run(iso(start))
  // start = 03:00Z = 12:00 KST. 11:00–13:00 KST를 밤 시간으로 둔다.
  writeQuietHours(db, 1, { enabled: true, start: 11 * 60, end: 13 * 60 })
  const sent = []
  await runAirportAlertTick(db, { weather: weather(start, { warning: false, strike: false }), nowMs: start,
    sendPushImpl: async (_sub, payload) => { sent.push(payload.title) } })
  assert.equal(listNotifications(db, 1).notifications.length, 1)
  assert.equal(sent.length, 0)

  // 끄면 다시 보낸다.
  writeQuietHours(db, 1, { enabled: false, start: 11 * 60, end: 13 * 60 })
  await runAirportAlertTick(db, { weather: weather(start + 60_000, { warning: true, strike: false }), nowMs: start + 60_000,
    sendPushImpl: async (_sub, payload) => { sent.push(payload.title) } })
  assert.equal(sent.length, 1)
})

test('오래된 METAR와 누락된 관측은 새 임계값 알림을 만들지 않는다', () => {
  const old = weather(start, { staleMetar: true }).metar.airports.RKSS
  assert.equal(metarMetricStates(old, rules, start), null)
  const current = weather(start).metar.airports.RKSS
  delete current.observation.visibility.value
  const result = metarMetricStates(current, rules, start)
  assert.equal(result.states.visibility, 'unknown')
  assert.equal(result.states.wind, 'active')
})

test('낙뢰 관측 종료 시각이 평가 시각보다 앞서도 완전한 관측 창이면 해소한다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  await runAirportAlertTick(db, { weather: weather(start), nowMs: start })
  const next = weather(start + 60_000, { strike: false })
  next.lightning.nationwide.coverage.referenceTime = iso(start)
  next.lightning.nationwide.coverage.successfulWindows = [{ from: iso(start - 60 * 60_000), to: iso(start) }]
  await runAirportAlertTick(db, { weather: next, nowMs: start + 60_000 })
  assert.equal(db.prepare("SELECT active FROM airport_alert_events WHERE user_id=1 AND kind='lightning'").get().active, 0)
})

test('동시 발생한 사건도 각 이벤트 ID로 푸시해 해당 상세로 이동한다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  db.prepare('INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?)')
    .run(1, 'https://example.test/push', 'key', 'auth', iso(start))
  const payloads = []
  await runAirportAlertTick(db, { weather: weather(start), nowMs: start,
    sendPushImpl: async (_subscription, payload) => { payloads.push(payload) } })
  assert.equal(payloads.length, 3)
  assert.ok(payloads.some((item) => /시정 1200m/.test(item.body)))
  assert.ok(payloads.some((item) => /강풍경보/.test(item.body)))
  assert.ok(payloads.some((item) => /반경 10km · 최근 \d+분 · 1건/.test(item.body)))
  assert.ok(payloads.every((item) => /^\/\?alert=airport:\d+$/.test(item.url)))
  assert.equal(new Set(payloads.map((item) => item.url)).size, 3)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM airport_alert_events WHERE user_id=1 AND pushed_at IS NOT NULL').get().n, 3)
})

test('새 TAF와 AMD는 최초 기준점 이후 발표당 한 번 저장하고 전문을 보존한다', async (t) => {
  const db = dbWithWatches()
  t.after(() => db.close())
  const tafRules = { ...rules, tafNew: { enabled: true }, tafAmd: { enabled: true } }
  db.prepare('UPDATE airport_alert_watches SET rules=?').run(JSON.stringify(tafRules))
  const tafAt = (issued, reportStatus, text) => ({ fetched_at: issued, airports: { RKSS: { header: {
    issued, valid_start: issued, valid_end: iso(start + 24 * 60 * 60_000), report_status: reportStatus,
    raw_text: text, source: { identifier: 'KMA' },
  } } } })
  const first = weather(start, { adverse: false, warning: false, strike: false })
  first.taf = tafAt(iso(start - 60 * 60_000), 'NORMAL', 'TAF RKSS BASELINE')
  await runAirportAlertTick(db, { weather: first, nowMs: start, sendPushImpl: async () => {} })
  assert.equal(db.prepare("SELECT COUNT(*) n FROM airport_alert_events WHERE kind='taf'").get().n, 0)
  const next = { ...first, taf: tafAt(iso(start + 60_000), 'NORMAL', 'TAF RKSS NEW FULL REPORT') }
  await runAirportAlertTick(db, { weather: next, nowMs: start + 60_000, sendPushImpl: async () => {} })
  await runAirportAlertTick(db, { weather: next, nowMs: start + 120_000, sendPushImpl: async () => {} })
  assert.equal(db.prepare("SELECT COUNT(*) n FROM airport_alert_events WHERE kind='taf'").get().n, 2)
  const amd = { ...first, taf: tafAt(iso(start + 180_000), 'AMENDMENT', 'TAF AMD RKSS COMPLETE') }
  await runAirportAlertTick(db, { weather: amd, nowMs: start + 180_000, sendPushImpl: async () => {} })
  const events = db.prepare("SELECT payload,active FROM airport_alert_events WHERE kind='taf' AND user_id=1 ORDER BY id").all()
  assert.equal(events.length, 2)
  assert.equal(events[0].active, 0)
  assert.equal(events[1].active, 1)
  assert.equal(JSON.parse(events[0].payload).text, 'TAF RKSS NEW FULL REPORT')
  assert.equal(JSON.parse(events[1].payload).reportType, 'AMD')
  await runAirportAlertTick(db, { weather: weather(start + 25 * 60 * 60_000, { adverse: false, warning: false, strike: false }),
    nowMs: start + 25 * 60 * 60_000, sendPushImpl: async () => {} })
  assert.equal(db.prepare("SELECT active FROM airport_alert_events WHERE kind='taf' AND user_id=1 ORDER BY id DESC LIMIT 1").get().active, 0)
})
