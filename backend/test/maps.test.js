import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'

import { createDb } from '../src/db/index.js'
import { createUser } from '../src/db/users.js'
import { createAuthRouter } from '../src/auth/router.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createMyMapsRouter } from '../src/maps/router.js'
import { circleRing, MAX_ACCOUNT_BYTES } from '../src/maps/schema.js'

const CLOSE = { connection: 'close' }
const trustedOrigin = (req, res, next) => req.get('origin') === 'http://trusted.test'
  ? next() : res.status(403).json({ error: 'untrusted_origin' })

function snapshot(id = 'map-1') {
  return {
    schemaVersion: 1, id, name: '개인 비행 지도', kind: 'personal', revision: 999,
    createdAt: 'client-value', updatedAt: 'client-value', ungroupedOrder: 0,
    groups: [{ id: 'training', name: '훈련', parentId: null, order: 0, sourceVisibility: null }],
    items: [
      { id: 'point', groupId: 'training', order: 0, kind: 'point', name: '지점', description: '', geometry: { type: 'Point', coordinates: [126, 37] }, definition: null,
        style: { color: '#475569', width: 2, opacity: 1, fillColor: '#475569', fillOpacity: 0.1, pointSize: 5, dash: 'solid', icon: 'dot' }, label: { visible: true, size: 12, always: false }, altitude: { floorFt: 0, ceilingFt: 100, datum: 'MSL' }, source: null },
      { id: 'imported', groupId: null, order: 0, kind: 'compound', name: '가져온 공역', description: 'safe', definition: null,
        geometry: { type: 'GeometryCollection', geometries: [
          { type: 'Polygon', coordinates: [[[126, 37], [127, 37], [127, 38], [126, 37]], [[126.2, 37.2], [126.4, 37.2], [126.2, 37.4], [126.2, 37.2]]] },
          { type: 'MultiLineString', coordinates: [[[126, 37], [127, 38]], [[127, 38], [128, 39]]] },
        ] }, style: { color: '#123456', width: 0, opacity: 0, fillColor: '#abcdef', fillOpacity: 0, pointSize: 1, dash: 'dashed', icon: 'dot' }, label: { visible: false, size: 8, always: false }, altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' },
        source: { sourceAssetId: 'asset', itemId: 'raw', folderPath: ['A', 'B'], properties: { visibility: false, zero: 0, enabled: false }, metadataEntries: [{ key: 'same', value: 0 }, { key: 'same', value: false }], descriptionRaw: { '@type': 'html', value: '<table>raw</table>' }, descriptionText: 'raw', summary: [], warnings: [] } },
    ], source: null, ownerId: 999,
  }
}

function makeServer({ auth = false } = {}) {
  const db = createDb(':memory:')
  const app = express()
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  if (auth) app.use('/api/auth', express.json(), createAuthRouter({ db }))
  app.use((req, _res, next) => {
    const userId = Number(req.get('x-user-id'))
    if (Number.isSafeInteger(userId) && userId > 0) req.session.userId = userId
    next()
  })
  app.use('/api/me/maps', createMyMapsRouter({ db, trustedMutationOrigin: trustedOrigin }))
  return { db, app }
}

const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
const at = (server, path) => `http://127.0.0.1:${server.address().port}/api/me/maps${path}`
const user = (db, username) => createUser(db, { username, password: 'password1' }).id
const headers = (userId, body = false, origin = true) => ({ ...CLOSE, 'x-user-id': String(userId), ...(body ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin: 'http://trusted.test' } : {}) })
const request = (server, path, userId, method = 'GET', body = null, origin = true) => fetch(at(server, path), { method, headers: headers(userId, body != null, origin), ...(body == null ? {} : { body: JSON.stringify(body) }) })

test('개인지도 HTTP 저장·목록·원본 메타데이터 보존', async () => {
  const { db, app } = makeServer(); const owner = user(db, 'maps_owner'); const server = await listen(app)
  try {
    let response = await request(server, '/', owner, 'POST', { snapshot: snapshot() })
    assert.equal(response.status, 201)
    const created = (await response.json()).document
    assert.equal(created.revision, 1)
    assert.notEqual(created.createdAt, 'client-value')
    assert.equal(created.ownerId, undefined)
    assert.deepEqual(created.items[1].source.metadataEntries, [{ key: 'same', value: 0 }, { key: 'same', value: false }])
    assert.deepEqual(created.items[1].geometry.geometries[0].coordinates[1], [[126.2, 37.2], [126.4, 37.2], [126.2, 37.4], [126.2, 37.2]])
    response = await request(server, '/', owner)
    assert.deepEqual((await response.json()).maps.map((map) => ({ id: map.id, itemCount: map.itemCount, groupCount: map.groupCount })), [{ id: 'map-1', itemCount: 2, groupCount: 1 }])
    response = await request(server, '/map-1', owner)
    assert.equal((await response.json()).document.items[1].source.properties.enabled, false)
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})

test('타인 지도는 404이며 revision 충돌은 현재 revision만 준다', async () => {
  const { db, app } = makeServer(); const owner = user(db, 'maps_owner2'); const other = user(db, 'maps_other'); const server = await listen(app)
  try {
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: snapshot('private') })).status, 201)
    assert.equal((await request(server, '/private', other)).status, 404)
    const next = snapshot('private'); next.name = '새 이름'
    let response = await request(server, '/private', owner, 'PUT', { expectedRevision: 1, snapshot: next })
    assert.equal(response.status, 200); assert.equal((await response.json()).document.revision, 2)
    response = await request(server, '/private', owner, 'PUT', { expectedRevision: 1, snapshot: next })
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'revision_conflict', currentRevision: 2 })
    assert.equal((await request(server, '/private', other, 'DELETE')).status, 404)
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})

