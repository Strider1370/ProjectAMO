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

const SNAP = { routeForm: { dep: 'RKSI', dest: 'RKPC', flightRule: 'IFR' }, vfrWaypoints: [{ id: 'w1' }], cruiseAltitudeFt: 35000, alternateAirport: 'RKPK', etd: '2026-07-05T09:00:00Z' }

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
    assert.deepEqual(created.routeForm, SNAP.routeForm)

    r = await fetch(at(s, '/api/me/routes'), { headers: { ...CLOSE, cookie } })
    const { routes } = await r.json()
    assert.equal(routes.length, 1)
    assert.equal(routes[0].alternateAirport, 'RKPK')
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
    const huge = { routeForm: {}, blob: 'x'.repeat(21000) }
    const r = await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie }, body: JSON.stringify({ name: 'big', snapshot: huge }) })
    assert.equal(r.status, 400)
  } finally { s.close(); db.close() }
})
