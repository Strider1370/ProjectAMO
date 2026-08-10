import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { createUser } from '../src/db/users.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createAdminRouter } from '../src/admin/router.js'

function makeServer() {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/admin', createAdminRouter({ db }))
  return { db, app }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}
const at = (server, p) => `http://127.0.0.1:${server.address().port}${p}`
const jsonPost = (body, cookie) => ({ method: 'POST', headers: { 'content-type': 'application/json', connection: 'close', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
const postWith = (cookie) => ({ method: 'POST', headers: { connection: 'close', cookie } })
const getWith = (cookie) => ({ headers: { connection: 'close', ...(cookie ? { cookie } : {}) } })

test('admin endpoints require admin and return data', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
    createUser(db, { username: 'pilot1', password: 'password1', status: 'pending' })

    // 비로그인 → 401
    assert.equal((await fetch(at(server, '/api/admin/users'), getWith())).status, 401)

    let r = await fetch(at(server, '/api/auth/login'), jsonPost({ username: 'boss', password: 'password1' }))
    assert.equal(r.status, 200)
    const cookie = r.headers.get('set-cookie').split(';')[0]

    const pending = await (await fetch(at(server, '/api/admin/pending'), getWith(cookie))).json()
    assert.equal(pending.length, 1)
    assert.equal((await fetch(at(server, '/api/admin/users'), getWith(cookie))).status, 200)
    assert.equal((await fetch(at(server, '/api/admin/metrics?range=24h'), getWith(cookie))).status, 200)
    assert.equal((await fetch(at(server, '/api/admin/traffic'), getWith(cookie))).status, 200)
    const apiHubUsage = await (await fetch(at(server, '/api/admin/api-hub-usage'), getWith(cookie))).json()
    assert.equal(apiHubUsage.keys.length, 3)
    assert.ok(apiHubUsage.keys.every((key) => Array.isArray(key.endpoints)))
    assert.ok(apiHubUsage.keys.every((key) => !('credential' in key) && !('url' in key)))
    assert.ok(apiHubUsage.keys.every((key) => key.endpoints.every((endpoint) => Object.keys(endpoint).every((field) => ['label', 'bytes', 'requests', 'successes', 'failures', 'lastCalledAt'].includes(field)))))

    const health = await (await fetch(at(server, '/api/admin/data-health'), getWith(cookie))).json()
    assert.ok(Array.isArray(health.rows) && health.rows.length > 0)
    assert.ok(health.rows.every((r) => 'key' in r && 'label' in r && 'status' in r))
    assert.equal(health.counts.total, health.rows.length)
    assert.ok(Array.isArray(health.groups.source) && health.groups.source.length > 0)
    assert.ok(Array.isArray(health.groups.character) && health.groups.character.length > 0)

    const serverHealth = await (await fetch(at(server, '/api/admin/server-health'), getWith(cookie))).json()
    assert.ok(serverHealth.process.uptimeSec >= 0)
    assert.ok(Array.isArray(serverHealth.disk))
    assert.ok(Array.isArray(serverHealth.recentErrors))

    const trends = await (await fetch(at(server, '/api/admin/trends?granularity=week'), getWith(cookie))).json()
    assert.equal(trends.granularity, 'week')
    assert.ok(Array.isArray(trends.visits) && Array.isArray(trends.newVisitors) && Array.isArray(trends.signups))

    assert.equal((await fetch(at(server, `/api/admin/users/${pending[0].id}/approve`), postWith(cookie))).status, 200)

    // 잘못된 id → 400, 존재하지 않는 id → 404(조용한 200 금지)
    assert.equal((await fetch(at(server, '/api/admin/users/abc/approve'), postWith(cookie))).status, 400)
    assert.equal((await fetch(at(server, '/api/admin/users/99999/reject'), postWith(cookie))).status, 404)

    r = await fetch(at(server, '/api/admin/forecasters'), jsonPost({ username: 'fc1', password: 'password1', displayName: '인천', airports: ['RKSI'] }, cookie))
    assert.equal(r.status, 201)
    assert.equal((await r.json()).role, 'forecaster')

    // 잘못된 타입 airports → 400 invalid_input(내부오류 비노출)
    assert.equal((await fetch(at(server, '/api/admin/forecasters'), jsonPost({ username: 'fc2', password: 'password1', airports: 'RKSI' }, cookie))).status, 400)
  } finally {
    server.close(); db.close()
  }
})
