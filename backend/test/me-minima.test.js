import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createMeRouter } from '../src/me/presets.js'

// #13 개인 단일 미니마(users 컬럼) 왕복. 공항별 미니마는 코드 상수로 이관돼 API 없음(presets 라우트 폐기).
function makeServer() {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createMeRouter({ db }))
  return { db, app }
}
const listen = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
const at = (s, p) => `http://127.0.0.1:${s.address().port}${p}`
const CLOSE = { connection: 'close' }
const JSONH = { 'content-type': 'application/json', ...CLOSE }

async function registerAndLogin(s, db, username) {
  await fetch(at(s, '/api/auth/register'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username, password: 'password1' }) })
  db.prepare("UPDATE users SET status='active' WHERE username=?").run(username) // 가입=대기 → 승인
  const r = await fetch(at(s, '/api/auth/login'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username, password: 'password1' }) })
  return r.headers.get('set-cookie').split(';')[0]
}

test('#13 minima: PUT saves single value, GET returns it', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await registerAndLogin(s, db, 'pilotm')
    let r = await fetch(at(s, '/api/me/minima'), { method: 'PUT', headers: { ...JSONH, cookie }, body: JSON.stringify({ ceilingFt: 1000, visibilityM: 5000 }) })
    assert.equal(r.status, 200)
    r = await fetch(at(s, '/api/me/minima'), { headers: { ...CLOSE, cookie } })
    assert.deepEqual((await r.json()).minima, { ceilingFt: 1000, visibilityM: 5000 })
  } finally { s.close(); db.close() }
})

test('minima: unauthenticated → 401', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const r = await fetch(at(s, '/api/me/minima'), { headers: CLOSE })
    assert.equal(r.status, 401)
  } finally { s.close(); db.close() }
})

test('minima: invalid body → 400', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    const cookie = await registerAndLogin(s, db, 'pilotq')
    const r = await fetch(at(s, '/api/me/minima'), { method: 'PUT', headers: { ...JSONH, cookie }, body: JSON.stringify({ ceilingFt: 99999999 }) })
    assert.equal(r.status, 400)
  } finally { s.close(); db.close() }
})
