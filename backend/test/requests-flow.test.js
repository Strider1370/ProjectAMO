import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { createUser } from '../src/db/users.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createRoutesRouter } from '../src/me/routes.js'
import { createMeRequestsRouter } from '../src/me/requests.js'
import { createForecasterRouter } from '../src/forecaster/router.js'

function makeServer() {
  const db = createDb(':memory:')
  const app = express()
  app.use(express.json())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', createAuthRouter({ db }))
  app.use('/api/me', createRoutesRouter({ db }))
  app.use('/api/me', createMeRequestsRouter({ db }))
  app.use('/api/forecaster', createForecasterRouter({ db }))
  return { db, app }
}
const listen = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
const at = (s, p) => `http://127.0.0.1:${s.address().port}${p}`
const CLOSE = { connection: 'close' }
const JSONH = { 'content-type': 'application/json', ...CLOSE }
const login = async (s, u) => (await fetch(at(s, '/api/auth/login'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username: u, password: 'password1' }) })).headers.get('set-cookie').split(';')[0]

test('요청 흐름: 조종사 문의 → RKSI 예보관 큐·claim·상세·close, 타공항 격리, 권한', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    // 계정: 조종사(register), RKSI 예보관, RKSS 예보관(직접 생성)
    await fetch(at(s, '/api/auth/register'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'pilot1', password: 'password1' }) })
    db.prepare("UPDATE users SET status='active' WHERE username='pilot1'").run() // 가입=대기 → 승인
    createUser(db, { username: 'wx_rksi', password: 'password1', role: 'forecaster', airports: ['RKSI'] })
    createUser(db, { username: 'wx_rkss', password: 'password1', role: 'forecaster', airports: ['RKSS'] })

    const pilot = await login(s, 'pilot1')

    // 경로 저장 → 문의 생성(RKSI)
    const route = await (await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie: pilot }, body: JSON.stringify({ name: 'r', snapshot: { routeForm: { dep: 'RKPC' } } }) })).json()
    let r = await fetch(at(s, '/api/me/requests'), { method: 'POST', headers: { ...JSONH, cookie: pilot }, body: JSON.stringify({ route_id: route.id, target_airport: 'RKSI', message: '경로 확인 부탁' }) })
    assert.equal(r.status, 201)
    const reqId = (await r.json()).id

    // 조종사는 예보관 엔드포인트 접근 불가(403)
    r = await fetch(at(s, '/api/forecaster/requests'), { headers: { ...CLOSE, cookie: pilot } })
    assert.equal(r.status, 403, 'pilot → forecaster 403')

    // RKSI 예보관: 큐에서 pending 문의 봄
    const wxRksi = await login(s, 'wx_rksi')
    r = await fetch(at(s, '/api/forecaster/requests?status=pending'), { headers: { ...CLOSE, cookie: wxRksi } })
    let body = await r.json()
    assert.equal(body.requests.length, 1)
    assert.equal(body.requests[0].id, reqId)
    assert.equal(body.requests[0].target_airport, 'RKSI')

    // RKSS 예보관: 격리 — RKSI 문의 안 보임
    const wxRkss = await login(s, 'wx_rkss')
    r = await fetch(at(s, '/api/forecaster/requests'), { headers: { ...CLOSE, cookie: wxRkss } })
    assert.deepEqual((await r.json()).requests, [], 'RKSS 예보관은 RKSI 문의 못 봄')
    // RKSS 예보관이 RKSI 문의 상세 접근 → 404(은폐)
    r = await fetch(at(s, `/api/forecaster/requests/${reqId}`), { headers: { ...CLOSE, cookie: wxRkss } })
    assert.equal(r.status, 404, '남의 공항 문의 상세 → 404')

    // 상세: 경로 payload 포함
    r = await fetch(at(s, `/api/forecaster/requests/${reqId}`), { headers: { ...CLOSE, cookie: wxRksi } })
    body = await r.json()
    assert.equal(body.route.routeForm.dep, 'RKPC', '경로 스냅샷 전달')

    // claim → viewed, close → closed
    r = await fetch(at(s, `/api/forecaster/requests/${reqId}/claim`), { method: 'POST', headers: { ...CLOSE, cookie: wxRksi } })
    assert.equal((await r.json()).status, 'viewed')
    r = await fetch(at(s, `/api/forecaster/requests/${reqId}/close`), { method: 'POST', headers: { ...CLOSE, cookie: wxRksi } })
    assert.equal((await r.json()).status, 'closed')
  } finally { s.close(); db.close() }
})

test('문의 생성: 예보관 없는 공항 → 400, 남의 경로 → 404', async () => {
  const { db, app } = makeServer()
  const s = await listen(app)
  try {
    await fetch(at(s, '/api/auth/register'), { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'pilotA', password: 'password1' }) })
    db.prepare("UPDATE users SET status='active' WHERE username='pilotA'").run() // 가입=대기 → 승인
    const pilot = await login(s, 'pilotA')
    const route = await (await fetch(at(s, '/api/me/routes'), { method: 'POST', headers: { ...JSONH, cookie: pilot }, body: JSON.stringify({ name: 'r', snapshot: {} }) })).json()

    // RKTN은 예보관 공항 아님
    let r = await fetch(at(s, '/api/me/requests'), { method: 'POST', headers: { ...JSONH, cookie: pilot }, body: JSON.stringify({ route_id: route.id, target_airport: 'RKTN' }) })
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'not_forecaster_airport')

    // 존재하지 않는(=남의) 경로 → 404
    r = await fetch(at(s, '/api/me/requests'), { method: 'POST', headers: { ...JSONH, cookie: pilot }, body: JSON.stringify({ route_id: 999999, target_airport: 'RKSI' }) })
    assert.equal(r.status, 404)
  } finally { s.close(); db.close() }
})
