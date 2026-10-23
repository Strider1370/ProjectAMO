import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createRouteAlertRouter } from '../src/user-alerts/route-router.js'
import { createRoutesRouter } from '../src/me/routes.js'
import { evaluateRouteSigmetWatch, evaluateRouteTest, routeAlertSnapshot } from '../src/user-alerts/route-sigmet.js'
import { listNotifications, markNotificationRead } from '../src/me/alerts.js'

const now = Date.parse('2026-10-23T03:00:00Z')
const iso = (time) => new Date(time).toISOString()
const routeGeometry = { type: 'LineString', coordinates: [[126.8, 37.5], [127.3, 37.5]] }
const crossing = { type: 'Polygon', coordinates: [[[127.0, 37.4], [127.1, 37.4], [127.1, 37.6], [127.0, 37.6], [127.0, 37.4]]] }
const nearOnly = { type: 'Polygon', coordinates: [[[127.0, 37.7], [127.1, 37.7], [127.1, 37.8], [127.0, 37.8], [127.0, 37.7]]] }

function setup() {
  const db = createDb(':memory:')
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .run(1, 'routeowner', 'hash', iso(now))
  const saved = { routeGeometry, etd: iso(now + 30 * 60_000), eta: iso(now + 2 * 60 * 60_000), cruiseAltitudeFt: 12000 }
  const routeId = db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(1, '김포 → 원주', JSON.stringify(saved), iso(now), iso(now)).lastInsertRowid
  const snapshot = routeAlertSnapshot({ ...saved, name: '김포 → 원주', payload: JSON.stringify(saved) })
  const watchId = db.prepare('INSERT INTO route_sigmet_watches(user_id,route_id,route_name,route_snapshot,updated_at) VALUES(?,?,?,?,?)')
    .run(1, routeId, '김포 → 원주', JSON.stringify(snapshot), iso(now)).lastInsertRowid
  return { db, watch: db.prepare('SELECT * FROM route_sigmet_watches WHERE id=?').get(watchId) }
}

function sigmet(id, geometry = crossing, altitude = { lower_fl: 0, upper_fl: 300 }, from = iso(now), to = iso(now + 3 * 60 * 60_000)) {
  return { id, geometry, altitude, valid_from: from, valid_to: to,
    phenomenon_code: 'EMBD_TS', phenomenon_label: '뇌우 SIGMET' }
}

test('경로 SIGMET은 실제 교차·비행시간·고도를 확인하고 재평가 시 중복되지 않는다', (t) => {
  const { db, watch } = setup()
  t.after(() => db.close())
  const data = { sigmet: { fetched_at: iso(now), items: [
    sigmet('hit'), sigmet('near', nearOnly), sigmet('high', crossing, { lower_fl: 300, upper_fl: 400 }),
    sigmet('late', crossing, null, iso(now + 4 * 60 * 60_000), iso(now + 5 * 60 * 60_000)),
  ] }, sigmetOverseas: { fetched_at: iso(now), items: [] } }
  assert.equal(evaluateRouteSigmetWatch(db, watch, data, now).length, 1)
  assert.equal(evaluateRouteSigmetWatch(db, watch, data, now + 60_000).length, 0)
  const feed = listNotifications(db, 1)
  const item = feed.notifications.find((event) => event.source === 'route')
  assert.equal(item.payload.sourceId, 'hit')
  assert.equal(item.active, true)
  assert.equal(markNotificationRead(db, 1, item.id, iso(now)), true)
  assert.equal(listNotifications(db, 1).unreadCount, 0)
  // 일부 자료가 누락되면 현상이 끝났다고 기록하지 않는다.
  evaluateRouteSigmetWatch(db, watch, { sigmet: { fetched_at: iso(now + 120_000), items: [] }, sigmetOverseas: null }, now + 120_000)
  assert.equal(db.prepare('SELECT active FROM route_sigmet_events').get().active, 1)
  evaluateRouteSigmetWatch(db, watch, { sigmet: { fetched_at: iso(now + 180_000), items: [] },
    sigmetOverseas: { fetched_at: iso(now - 30 * 60_000), items: [] } }, now + 180_000)
  assert.equal(db.prepare('SELECT active FROM route_sigmet_events').get().active, 1, 'stale source cannot clear active event')
  evaluateRouteSigmetWatch(db, watch, { sigmet: { fetched_at: iso(now + 180_000), items: [] },
    sigmetOverseas: { fetched_at: iso(now + 180_000), items: [] } }, now + 180_000)
  assert.equal(db.prepare('SELECT active FROM route_sigmet_events').get().active, 0)
})

