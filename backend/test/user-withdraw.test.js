import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import SqliteStoreFactory from 'better-sqlite3-session-store'

import { createDb } from '../src/db/index.js'
import { createUser, withdrawUser } from '../src/db/users.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createAdminRouter } from '../src/admin/router.js'

const now = new Date().toISOString()
const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
const at = (server, p) => `http://127.0.0.1:${server.address().port}${p}`
const login = async (server, username) => {
  const r = await fetch(at(server, '/api/auth/login'), { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify({ username, password: 'password1' }) })
  return r.headers.get('set-cookie').split(';')[0]
}

test('admin withdraws a user: personal data, sessions and the account are removed', async () => {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  // 세션을 DB에 두어야 탈퇴가 로그인 상태를 끊는지 확인할 수 있다.
  // 스토어의 만료 정리 타이머는 끌 수 없어(clear:false도 무시됨) 테스트 프로세스를 붙잡는다. 타이머만 뺀다.
  const store = new (class extends SqliteStoreFactory(session) { startInterval() {} })({ client: db })
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/admin', createAdminRouter({ db }))
  const server = await listen(app)
  try {
    const admin = createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
    const user = createUser(db, { username: 'leaver', password: 'password1' })
    db.prepare('INSERT INTO presets (user_id, icao, updated_at) VALUES (?,?,?)').run(user.id, 'RKSI', now)
    db.prepare('INSERT INTO routes (user_id, name, created_at, updated_at) VALUES (?,?,?,?)').run(user.id, 'GMP-CJU', now, now)
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, created_at) VALUES (?,?,?)').run(user.id, 'https://push.example/1', now)
    db.prepare("INSERT INTO airport_alert_watches (user_id, icao, rules, updated_at) VALUES (?,?,?,?)").run(user.id, 'RKSI', '{}', now)
    const userCookie = await login(server, 'leaver')
    const adminCookie = await login(server, 'boss')
    assert.equal((await fetch(at(server, '/api/auth/me'), { headers: { cookie: userCookie } })).status, 200)

    const self = await fetch(at(server, `/api/admin/users/${admin.id}`), { method: 'DELETE', headers: { cookie: adminCookie } })
    assert.equal(self.status, 400)
    const r = await fetch(at(server, `/api/admin/users/${user.id}`), { method: 'DELETE', headers: { cookie: adminCookie } })
    assert.equal(r.status, 200)
    assert.equal((await r.json()).mode, 'deleted')

    assert.equal(db.prepare('SELECT 1 FROM users WHERE id=?').get(user.id), undefined)
    for (const table of ['presets', 'routes', 'push_subscriptions', 'airport_alert_watches']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(user.id).n, 0, table)
    }
    assert.equal((await fetch(at(server, '/api/auth/me'), { headers: { cookie: userCookie } })).status, 401, 'session ended')
    assert.equal((await fetch(at(server, '/api/auth/me'), { headers: { cookie: adminCookie } })).status, 200, 'admin session kept')
  } finally {
    server.closeAllConnections()
    server.close()
    db.close()
  }
})

test('a user who authored organization records is anonymized instead of deleted', () => {
  const db = createDb(':memory:')
  const admin = createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
  const user = createUser(db, { username: 'orgpilot', password: 'password1' })
  db.prepare('INSERT INTO organizations (name, created_by, created_at, updated_at) VALUES (?,?,?,?)').run('항공사', user.id, now, now)
  db.prepare("INSERT INTO airport_alert_watches (user_id, icao, rules, updated_at) VALUES (?,?,?,?)").run(user.id, 'RKSI', '{}', now)

  assert.deepEqual(withdrawUser(db, user.id), { ok: true, mode: 'anonymized' })
  const row = db.prepare('SELECT username, display_name, status, deleted_at FROM users WHERE id=?').get(user.id)
  assert.equal(row.username, `deleted_${user.id}`)
  assert.equal(row.display_name, '탈퇴한 사용자')
  assert.equal(row.status, 'rejected')
  assert.ok(row.deleted_at)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM airport_alert_watches WHERE user_id=?').get(user.id).n, 0)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username='orgpilot'").get().n, 0, 'name is free again')

  assert.deepEqual(withdrawUser(db, admin.id), { ok: false, error: 'cannot_withdraw_admin' })
  assert.deepEqual(withdrawUser(db, user.id), { ok: false, error: 'user_not_found' })
})
