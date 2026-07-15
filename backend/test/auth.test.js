import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { createUser, listPending, setUserStatus } from '../src/db/users.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'

function makeServer() {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  return { db, app }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}
const at = (server, p) => `http://127.0.0.1:${server.address().port}${p}`
// connection:close — keep-alive 소켓이 남아 node --test 프로세스가 hang되는 것 방지.
const jsonPost = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify(body) })
const getWith = (cookie) => ({ headers: { connection: 'close', ...(cookie ? { cookie } : {}) } })

test('auth flow: register → login → me(cookie) → logout', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    let r = await fetch(at(server, '/api/auth/register'), jsonPost({ username: 'pilotx', password: 'password1' }))
    assert.equal(r.status, 201, 'register pilot 201')

    // 가입=승인대기 → 로그인 전 관리자 승인 필요.
    setUserStatus(db, listPending(db)[0].id, 'active')

    r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'pilotx', password: 'password1' }))
    assert.equal(r.status, 200, 'login 200')
    assert.equal((await r.json()).role, 'pilot')
    const setCookie = r.headers.get('set-cookie')
    assert.ok(setCookie?.includes('amo.sid'), 'session cookie set')
    assert.match(setCookie, /HttpOnly/i, 'HttpOnly')
    assert.match(setCookie, /SameSite=Lax/i, 'SameSite=Lax')
    const cookie = setCookie.split(';')[0]

    r = await fetch(at(server, '/api/auth/me'), getWith(cookie))
    assert.equal(r.status, 200, 'me with cookie 200')
    assert.equal((await r.json()).username, 'pilotx')

    r = await fetch(at(server, '/api/auth/me'), getWith())
    assert.equal(r.status, 401, 'me without cookie 401')

    r = await fetch(at(server, '/api/auth/logout'), { method: 'POST', headers: { cookie, connection: 'close' } })
    assert.equal(r.status, 200, 'logout 200')

    r = await fetch(at(server, '/api/auth/me'), getWith(cookie))
    assert.equal(r.status, 401, 'me after logout 401')
  } finally {
    server.close(); db.close()
  }
})

test('register creates pending user and login is blocked until approved', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    await fetch(at(server, '/api/auth/register'), jsonPost({ username: 'newpilot', password: 'password1' }))
    let r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'newpilot', password: 'password1' }))
    assert.equal(r.status, 403, 'login blocked while pending')
    assert.equal((await r.json()).error, 'pending_approval')

    setUserStatus(db, listPending(db)[0].id, 'active')
    r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'newpilot', password: 'password1' }))
    assert.equal(r.status, 200, 'login after approval')
  } finally {
    server.close(); db.close()
  }
})

test('login is rate-limited after too many attempts (429)', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    let last = 0
    for (let i = 0; i < 11; i++) {
      const r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'nouser', password: 'whatever1' }))
      last = r.status
    }
    assert.equal(last, 429, '11th attempt blocked by rate limiter')
  } finally {
    server.close(); db.close()
  }
})

test('login wrong password → 401 (no enumeration)', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    await fetch(at(server, '/api/auth/register'), jsonPost({ username: 'userA', password: 'password1' }))
    const bad = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'userA', password: 'wrongpass1' }))
    const missing = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'nouser', password: 'whatever1' }))
    assert.equal(bad.status, 401)
    assert.equal(missing.status, 401)
    assert.deepEqual(await bad.json(), await missing.json(), 'identical error → no user enumeration')
  } finally {
    server.close(); db.close()
  }
})

test('register forecaster role → forecaster_approval_required (관리자 생성만)', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    const r = await fetch(at(server, '/api/auth/register'), jsonPost({ username: 'wxman', password: 'password1', role: 'forecaster' }))
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'forecaster_approval_required')
  } finally {
    server.close(); db.close()
  }
})

test('forecaster created via CLI can login and gets forecaster role', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    createUser(db, { username: 'wx1', password: 'password1', role: 'forecaster' }) // = create-user.js
    const r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'wx1', password: 'password1' }))
    assert.equal(r.status, 200)
    assert.equal((await r.json()).role, 'forecaster')
  } finally {
    server.close(); db.close()
  }
})