test('운영 모의 SIGMET은 실제 경로 판정기로 생성하고 실황 이력과 상태를 바꾸지 않는다', (t) => {
  const { db, watch } = setup()
  t.after(() => db.close())
  const result = evaluateRouteTest(watch, now)
  assert.equal(result.kind, 'sigmet')
  assert.equal(result.payload.routeId, watch.route_id)
  assert.match(result.payload.phenomenon, /SIGMET/)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_sigmet_events').get().n, 0)
  assert.equal(db.prepare('SELECT last_evaluated_at FROM route_sigmet_watches').get().last_evaluated_at, null)
})

test('SIGMET 유효기간이 비행 전체와 겹쳐도 교차 구간 통과 전에 끝나면 알리지 않는다', (t) => {
  const { db, watch } = setup()
  t.after(() => db.close())
  const early = sigmet('early', crossing, { lower_fl: 0, upper_fl: 300 },
    iso(now), iso(now + 45 * 60_000))
  assert.equal(evaluateRouteSigmetWatch(db, watch,
    { sigmet: { fetched_at: iso(now), items: [early] },
      sigmetOverseas: { fetched_at: iso(now), items: [] } }, now).length, 0)
})

test('SIGMET 자료가 지연돼도 발표된 유효기간이 끝나면 지난 알림으로 옮긴다', (t) => {
  const { db, watch } = setup()
  t.after(() => db.close())
  const to = iso(now + 75 * 60_000)
  const source = { sigmet: { fetched_at: iso(now), items: [sigmet('short', crossing,
    { lower_fl: 0, upper_fl: 300 }, iso(now), to)] },
  sigmetOverseas: { fetched_at: iso(now), items: [] } }
  assert.equal(evaluateRouteSigmetWatch(db, watch, source, now).length, 1)
  evaluateRouteSigmetWatch(db, watch, { sigmet: null, sigmetOverseas: null }, now + 76 * 60_000)
  assert.equal(db.prepare('SELECT active FROM route_sigmet_events').get().active, 0)
})

