import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createRoutesRouter } from '../src/me/routes.js'

function makeServer() {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createRoutesRouter({ db }))
  return { db, app }
}
const listen = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
const at = (s, p) => `http://127.0.0.1:${s.address().port}${p}`
const CLOSE = { connection: 'close' }
const JSONH = { 'content-type': 'application/json', ...CLOSE }

async function login(s, db, username) {
  await fetch(at(s, '/api/auth/register'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username, password: 'password1' }) })
  db.prepare("UPDATE users SET status='active' WHERE username=?").run(username) // 가입=대기 → 승인
  const r = await fetch(at(s, '/api/auth/login'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username, password: 'password1' }) })
  return r.headers.get('set-cookie').split(';')[0]
}

const SNAP = {
  version: 3,
  base: {
    id: 'base', kind: 'base', name: '서울-제주',
    routeForm: { departureAirport: 'RKSI', arrivalAirport: 'RKPC', flightRule: 'IFR' },
    procedureIds: { sid: null, star: null, iapKey: null },
    enroute: { terms: [], legIntents: [], userWaypoints: [], nextWaypointNumber: 1 },
    routeString: 'RKSI DCT RKPC',
  },
  alternatives: [], selectedAlternativeId: null,
  cruiseAltitudeFt: 35000, etd: '2026-07-05T09:00:00Z', tasKt: 130,
}

test('routes: POST → GET round-trips snapshot; DELETE removes', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await login(s, db, 'pilotr')
    let r = await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie }, body: JSON.stringify({ name: '서울-제주', snapshot: SNAP }) })
    assert.equal(r.status, 201)
    const created = await r.json()
    assert.equal(created.name, '서울-제주')
    assert.equal(created.cruiseAltitudeFt, 35000)
    assert.deepEqual(created.base.routeForm, SNAP.base.routeForm)

    r = await fetch(at(s, '/api/me/routes'), { headers: { ...CLOSE, cookie } })
    const { routes } = await r.json()
    assert.equal(routes.length, 1)
    assert.equal(routes[0].base.routeString, 'RKSI DCT RKPC')
    assert.equal(routes[0].etd, SNAP.etd)

    r = await fetch(at(s, `/api/me/routes/${created.id}`), { method: 'DELETE', headers: { ...CLOSE, cookie } })
    assert.equal(r.status, 200)
    r = await fetch(at(s, '/api/me/routes'), { headers: { ...CLOSE, cookie } })
    assert.equal((await r.json()).routes.length, 0)
  } finally { s.close(); db.close() }
})

test('routes: unauthenticated → 401', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const r = await fetch(at(s, '/api/me/routes'), { headers: CLOSE })
    assert.equal(r.status, 401)
  } finally { s.close(); db.close() }
})

test('routes: only own (session-scoped, not client id)', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookieA = await login(s, db, 'ownerA')
    await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie: cookieA }, body: JSON.stringify({ name: 'A route', snapshot: SNAP }) })
    const cookieB = await login(s, db, 'ownerB')
    const r = await fetch(at(s, '/api/me/routes'), { headers: { ...CLOSE, cookie: cookieB } })
    assert.deepEqual((await r.json()).routes, [], 'B sees none of A')
  } finally { s.close(); db.close() }
})

test('routes: oversized payload → 400', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await login(s, db, 'pilotbig')
    const huge = { ...SNAP, etaPolicy: 'x'.repeat(21000) }
    const r = await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie }, body: JSON.stringify({ name: 'big', snapshot: huge }) })
    assert.equal(r.status, 400)
  } finally { s.close(); db.close() }
})

test('routes: rejects a legacy or structurally incomplete new snapshot', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await login(s, db, 'pilotinvalid')
    for (const snapshot of [
      { routeForm: { departureAirport: 'RKSI' } },
      { version: 3, base: { routeForm: {}, enroute: {} }, alternatives: [], selectedAlternativeId: null },
      { ...SNAP, etaPolicy: 'fast' },
    ]) {
      const r = await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie }, body: JSON.stringify({ name: 'bad', snapshot }) })
      assert.equal(r.status, 400)
      assert.equal((await r.json()).error, 'invalid_input')
    }
  } finally { s.close(); db.close() }
})

test('routes: legacy JSON stays readable and malformed JSON is marked without hiding other routes', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await login(s, db, 'pilotlegacy')
    const userId = db.prepare('SELECT id FROM users WHERE username=?').get('pilotlegacy').id
    const legacy = JSON.stringify({ routeForm: { departureAirport: 'RKSI', arrivalAirport: 'RKPC', flightRule: 'IFR' }, vfrWaypoints: [] })
    db.prepare("INSERT INTO routes (user_id, name, payload, created_at, updated_at) VALUES (?,?,?,?,?)").run(userId, 'legacy', legacy, 't', 't')
    db.prepare("INSERT INTO routes (user_id, name, payload, created_at, updated_at) VALUES (?,?,?,?,?)").run(userId, 'broken', '{', 't', 't')

    const r = await fetch(at(s, '/api/me/routes'), { headers: { ...CLOSE, cookie } })
    const { routes } = await r.json()
    const legacyRoute = routes.find((route) => route.name === 'legacy')
    const brokenRoute = routes.find((route) => route.name === 'broken')
    assert.deepEqual(legacyRoute.routeForm, { departureAirport: 'RKSI', arrivalAirport: 'RKPC', flightRule: 'IFR' })
    assert.equal(brokenRoute.invalidPayload, true)
    assert.equal(db.prepare('SELECT payload FROM routes WHERE name=?').get('legacy').payload, legacy)
  } finally { s.close(); db.close() }
})
