import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { pushBodyWithinLimit } from '../src/airport-alerts/service.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createAlertTestRouter } from '../src/user-alerts/test-router.js'
import { DEFAULT_AIRPORT_ALERT_RULES } from '../src/airport-alerts/rules.js'
import { evaluateAirportTest } from '../src/user-alerts/airport-test.js'

const instant = Date.parse('2026-10-23T03:00:00Z')
const headers = { 'content-type': 'application/json', connection: 'close' }
const url = (server, path) => `http://127.0.0.1:${server.address().port}${path}`

async function login(server, db, username) {
  await fetch(url(server, '/api/auth/register'), { method: 'POST', headers,
    body: JSON.stringify({ username, password: 'password1' }) })
  db.prepare("UPDATE users SET status='active' WHERE username=?").run(username)
  const response = await fetch(url(server, '/api/auth/login'), { method: 'POST', headers,
    body: JSON.stringify({ username, password: 'password1' }) })
  return response.headers.get('set-cookie').split(';')[0]
}

test('각 공항 시나리오는 실제 판정기로 발동하고 저장된 감시 상태를 바꾸지 않는다', () => {
  const db = createDb(':memory:')
  try {
    db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .run(1, 'owner', 'hash', new Date(instant).toISOString())
    const rules = JSON.stringify({ ...DEFAULT_AIRPORT_ALERT_RULES, fzra: { enabled: true }, windshear: { enabled: true },
      tafNew: { enabled: true }, tafAmd: { enabled: true } })
    db.prepare('INSERT INTO airport_alert_watches(user_id,icao,rules,updated_at) VALUES(?,?,?,?)')
      .run(1, 'RKSS', rules, new Date(instant).toISOString())
    const watch = db.prepare('SELECT * FROM airport_alert_watches WHERE user_id=1').get()
    for (const scenario of ['metar', 'windshear', 'fzra', 'taf_new', 'taf_amd', 'airport_warning', 'lightning']) {
      const result = evaluateAirportTest(watch, scenario, instant)
      assert.equal(result.kind, ['fzra', 'windshear'].includes(scenario) ? 'metar' : scenario.startsWith('taf_') ? 'taf' : scenario)
      assert.ok(result.payload.title)
      if (scenario === 'metar') assert.equal(result.payload.metrics.length, 4)
      if (scenario === 'fzra') assert.ok(result.payload.metrics.some((metric) => metric.key === 'fzra'))
      if (scenario.startsWith('taf_')) assert.match(result.payload.text, /TAF/)
      if (scenario === 'lightning') assert.equal(result.payload.count, 1)
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM airport_alert_events').get().n, 0)
    assert.equal(db.prepare('SELECT state FROM airport_alert_watches WHERE user_id=1').get().state, '{}')
  } finally { db.close() }
})

test('운영 시험은 본인 감시·현재 기기 구독만 사용하고 딥링크가 소유자에게만 열린다', async (t) => {
  const db = createDb(':memory:')
  const sent = []
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createAlertTestRouter({ db, now: () => instant,
    sendPushImpl: async (sub, payload) => { sent.push({ sub, payload }) } }))
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => { server.close(); db.close() })

  const owner = await login(server, db, 'testowner')
  const other = await login(server, db, 'testother')
  const userId = db.prepare("SELECT id FROM users WHERE username='testowner'").get().id
  db.prepare('INSERT INTO airport_alert_watches(user_id,icao,rules,updated_at) VALUES(?,?,?,?)')
    .run(userId, 'RKSS', JSON.stringify(DEFAULT_AIRPORT_ALERT_RULES), new Date(instant).toISOString())
  db.prepare('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?)')
    .run(userId, 'https://example.test/my-phone', 'key', 'auth', new Date(instant).toISOString())
  db.prepare('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?)')
    .run(userId, 'https://example.test/other-device', 'key', 'auth', new Date(instant).toISOString())

  const body = JSON.stringify({ icao: 'RKSS', scenario: 'metar', endpoint: 'https://example.test/my-phone' })
  const post = (cookie, value = body) => fetch(url(server, '/api/me/alert-tests'), {
    method: 'POST', headers: { ...headers, cookie }, body: value,
  })
  assert.equal((await post(other)).status, 404)
  assert.equal((await post(owner, JSON.stringify({ icao: 'RKSS', scenario: 'metar', endpoint: 'https://example.test/foreign' }))).status, 400)
  const response = await post(owner)
  assert.equal(response.status, 201)
  const { test: run } = await response.json()
  assert.equal(run.kind, 'metar')
  assert.equal(run.test, true)
  assert.equal(run.pushStatus, 'sent')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].sub.endpoint, 'https://example.test/my-phone')
  assert.equal(sent[0].payload.url, `/?alertTest=${run.id}`)
  assert.match(sent[0].payload.title, /^테스트 · /)
  assert.equal((await fetch(url(server, `/api/me/alert-tests/${run.id}`), { headers: { ...headers, cookie: other } })).status, 404)
  assert.equal((await fetch(url(server, `/api/me/alert-tests/${run.id}`), { headers: { ...headers, cookie: owner } })).status, 200)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM airport_alert_events').get().n, 0)
  assert.equal(db.prepare('SELECT state FROM airport_alert_watches WHERE user_id=?').get(userId).state, '{}')

  const routeSnapshot = { routeGeometry: { type: 'LineString', coordinates: [[126.8, 37.5], [127.3, 37.5]] },
    etd: new Date(instant + 30 * 60_000).toISOString(), eta: new Date(instant + 2 * 60 * 60_000).toISOString(),
    cruiseAltitudeFt: 12000 }
  const watchId = db.prepare('INSERT INTO route_sigmet_watches(user_id,route_id,route_name,route_snapshot,updated_at) VALUES(?,?,?,?,?)')
    .run(userId, 7, '시험 경로', JSON.stringify(routeSnapshot), new Date(instant).toISOString()).lastInsertRowid
  const routeBody = JSON.stringify({ routeWatchId: Number(watchId), scenario: 'sigmet', endpoint: 'https://example.test/my-phone' })
  assert.equal((await post(other, routeBody)).status, 404)
  const routeResponse = await post(owner, routeBody)
  assert.equal(routeResponse.status, 201)
  const routeRun = (await routeResponse.json()).test
  assert.equal(routeRun.kind, 'sigmet')
  assert.equal(routeRun.routeId, 7)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].payload.url, `/?alertTest=${routeRun.id}`)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_sigmet_events').get().n, 0)
})

test('긴 TAF 전문은 푸시 크기 안에서 자르고 전체 전문은 저장된 상세에서 확인하게 한다', () => {
  const raw = 'TAF RKSI ' + 'TEMPO 2222/2224 2000 -FZRA '.repeat(150)
  const body = pushBodyWithinLimit(raw)
  assert.ok(Buffer.byteLength(body, 'utf8') <= 2400)
  assert.match(body, /전문 전체는 알림을 눌러 확인하세요/)
  assert.equal(pushBodyWithinLimit('짧은 TAF'), '짧은 TAF')
})

test('TAF test alerts carry a realistic TAF with max/min temperature groups', async () => {
  const { sampleTafText } = await import('../src/user-alerts/airport-test.js')
  const text = sampleTafText('RKSI', Date.parse('2026-10-27T11:05:00Z'), true)
  assert.match(text, /^TAF AMD RKSI 271105Z 2712\/2818 /)
  assert.match(text, /TN06\/2721Z TX15\/2805Z/)
  assert.match(text, /\nTEMPO /)
})
