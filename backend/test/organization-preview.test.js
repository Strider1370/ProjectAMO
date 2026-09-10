import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createOrganizationPreviewRouter } from '../src/organizations/preview-router.js'

async function fixture(options = {}) {
  const app = express()
  const router = createOrganizationPreviewRouter(options)
  app.use(express.json()); app.use(cookieParser())
  app.use('/api/lounge-preview', router)
  let loginMiddlewareCalls = 0
  app.use((req, res) => { loginMiddlewareCalls++; res.status(req.session?.userId ? 200 : 401).json({ authenticated: Boolean(req.session?.userId) }) })
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (path, { cookie, method = 'GET', body, headers = {} } = {}) => {
    return fetch(`${base}/api/lounge-preview${path}`, { method, headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  const start = async () => { const r = await call('/session', { method: 'POST' }); assert.equal(r.status, 201); return r.headers.get('set-cookie').split(';')[0] }
  return { call, start, base, loginCalls: () => loginMiddlewareCalls, close: async () => { await new Promise(resolve => server.close(resolve)); router.close() } }
}

test('anonymous previews reuse real CRUD while isolating visitors, versions, saved routes and login sessions', async () => {
  const f = await fixture()
  try {
    const a = await f.start(), b = await f.start()
    assert.notEqual(a, b)
    const data = await (await f.call('/organizations/1/flights', { cookie: a })).json()
    assert.equal(data.flights.length, 3)
    assert.equal(data.flights[0].snapshot.routeGeometry.type, 'LineString')
    assert.ok(data.flights.every(item => !JSON.stringify(item).includes('local_admin')))
    const flight = data.flights[0]
    let response = await f.call(`/organizations/1/flights/${flight.id}`, { cookie: a, method: 'PATCH', body: { expectedVersion: flight.version, name: '체험에서 편집한 비행' } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).flight.version, 2)
    response = await f.call(`/organizations/1/flights/${flight.id}`, { cookie: a, method: 'PATCH', body: { expectedVersion: flight.version, name: '오래된 편집' } })
    assert.equal(response.status, 409)
    response = await f.call(`/organizations/1/flights/${flight.id}`, { cookie: b })
    assert.equal((await response.json()).flight.name, flight.name)
    const routes = (await (await f.call('/saved-routes', { cookie: a })).json()).routes
    assert.equal(routes.length, 3)
    response = await f.call('/organizations/1/flights/share', { cookie: a, method: 'POST', body: { savedRouteId: routes[0].id } })
    assert.equal(response.status, 201)
    assert.equal((await (await f.call('/organizations/1/flights', { cookie: a })).json()).flights.length, 4)
    assert.equal((await (await f.call('/organizations/1/flights', { cookie: b })).json()).flights.length, 3)
    assert.equal(f.loginCalls(), 0)
    response = await fetch(`${f.base}/api/me/organizations`, { headers: { cookie: a } })
    assert.equal(response.status, 401)
    assert.equal(f.loginCalls(), 1)
  } finally { await f.close() }
})

test('preview files require the sandbox cookie; reset removes old versions without affecting another visitor', async () => {
  const f = await fixture()
  try {
    const a = await f.start(), b = await f.start()
    const path = '/organizations/1/materials/1/versions/1/original'
    let response = await f.call(path, { cookie: a, headers: { range: 'bytes=0-7' } })
    assert.equal(response.status, 206)
    assert.ok(Buffer.from(await response.arrayBuffer()).toString().startsWith('%PDF'))
    assert.equal((await f.call(path)).status, 401)
    assert.equal((await f.call(path, { cookie: 'amo.lounge-preview=forged' })).status, 401)
    assert.equal((await f.call('/organizations/2/materials/1/versions/1/original', { cookie: a })).status, 403)
    const headers = (await f.call('/session', { method: 'POST', cookie: a })).headers
    assert.equal(headers.get('set-cookie'), null)
    const before = await (await f.call('/organizations/1', { cookie: a })).json()
    response = await f.call('/organizations/1/settings', { cookie: a, method: 'PATCH', body: { expectedVersion: before.organization.version, name: '바꾼 기관' } })
    assert.equal(response.status, 200)
    response = await f.call('/reset', { cookie: a, method: 'POST' })
    assert.equal(response.status, 201)
    const cookie = response.headers.get('set-cookie')
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api\/lounge-preview/)
    const next = cookie.split(';')[0]
    assert.equal((await f.call('/organizations/1', { cookie: a })).status, 401)
    assert.equal((await (await f.call('/organizations/1', { cookie: next })).json()).organization.name, '기관 라운지 미리보기')
    assert.equal((await f.call(path, { cookie: b })).status, 200)
  } finally { await f.close() }
})

test('preview session creation enforces Origin, expiry and bounded capacity with no private-route fallthrough', async () => {
  let now = Date.now()
  const f = await fixture({ now: () => now, ttlMs: 1000, maxSessions: 1 })
  try {
    assert.equal((await f.call('/session', { method: 'POST', headers: { origin: 'https://foreign.invalid' } })).status, 403)
    const a = await f.start()
    assert.equal((await f.call('/session', { method: 'POST' })).status, 429)
    assert.equal((await f.call('/admin/organizations', { cookie: a })).status, 404)
    assert.equal(f.loginCalls(), 0)
    now += 1001
    assert.equal((await f.call('/organizations/1', { cookie: a })).status, 401)
    const b = await f.start()
    assert.notEqual(a, b)
  } finally { await f.close() }
})

test('preview personal route save and delete stay inside one sandbox', async () => {
  const f = await fixture()
  try {
    const a = await f.start(), b = await f.start()
    const source = (await (await f.call('/saved-routes', { cookie: a })).json()).routes[0]
    const response = await f.call('/saved-routes', { cookie: a, method: 'POST', body: { name: '체험 저장', snapshot: source } })
    assert.equal(response.status, 201)
    // The production route API rejects overlarge snapshots and validates ownership too.
    assert.equal((await (await f.call('/saved-routes', { cookie: a })).json()).routes.length, 4)
    assert.equal((await (await f.call('/saved-routes', { cookie: b })).json()).routes.length, 3)
    assert.equal((await f.call(`/saved-routes/${source.id}`, { cookie: a, method: 'DELETE' })).status, 200)
    assert.equal((await (await f.call('/saved-routes', { cookie: b })).json()).routes.length, 3)
    assert.equal(f.loginCalls(), 0)
  } finally { await f.close() }
})

test('disconnect during asynchronous briefing cannot reset its database before work settles', async () => {
  let start, finish
  const started = new Promise(resolve => { start = resolve })
  const pending = new Promise(resolve => { finish = resolve })
  const f = await fixture({ briefingDependencies: { terrainSampler: {}, readWeatherSnapshot: async () => { start(); await pending; throw new Error('test snapshot interrupted') } } })
  try {
    const cookie = await f.start()
    const controller = new AbortController()
    const request = fetch(`${f.base}/api/lounge-preview/organizations/1/flights/1/weather-briefing`, {
      method: 'POST', signal: controller.signal, headers: { origin: f.base, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ flightVersion: 1 }),
    }).catch(error => error)
    await Promise.race([started, request.then(async (response) => { throw new Error(`Briefing ended early: ${response.status} ${await response.text()}`) })])
    controller.abort(); await request
    const response = await f.call('/reset', { cookie, method: 'POST' })
    assert.equal(response.status, 409)
    finish()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal((await f.call('/reset', { cookie, method: 'POST' })).status, 201)
  } finally { finish(); await f.close() }
})

test('chunked uploads cannot bypass the preview byte budget', async () => {
  const { request } = await import('node:http')
  const f = await fixture()
  try {
    const cookie = await f.start()
    const status = await new Promise((resolve, reject) => {
      const req = request(`${f.base}/api/lounge-preview/organizations/1/materials`, {
        method: 'POST', headers: { origin: f.base, cookie, 'content-type': 'application/pdf', 'transfer-encoding': 'chunked' },
      }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
      req.on('error', reject); req.write('%PDF-1.4'); req.end()
    })
    assert.equal(status, 411)
  } finally { await f.close() }
})
