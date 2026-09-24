import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db/index.js'
import { createSavedRouteTools } from '../src/ai/saved-route-tools.js'
import { createOwnedRouteReader, routeEntry } from '../src/me/route-reader.js'
import { createLocalRuntime } from '../src/ai/local-runtime.js'
import { buildCommonRouteModel } from '../../shared/route-model.js'
import { createChatRunner } from '../src/ai/chat-runner.js'
import { createConversationStore } from '../src/ai/conversation-store.js'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { createAiRouter } from '../src/ai/router.js'

const now = () => Date.parse('2026-09-23T12:00:00Z')
const snapshot = { version: 3, kind: 'route', base: { routeForm: { departureAirport: 'RKSS', arrivalAirport: 'RKPC', flightRule: 'VFR' } },
  etd: '2026-09-24T00:03:00Z', eta: '2026-09-24T01:30:00Z', cruiseAltitudeFt: 5500,
  routeGeometry: { type: 'LineString', coordinates: [[126.79, 37.55], [126.49, 33.5]] }, routeMarkers: [] }
snapshot.routeModel = buildCommonRouteModel({ routeGeometry: snapshot.routeGeometry })

function setup(t, executor) {
  const db = createDb(':memory:')
  t.after(() => db.close())
  for (const [id, name] of [[1, 'alice'], [2, 'bob']]) db.prepare('INSERT INTO users(id, username, password_hash, created_at) VALUES (?,?,?,?)').run(id, name, 'test-only', new Date(now()).toISOString())
  function insert(user, name, data = snapshot, alert = 0) {
    return Number(db.prepare('INSERT INTO routes(user_id,name,payload,alert_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(user, name, typeof data === 'string' ? data : JSON.stringify(data), alert, new Date(now()).toISOString(), new Date(now()).toISOString()).lastInsertRowid)
  }
  let time = now()
  const tools = createSavedRouteTools({ database: () => db, executor, now: () => time })
  return { db, tools, insert, expire: () => { time += 16 * 60_000 } }
}

test('personal search is owner-only, paginated, keeps duplicate names and excludes scheduled copies', async (t) => {
  const { tools, insert, db } = setup(t)
  const first = insert(1, '동일 경로'), second = insert(1, '동일 경로')
  insert(2, 'private-bob')
  insert(1, 'alert copy', snapshot, 1)
  insert(1, 'disabled alert copy', { ...snapshot, sourceBriefingId: first })
  insert(1, 'org entry', { ...snapshot, scope: 'organization' })
  insert(1, 'broken', '{bad')
  const before = db.prepare('SELECT * FROM routes').all()
  const a = await tools.call('search_my_routes', { query: '김포 제주', limit: 1 }, 'user:1')
  assert.equal(a.status, 'partial')
  assert.equal(a.data.total, 2)
  assert.equal(a.data.corruptCount, 1)
  assert.deepEqual(a.data.routes.map((x) => x.id), [second])
  assert.equal(a.data.nextOffset, 1)
  const b = await tools.call('search_my_routes', { query: '동일', offset: 1, limit: 1 }, 'user:1')
  assert.deepEqual(b.data.routes.map((x) => x.id), [first])
  assert.equal(b.data.nextOffset, null)
  assert.equal(JSON.stringify(a).includes('coordinates'), false)
  assert.equal(JSON.stringify(a).includes('private-bob'), false)
  assert.equal((await tools.call('search_my_routes', { user_id: 2 }, 'user:1')).error.code, 'INVALID_TOOL_INPUT')
  assert.equal((await tools.call('search_my_routes', {}, 'mcp:anonymous')).error.code, 'AUTH_REQUIRED')
  assert.deepEqual(db.prepare('SELECT * FROM routes').all(), before)
})

test('storage identity overrides spoofed snapshot fields; selection detects other owner, change, deletion and expiry', async (t) => {
  const { tools, insert, db, expire } = setup(t)
  const id = insert(1, '실제 이름', { ...snapshot, id: 999, name: '가짜 이름', savedAt: -1 })
  const row = createOwnedRouteReader(() => db).get(1, id)
  assert.equal(routeEntry(row).id, id)
  assert.equal(routeEntry(row).name, '실제 이름')
  const selected = await tools.call('get_my_saved_route', { route_id: id }, 'user:1')
  assert.equal(selected.data.savedRoute.id, id)
  const ref = selected.reference.savedRouteRef
  assert.equal(tools.getForScreen(ref, 'user:1').entry.id, id)
  assert.throws(() => tools.getForScreen(ref, 'user:2'), /REFERENCE_NOT_FOUND/)
  assert.equal((await tools.call('get_my_saved_route', { route_id: id }, 'user:2')).error.code, 'SAVED_ROUTE_NOT_FOUND')
  db.prepare('UPDATE routes SET name=? WHERE id=?').run('수정', id)
  assert.throws(() => tools.getForScreen(ref, 'user:1'), /SAVED_ROUTE_CHANGED/)
  const fresh = await tools.call('get_my_saved_route', { route_id: id }, 'user:1')
  expire()
  assert.throws(() => tools.getForScreen(fresh.reference.savedRouteRef, 'user:1'), /REFERENCE_EXPIRED/)
  const last = await tools.call('get_my_saved_route', { route_id: id }, 'user:1')
  db.prepare('DELETE FROM routes WHERE id=?').run(id)
  assert.throws(() => tools.getForScreen(last.reference.savedRouteRef, 'user:1'), /SAVED_ROUTE_NOT_FOUND/)
})

test('historical result is explicitly unavailable; current briefing preserves stored geometry and separates fresh data', async (t) => {
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-personal-route-test', readSnapshot: () => ({ snapshot: null }), now })
  const calls = []
  const { tools, insert, db, expire } = setup(t, { registerContext(input, owner) {
    calls.push(input); return runtime.registerContext(input, owner)
  }, call: (...args) => runtime.call(...args) })
  const id = insert(1, 'VFR 저장 입력')
  const old = await tools.call('get_my_saved_route', { route_id: id, mode: 'historical_result' }, 'user:1')
  assert.equal(old.status, 'partial')
  assert.equal(old.data.historicalResult.available, false)
  assert.equal(calls.length, 0)
  const current = await tools.call('get_my_saved_route', { route_id: id, mode: 'current_briefing' }, 'user:1')
  assert.equal(current.status, 'partial', JSON.stringify(current))
  assert.ok(current.reference.briefingRef, JSON.stringify(current))
  assert.equal(current.data.mode, 'current_briefing')
  assert.deepEqual(calls[0].request.routeGeometry, snapshot.routeGeometry)
  assert.equal(calls[0].request.etd, snapshot.etd)
  const stored = runtime.getResult(current.reference.briefingRef, 'user:1')
  assert.deepEqual(stored.request.routeGeometry, snapshot.routeGeometry)
  const decorated = tools.attachResultOrigin(stored, current.reference.savedRouteOriginRef, 'user:1')
  assert.equal(decorated.savedRouteOrigin.savedRoute.id, id)
  assert.equal(decorated.savedRouteOrigin.mode, 'current_briefing')
  assert.equal(decorated.resultHash, stored.resultHash)
  assert.throws(() => tools.attachResultOrigin(stored, current.reference.savedRouteOriginRef, 'user:2'), /REFERENCE_NOT_FOUND/)
  assert.throws(() => tools.attachResultOrigin({ ...stored, resultHash: 'another' }, current.reference.savedRouteOriginRef, 'user:1'), /RESULT_IDENTITY_MISMATCH/)
  const changed = await tools.call('get_my_saved_route', { route_id: id, mode: 'current_briefing', etd: '2026-09-25T00:00:00Z' }, 'user:1')
  assert.deepEqual(changed.data.missingFields, ['eta'])
  assert.equal(calls.length, 1)
  const noGeometry = insert(1, 'old input', { ...snapshot, routeGeometry: null })
  assert.equal((await tools.call('get_my_saved_route', { route_id: noGeometry, mode: 'current_briefing' }, 'user:1')).error.code, 'SAVED_GEOMETRY_UNAVAILABLE')
  db.prepare('DELETE FROM routes WHERE id=?').run(id)
  assert.equal(tools.attachResultOrigin(stored, current.reference.savedRouteOriginRef, 'user:1').savedRouteOrigin.savedRoute.name, 'VFR 저장 입력')
  expire()
  assert.throws(() => tools.attachResultOrigin(stored, current.reference.savedRouteOriginRef, 'user:1'), /REFERENCE_EXPIRED/)
})

test('result HTTP endpoint binds frozen saved provenance to the same owner/result and does not silently omit it', async (t) => {
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-saved-origin-test', readSnapshot: () => ({ snapshot: null }), now })
  const { tools, insert } = setup(t, runtime)
  const id = insert(1, 'HTTP 저장 출처')
  const result = await tools.call('get_my_saved_route', { route_id: id, mode: 'current_briefing' }, 'user:1')
  const reference = result.reference
  const app = express()
  app.use((req, _res, next) => { req.session = { userId: Number(req.headers['x-test-user'] ?? 1) }; next() })
  app.use('/api/ai', createAiRouter({ enabled: true, executor: runtime, personalRoutes: tools }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}/api/ai/results/${reference.briefingRef}`
  const ok = await fetch(`${url}?savedOrigin=${reference.savedRouteOriginRef}`)
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).savedRouteOrigin.savedRoute.id, id)
  const other = await fetch(`${url}?savedOrigin=${reference.savedRouteOriginRef}`, { headers: { 'x-test-user': '2' } })
  assert.equal(other.status, 404)
  const wrongKind = await fetch(`${url}?savedOrigin=${reference.savedRouteRef}`)
  assert.equal(wrongKind.status, 404)
  assert.equal((await wrongKind.json()).error, 'REFERENCE_NOT_FOUND')
})

test('runner does not expose private tools unless the authenticated app service is installed', async (t) => {
  const { tools, insert } = setup(t)
  insert(1, '내 경로')
  for (const enabled of [false, true]) {
    const conversations = createConversationStore({ now })
    const created = conversations.create('user:1')
    let count = 0
    const run = createChatRunner({ conversations, now, personalRoutesEnabled: enabled, executor: tools,
      provider: { async complete(input) {
        assert.equal(input.tools.some((tool) => tool.name === 'search_my_routes'), enabled)
        if (++count === 1) return { toolCalls: [{ id: 'search', name: 'search_my_routes', arguments: {} }] }
        const result = JSON.parse(input.messages.at(-1).content)
        assert.equal(enabled ? result.data.routes.length : result.error.code, enabled ? 1 : 'UNKNOWN_TOOL')
        return { text: '조회 결과를 확인하세요.' }
      } } })
    const response = await run({ conversationId: created.conversationId, requestId: randomUUID(), revision: 0, message: '내 저장 경로' }, 'user:1')
    assert.equal(response.status, 'completed')
    assert.equal(response.cards.length, enabled ? 1 : 0)
  }
})

test('authenticated app chat selects an owner-bound entry and screen fetch rechecks deletion and session', async (t) => {
  const { tools, insert, db } = setup(t)
  const id = insert(1, '테스트 입력')
  const app = express()
  app.use((req, _res, next) => { if (req.headers['x-test-user']) req.session = { userId: Number(req.headers['x-test-user']) }; next() })
  let modelCalls = 0
  app.use('/api/ai', createAiRouter({ enabled: true, executor: {}, personalRoutes: tools,
    provider: { async complete() {
      if (++modelCalls === 1) return { toolCalls: [{ id: 'select', name: 'get_my_saved_route', arguments: { route_id: id, mode: 'inputs' } }] }
      return { text: '저장된 입력입니다. 불러오기는 확인이 필요합니다.' }
    } } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = `http://127.0.0.1:${server.address().port}`
  async function request(path, body, user = '1') {
    const res = await fetch(`${origin}/api/ai${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-test-user': user, Origin: origin, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
  }
  const conversation = await request('/conversations', {})
  const response = await request('/chat', { conversationId: conversation.body.conversationId, revision: 0, requestId: randomUUID(), message: `내 저장 경로 ${id} 입력 확인` })
  assert.equal(response.body.status, 'completed')
  assert.equal(response.body.cards[0].result.data.savedRoute.id, id)
  const ref = response.body.cards[0].result.reference.savedRouteRef
  assert.equal((await request(`/saved-routes/${ref}`, undefined, '')).status, 401)
  assert.equal((await request(`/saved-routes/${ref}`, undefined, '2')).status, 404)
  const screen = await request(`/saved-routes/${ref}`)
  assert.equal(screen.status, 200)
  assert.equal(screen.cache, 'no-store')
  assert.equal(screen.body.entry.id, id)
  db.prepare('DELETE FROM routes WHERE id=?').run(id)
  assert.equal((await request(`/saved-routes/${ref}`)).body.error, 'SAVED_ROUTE_NOT_FOUND')
  assert.equal(modelCalls, 2)
})
