import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createAirportWatchesRouter } from '../src/me/airport-watches.js'
import { createPushRouter } from '../src/me/push.js'

const headers = { 'content-type': 'application/json', connection: 'close' }
const url = (server, path) => `http://127.0.0.1:${server.address().port}${path}`

async function login(server, db, username) {
  await fetch(url(server, '/api/auth/register'), { method: 'POST', headers, body: JSON.stringify({ username, password: 'password1' }) })
  db.prepare("UPDATE users SET status='active' WHERE username=?").run(username)
  const response = await fetch(url(server, '/api/auth/login'), { method: 'POST', headers, body: JSON.stringify({ username, password: 'password1' }) })
  return response.headers.get('set-cookie').split(';')[0]
}

test('공항 감시 API는 본인 설정만 허용하고 잘못된 공항·임계값을 거부한다', async (t) => {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createAirportWatchesRouter({ db }))
  app.use('/api/me', createPushRouter({ db }))
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => { server.close(); db.close() })

  assert.equal((await fetch(url(server, '/api/me/airport-watches'), { headers })).status, 401)
  const owner = await login(server, db, 'airportowner')
  const other = await login(server, db, 'airportother')
  const defaultResponse = await fetch(url(server, '/api/me/airport-watches'), { headers: { ...headers, cookie: owner } })
  const { defaults } = await defaultResponse.json()

  const put = (icao, rules = defaults) => fetch(url(server, `/api/me/airport-watches/${icao}`), {
    method: 'PUT', headers: { ...headers, cookie: owner }, body: JSON.stringify({ enabled: true, rules }),
  })
  assert.equal((await put('RKSS')).status, 200)
  assert.equal((await put('XXXX')).status, 400)
  assert.equal((await put('RKSI', { ...defaults, visibility: { enabled: true, threshold: -1 } })).status, 400)
  const none = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, key === 'channels' ? value : { ...value, enabled: false }]))
  assert.equal((await put('RKSI', none)).status, 400)

  const mine = await (await fetch(url(server, '/api/me/airport-watches'), { headers: { ...headers, cookie: owner } })).json()
  const theirs = await (await fetch(url(server, '/api/me/airport-watches'), { headers: { ...headers, cookie: other } })).json()
  assert.deepEqual(mine.watches.map((watch) => watch.icao), ['RKSS'])
  assert.deepEqual(theirs.watches, [])

  db.prepare('UPDATE airport_alert_watches SET state=? WHERE user_id=? AND icao=?').run('{"metar":{"visibility":"active"}}', 1, 'RKSS')
  assert.equal((await put('RKSS')).status, 200)
  assert.equal(db.prepare('SELECT state FROM airport_alert_watches WHERE user_id=1 AND icao=?').get('RKSS').state, '{"metar":{"visibility":"active"}}', 'same settings must not re-arm the alert')

  db.prepare('INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?)')
    .run(1, 'https://example.test/push', 'key', 'auth', new Date().toISOString())
  const retiredPush = await fetch(url(server, '/api/me/airport-watches/RKSS/test-push'), { method: 'POST', headers: { ...headers, cookie: owner } })
  assert.equal(retiredPush.status, 404, 'old all-device test endpoint is retired')

  const endpoint = encodeURIComponent('https://example.test/push')
  const status = (cookie) => fetch(url(server, `/api/me/push/subscribe?endpoint=${endpoint}`), { headers: { ...headers, cookie } })
  assert.equal((await (await status(owner)).json()).registered, true)
  assert.equal((await (await status(other)).json()).registered, false)
  await fetch(url(server, '/api/me/push/subscribe'), { method: 'POST', headers: { ...headers, cookie: other },
    body: JSON.stringify({ endpoint: 'https://example.test/push', keys: { p256dh: 'key2', auth: 'auth2' } }) })
  assert.equal((await (await status(owner)).json()).registered, false, 'previous account must lose this device')
  assert.equal((await (await status(other)).json()).registered, true)
})