test('경로 감시 API는 저장 경로 소유자만 등록·조회·중지할 수 있다', async (t) => {
  const { db, watch } = setup()
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createRouteAlertRouter({ db }))
  app.use('/api/me', createRoutesRouter({ db }))
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => { server.close(); db.close() })
  const headers = { 'content-type': 'application/json', connection: 'close' }
  const url = (path) => `http://127.0.0.1:${server.address().port}${path}`
  const signIn = async (username) => {
    await fetch(url('/api/auth/register'), { method: 'POST', headers,
      body: JSON.stringify({ username, password: 'password1' }) })
    db.prepare("UPDATE users SET status='active' WHERE username=?").run(username)
    const response = await fetch(url('/api/auth/login'), { method: 'POST', headers,
      body: JSON.stringify({ username, password: 'password1' }) })
    return response.headers.get('set-cookie').split(';')[0]
  }
  const owner = await signIn('routeapiowner')
  const other = await signIn('routeapiother')
  const routeId = db.prepare('SELECT id FROM routes WHERE id=?').get(watch.route_id).id
  const ownerId = db.prepare("SELECT id FROM users WHERE username='routeapiowner'").get().id
  const future = { routeGeometry, etd: iso(Date.now() + 60 * 60_000),
    eta: iso(Date.now() + 3 * 60 * 60_000), cruiseAltitudeFt: 12000 }
  db.prepare('UPDATE routes SET user_id=?,payload=? WHERE id=?').run(ownerId, JSON.stringify(future), routeId)
  assert.equal((await fetch(url(`/api/me/route-alert-watches/${routeId}`), { method: 'PUT', headers: { ...headers, cookie: other } })).status, 404)
  const saved = await fetch(url(`/api/me/route-alert-watches/${routeId}`), { method: 'PUT', headers: { ...headers, cookie: owner } })
  assert.equal(saved.status, 200)
  const mine = await (await fetch(url('/api/me/route-alert-watches'), { headers: { ...headers, cookie: owner } })).json()
  assert.equal(mine.watches.length, 1)
  assert.equal(mine.routes[0].id, routeId)
  const firstVersion = db.prepare('SELECT updated_at FROM route_sigmet_watches WHERE id=?').get(mine.watches[0].id).updated_at
  const repeated = await (await fetch(url(`/api/me/route-alert-watches/${routeId}`), {
    method: 'PUT', headers: { ...headers, cookie: owner },
  })).json()
  assert.equal(repeated.unchanged, true)
  assert.equal(db.prepare('SELECT updated_at FROM route_sigmet_watches WHERE id=?').get(mine.watches[0].id).updated_at, firstVersion)
  const theirs = await (await fetch(url('/api/me/route-alert-watches'), { headers: { ...headers, cookie: other } })).json()
  assert.equal(theirs.watches.length, 0)
  const stop = await fetch(url(`/api/me/route-alert-watches/${watch.id}`), { method: 'PATCH',
    headers: { ...headers, cookie: owner }, body: JSON.stringify({ enabled: false }) })
  assert.equal(stop.status, 404, 'other account cannot stop an existing owner watch')
  const paused = await fetch(url(`/api/me/route-alert-watches/${mine.watches[0].id}`), { method: 'PATCH',
    headers: { ...headers, cookie: owner }, body: JSON.stringify({ enabled: false }) })
  assert.equal(paused.status, 200)
  assert.equal(db.prepare('SELECT enabled FROM route_sigmet_watches WHERE id=?').get(mine.watches[0].id).enabled, 0)
  const oldWatchId = mine.watches[0].id
  db.prepare(`INSERT INTO route_sigmet_events
    (watch_id,user_id,route_id,source_key,payload,detected_at) VALUES (?,?,?,?,?,?)`)
    .run(oldWatchId, ownerId, routeId, 'previous-sigmet', '{"phenomenon":"뇌우"}', iso(now))
  const deletedWatch = await fetch(url(`/api/me/route-alert-watches/${oldWatchId}`), {
    method: 'DELETE', headers: { ...headers, cookie: owner },
  })
  assert.equal(deletedWatch.status, 200)
  assert.equal((await (await fetch(url('/api/me/route-alert-watches'), {
    headers: { ...headers, cookie: owner },
  })).json()).watches.length, 0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_sigmet_events WHERE watch_id=?').get(oldWatchId).n, 1,
    '감시 삭제 뒤에도 발생 이력은 남는다')
  assert.equal((await fetch(url(`/api/me/route-alert-watches/${routeId}`), {
    method: 'PUT', headers: { ...headers, cookie: owner },
  })).status, 200)
  assert.equal(db.prepare('SELECT deleted_at FROM route_sigmet_watches WHERE id=?').get(oldWatchId).deleted_at, null)
  const removed = await fetch(url(`/api/me/routes/${routeId}`), { method: 'DELETE', headers: { ...headers, cookie: owner } })
  assert.equal(removed.status, 200)
  assert.equal(db.prepare('SELECT route_id FROM route_sigmet_watches WHERE id=?').get(oldWatchId).route_id, -oldWatchId)
  assert.equal(db.prepare('SELECT route_id FROM route_sigmet_events WHERE watch_id=?').get(oldWatchId).route_id, -oldWatchId)
  const replacement = db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(ownerId, '새 경로', JSON.stringify(future), iso(now), iso(now)).lastInsertRowid
  assert.equal(replacement, routeId, 'SQLite may reuse a deleted route ID')
  const rearmed = await fetch(url(`/api/me/route-alert-watches/${replacement}`), { method: 'PUT',
    headers: { ...headers, cookie: owner } })
  assert.equal(rearmed.status, 200)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_sigmet_watches WHERE user_id=?').get(ownerId).n, 2)
})