test('mutation Origin과 로그인 뒤 비활성화된 계정을 다시 검사한다', async () => {
  const { db, app } = makeServer({ auth: true }); const owner = user(db, 'maps_active'); const server = await listen(app)
  try {
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: snapshot('origin') }, false)).status, 403)
    const login = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { method: 'POST', headers: { ...CLOSE, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'maps_active', password: 'password1' }) })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    db.prepare("UPDATE users SET status='rejected' WHERE id=?").run(owner)
    const response = await fetch(at(server, '/'), { headers: { ...CLOSE, cookie } })
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'account_inactive' })
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})

test('구조·고도·원의 정의 불일치를 거부하고 0/null은 보존한다', async () => {
  const { db, app } = makeServer(); const owner = user(db, 'maps_validate'); const server = await listen(app)
  try {
    const equalAltitude = snapshot('equal-altitude'); equalAltitude.items[0].altitude = { floorFt: 0, ceilingFt: 0, datum: 'MSL' }
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: equalAltitude })).status, 400)
    const nested = snapshot('nested'); nested.groups[0].parentId = 'bad'
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: nested })).status, 400)
    const center = [126, 37], radiusNm = 5
    const circle = snapshot('circle'); circle.items = [{ ...circle.items[0], id: 'circle-item', kind: 'circle', geometry: { type: 'Polygon', coordinates: [circleRing(center, radiusNm)] }, definition: { center, radiusNm }, altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' } }]
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: circle })).status, 201)
    const mismatch = snapshot('circle-mismatch'); mismatch.items = [{ ...circle.items[0], id: 'bad-circle', geometry: { type: 'Polygon', coordinates: [circleRing(center, radiusNm)] }, definition: { center, radiusNm: 6 } }]
    assert.equal((await request(server, '/', owner, 'POST', { snapshot: mismatch })).status, 400)
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})

test('인증 뒤 maps 전용 parser는 malformed JSON을 400 invalid_json으로 응답한다', async () => {
  const { db, app } = makeServer(); const owner = user(db, 'maps_json'); const server = await listen(app)
  try {
    const response = await fetch(at(server, '/'), { method: 'POST', headers: headers(owner, true), body: '{"snapshot":' })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'invalid_json' })
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})

test('32MiB 문서와 계정 256MiB/100개 한도를 넘기지 않고 PUT은 기존 크기를 제외한다', async () => {
  const { db, app } = makeServer(); const owner = user(db, 'maps_quota'); const server = await listen(app)
  try {
    const oversized = snapshot('oversized'); oversized.items[0].description = 'x'.repeat(32 * 1024 * 1024)
    let response = await request(server, '/', owner, 'POST', { snapshot: oversized })
    assert.equal(response.status, 413)
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO personal_maps (id, owner_id, name, revision, snapshot, byte_length, item_count, group_count, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run('replace-me', owner, 'old', 1, '{}', MAX_ACCOUNT_BYTES, 0, 0, now, now)
    const replacement = snapshot('replace-me')
    response = await request(server, '/replace-me', owner, 'PUT', { expectedRevision: 1, snapshot: replacement })
    assert.equal(response.status, 200)
    db.prepare(`INSERT INTO personal_maps (id, owner_id, name, revision, snapshot, byte_length, item_count, group_count, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run('account-full', owner, 'old', 1, '{}', MAX_ACCOUNT_BYTES, 0, 0, now, now)
    response = await request(server, '/', owner, 'POST', { snapshot: snapshot('over-account') })
    assert.equal(response.status, 413); assert.equal((await response.json()).error, 'map_limit_exceeded')
    const countOwner = user(db, 'maps_count')
    const insert = db.prepare(`INSERT INTO personal_maps (id, owner_id, name, revision, snapshot, byte_length, item_count, group_count, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
    for (let index = 0; index < 100; index += 1) insert.run(`count-${index}`, countOwner, 'old', 1, '{}', 2, 0, 0, now, now)
    response = await request(server, '/', countOwner, 'POST', { snapshot: snapshot('count-over') })
    assert.equal(response.status, 413); assert.deepEqual(await response.json(), { error: 'map_limit_exceeded', limit: 'documents' })
  } finally { await new Promise((resolve) => server.close(resolve)); db.close() }
})
