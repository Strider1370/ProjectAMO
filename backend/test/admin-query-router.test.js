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

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('admin read API fixture: endpoint별 last-good·초기 실패·회복 상태를 분리한다', async () => {
  const db = createDb(':memory:')
  let failReads = false
  const adminDb = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') return (...args) => {
        if (failReads) throw new Error('fixture query failure')
        return target.prepare(...args)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/admin', createAdminRouter({ db: adminDb }))
  const server = await listen(app)
  const url = (pathname) => `http://127.0.0.1:${server.address().port}${pathname}`
  try {
    createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
    const login = await fetch(url('/api/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'boss', password: 'password1' }),
    })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const request = (pathname, generation, scope = 'admin-page-1') => fetch(url(pathname), {
      headers: {
        cookie,
        'x-admin-request-generation': String(generation),
        'x-admin-request-generation-scope': scope,
        connection: 'close',
      },
    })

    const normalResponse = await request('/api/admin/metrics?range=24h', 10)
    const normal = await normalResponse.json()
    assert.equal(normalResponse.status, 200)
    assert.equal(normalResponse.headers.get('x-admin-query-state'), 'ready')
    assert.equal(normalResponse.headers.get('x-admin-query-stale'), 'false')
    assert.equal(normalResponse.headers.get('x-admin-query-request-generation'), '10')
    assert.equal(normalResponse.headers.get('x-admin-query-request-key'), 'metrics%3Frange%3D24h')
    assert.equal(normalResponse.headers.get('x-admin-query-request-scope'), 'admin-page-1')

    failReads = true
    const staleResponse = await request('/api/admin/metrics?range=24h', 11)
    const stale = await staleResponse.json()
    assert.equal(staleResponse.status, 503)
    assert.equal(stale.error, 'admin_query_failed')
    assert.equal(stale.query.status, 'stale')
    assert.equal(stale.query.stale, true)
    assert.ok(stale.query.error)
    assert.ok(stale.query.lastSuccessAt)
    assert.deepEqual(stale.query.lastGood, normal)

    const initialFailure = await request('/api/admin/traffic', 1)
    const initial = await initialFailure.json()
    assert.equal(initialFailure.status, 503)
    assert.equal(initial.query.status, 'error')
    assert.equal(initial.query.stale, false)
    assert.equal('lastGood' in initial.query, false)

    failReads = false
    const recoveredResponse = await request('/api/admin/metrics?range=24h', 12)
    assert.equal(recoveredResponse.status, 200)
    assert.equal(recoveredResponse.headers.get('x-admin-query-state'), 'ready')
    assert.equal(recoveredResponse.headers.get('x-admin-query-stale'), 'false')
  } finally {
    server.close()
    db.close()
  }
})
