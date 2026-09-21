import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createDb } from '../src/db/index.js'
import { createOrganization, putMember } from '../src/organizations/repository.js'
import { createOrganizationMapsRouter } from '../src/maps/organization-router.js'
import { createMyMapsRouter } from '../src/maps/router.js'
import { MAX_ORGANIZATION_VERSION_BYTES } from '../src/maps/organization-repository.js'

function snapshot(id = 'personal') {
  return {
    schemaVersion: 1, id, name: '공역 참고 지도', kind: 'personal', revision: 0, ungroupedOrder: 0,
    groups: [], items: [{ id: 'p', groupId: null, order: 0, kind: 'point', name: '관측점', description: '참고 메모',
      geometry: { type: 'Point', coordinates: [127, 37, 0] }, definition: null,
      style: { color: '#123456', width: 2, opacity: 0, fillColor: '#123456', fillOpacity: 0.2, pointSize: 5, dash: 'solid', icon: 'dot' },
      label: { visible: false, size: 12, always: false }, altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' },
      source: { sourceAssetId: 'asset', itemId: 'raw', folderPath: ['원본'], properties: { visibility: false, zero: 0 },
        metadataEntries: [{ key: 'same', value: 0 }, { key: 'same', value: false }],
        descriptionRaw: { '@type': 'html', value: '<p>원문</p>' }, descriptionText: '원문', summary: [], warnings: [] },
    }], source: null,
  }
}

async function fixture(t) {
  const db = createDb(':memory:')
  const addUser = (name) => Number(db.prepare('INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)').run(name, 'x', new Date().toISOString()).lastInsertRowid)
  const admin = addUser('admin'), publisher = addUser('publisher'), reader = addUser('reader'), outsider = addUser('outsider')
  const org = createOrganization(db, { name: '비행 기관', adminUserId: admin, actorUserId: admin }).id
  const otherOrg = createOrganization(db, { name: '다른 기관', adminUserId: outsider, actorUserId: outsider }).id
  for (const id of [publisher, reader]) putMember(db, org, id, { role: 'member', status: 'active' })
  const app = express()
  app.use((req, _res, next) => { req.session = { userId: Number(req.get('x-user-id')), role: 'pilot' }; next() })
  app.use('/api/me/maps', createMyMapsRouter({ db }))
  app.use('/api/organizations', createOrganizationMapsRouter({ db }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close() })
  const request = async (path, actor = publisher, method = 'GET', body, origin = base) => {
    const response = await fetch(`${base}${path}`, { method,
      headers: { connection: 'close', 'x-user-id': String(actor), ...(origin ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json() }
  }
  const path = `/api/organizations/${org}/maps`
  const save = async (actor = publisher, id = 'personal') => {
    const result = await request('/api/me/maps', actor, 'POST', { snapshot: snapshot(id) })
    assert.equal(result.status, 201, JSON.stringify(result.body))
    return result.body.document
  }
  const publish = async () => {
    await save()
    const result = await request(path, publisher, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 1, note: '첫 배포' })
    assert.equal(result.status, 201, JSON.stringify(result.body))
    return result.body.map
  }
  return { db, admin, publisher, reader, outsider, org, otherOrg, request, path, save, publish }
}

test('기관 지도는 확정 개인 revision의 독립 사본이며 과거 버전과 원본 메타데이터를 보존한다', async (t) => {
  const f = await fixture(t), shared = await f.publish()
  const source = await f.request('/api/me/maps/personal')
  assert.deepEqual(shared.snapshot, source.body.document)
  const next = snapshot(); next.name = '새 이름'; next.items[0].description = '수정'
  assert.equal((await f.request('/api/me/maps/personal', f.publisher, 'PUT', { expectedRevision: 1, snapshot: next })).status, 200)
  assert.deepEqual((await f.request(`${f.path}/${shared.id}`, f.reader)).body.map.snapshot, shared.snapshot)
  const update = await f.request(`${f.path}/${shared.id}/versions`, f.publisher, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 2, expectedSharedVersion: 1 })
  assert.equal(update.status, 201)
  assert.equal(update.body.map.version, 2)
  assert.equal(update.body.map.snapshot.name, '새 이름')
  assert.deepEqual(update.body.map.snapshot.items[0].source, shared.snapshot.items[0].source)
  const old = await f.request(`${f.path}/${shared.id}/versions/1`, f.reader)
  assert.equal(old.status, 200)
  assert.deepEqual(old.body.map.snapshot, shared.snapshot)
  assert.equal((await f.request('/api/me/maps/personal', f.publisher, 'DELETE')).status, 200)
  assert.deepEqual((await f.request(`${f.path}/${shared.id}`, f.reader)).body.map.snapshot, update.body.map.snapshot)
  assert.deepEqual((await f.request(`${f.path}/${shared.id}/versions/1`, f.reader)).body.map.snapshot, shared.snapshot)
  const listed = (await f.request(f.path, f.reader)).body.maps
  assert.equal(listed[0].version, 2)
  assert.equal(listed[0].snapshot, undefined)
})

test('모든 기관 지도 경로는 로그인·조직 일치·현재 멤버십·현재 사용자 상태를 검사한다', async (t) => {
  const f = await fixture(t), shared = await f.publish()
  const paths = [f.path, `${f.path}/${shared.id}`, `${f.path}/${shared.id}/versions/1`]
  for (const path of paths) {
    assert.equal((await f.request(path, 0)).status, 401)
    assert.equal((await f.request(path, f.outsider)).status, 403)
    assert.equal((await f.request(path, f.reader)).status, 200)
  }
  assert.equal((await f.request(`/api/organizations/${f.otherOrg}/maps/${shared.id}`, f.outsider)).status, 404)
  assert.equal((await f.request('/api/organizations/999999/maps', f.reader)).status, 403)
  f.db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?").run(f.org, f.reader)
  for (const path of paths) assert.equal((await f.request(path, f.reader)).status, 403)
  f.db.prepare("UPDATE organization_members SET status='active' WHERE organization_id=? AND user_id=?").run(f.org, f.reader)
  f.db.prepare("UPDATE users SET status='rejected' WHERE id=?").run(f.reader)
  for (const path of paths) assert.equal((await f.request(path, f.reader)).status, 403)
  assert.equal((await f.request(f.path, f.reader, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 1 })).status, 403)
})

test('공유 입력의 타인 원본·위조 snapshot을 신뢰하지 않고 개인 revision 충돌을 거부한다', async (t) => {
  const f = await fixture(t), original = await f.save()
  assert.equal((await f.request(f.path, f.reader, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 1, ownerId: f.publisher })).status, 404)
  const stale = await f.request(f.path, f.publisher, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 2 })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.error, 'personal_revision_conflict')
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM organization_maps').get().n, 0)
  const result = await f.request(f.path, f.publisher, 'POST', { personalMapId: 'personal', expectedPersonalRevision: 1, name: '공유용 이름', organizationId: f.otherOrg, ownerId: f.admin, snapshot: { name: '위조' } })
  assert.equal(result.status, 201)
  assert.equal(result.body.map.organizationId, f.org)
  assert.equal(result.body.map.publisherUserId, f.publisher)
  assert.equal(result.body.map.name, '공유용 이름')
  assert.deepEqual(result.body.map.snapshot, original)
})

test('게시자·관리자만 업데이트/중단하고 관리자도 본인 원본만 사용한다', async (t) => {
  const f = await fixture(t), shared = await f.publish(), url = `${f.path}/${shared.id}`
  const input = { personalMapId: 'personal', expectedPersonalRevision: 1, expectedSharedVersion: 1 }
  assert.equal((await f.request(`${url}/versions`, f.reader, 'POST', input)).status, 403)
  assert.equal((await f.request(url, f.reader, 'DELETE')).status, 403)
  assert.equal((await f.request(`${url}/versions`, f.admin, 'POST', input)).status, 404)
  const adminCopy = await f.save(f.admin, 'admin-copy')
  const result = await f.request(`${url}/versions`, f.admin, 'POST', { ...input, personalMapId: adminCopy.id })
  assert.equal(result.status, 201)
  assert.deepEqual(result.body.map.snapshot, adminCopy)
  assert.equal(result.body.map.publisherUserId, f.publisher)
  assert.equal((await f.request(url, f.admin, 'DELETE')).status, 200)
  assert.equal((await f.request(url, f.reader)).status, 404)
  assert.equal((await f.request(`${url}/versions/1`, f.reader)).status, 404)
  assert.deepEqual((await f.request(f.path, f.reader)).body.maps, [])
  assert.equal((await f.request('/api/me/maps/personal')).status, 200)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM organization_map_versions WHERE map_id=?').get(shared.id).n, 2)
})

test('같은 공유 버전의 동시 업데이트는 하나만 성공하고 불변 버전이 중복 생성되지 않는다', async (t) => {
  const f = await fixture(t), shared = await f.publish(), url = `${f.path}/${shared.id}/versions`
  const input = { personalMapId: 'personal', expectedPersonalRevision: 1, expectedSharedVersion: 1 }
  const results = await Promise.all([f.request(url, f.publisher, 'POST', input), f.request(url, f.publisher, 'POST', input)])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  assert.equal(results.find((r) => r.status === 409).body.details.currentVersion, 2)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM organization_map_versions WHERE map_id=?').get(shared.id).n, 2)
  const badSource = await f.request(url, f.publisher, 'POST', { ...input, expectedSharedVersion: 2, expectedPersonalRevision: 99 })
  assert.equal(badSource.status, 409)
  assert.equal(f.db.prepare('SELECT current_version FROM organization_maps WHERE id=?').get(shared.id).current_version, 2)
})

test('공유 중단한 불변 버전도 기관 용량에 포함하며 실패 시 부분 기록을 남기지 않는다', async (t) => {
  const f = await fixture(t), shared = await f.publish()
  assert.throws(() => f.db.prepare("UPDATE organization_map_versions SET note='변조' WHERE map_id=?").run(shared.id), /immutable_organization_map_version/)
  // 용량 경계 fixture만 SQL로 추가한다. 실제 256MiB 문자열을 할당할 필요는 없다.
  const firstBytes = f.db.prepare('SELECT byte_length FROM organization_map_versions WHERE map_id=?').get(shared.id).byte_length
  f.db.prepare(`INSERT INTO organization_map_versions
    (map_id,version,source_personal_map_id,source_personal_revision,name,note,snapshot,byte_length,item_count,group_count,created_by,created_at)
    SELECT map_id,2,source_personal_map_id,source_personal_revision,name,note,snapshot,?,item_count,group_count,created_by,created_at
    FROM organization_map_versions WHERE map_id=? AND version=1`).run(MAX_ORGANIZATION_VERSION_BYTES - firstBytes, shared.id)
  f.db.prepare('UPDATE organization_maps SET current_version=2 WHERE id=?').run(shared.id)
  const input = { personalMapId: 'personal', expectedPersonalRevision: 1, expectedSharedVersion: 2 }
  assert.equal((await f.request(`${f.path}/${shared.id}/versions`, f.publisher, 'POST', input)).status, 413)
  assert.equal(f.db.prepare('SELECT current_version FROM organization_maps WHERE id=?').get(shared.id).current_version, 2)
  assert.equal((await f.request(`${f.path}/${shared.id}`, f.publisher, 'DELETE')).status, 200)
  const result = await f.request(f.path, f.publisher, 'POST', input)
  assert.equal(result.status, 413)
  assert.equal(result.body.error, 'organization_map_limit_exceeded')
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM organization_maps').get().n, 1)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM organization_map_versions').get().n, 2)
})

test('기관 지도 mutation은 Origin·본문 크기·JSON·버전 입력을 검증한다', async (t) => {
  const f = await fixture(t), shared = await f.publish()
  assert.equal((await f.request(f.path, f.publisher, 'POST', {}, null)).status, 403)
  assert.equal((await f.request(`${f.path}/${shared.id}`, f.publisher, 'DELETE', undefined, 'https://other.test')).status, 403)
  assert.deepEqual(await f.request(f.path, f.publisher, 'POST', '{'), { status: 400, body: { error: 'invalid_json' } })
  assert.equal((await f.request(f.path, f.publisher, 'POST', { note: 'x'.repeat(1024 * 1024) })).status, 413)
  assert.equal((await f.request(f.path, 0, 'POST', '{')).status, 401)
  assert.equal((await f.request(f.path, f.outsider, 'POST', '{')).status, 403)
  for (const version of ['0', '-1', '1.5', 'abc', '9007199254740992']) assert.equal((await f.request(`${f.path}/${shared.id}/versions/${version}`)).status, 400)
  assert.equal((await f.request(`${f.path}/${shared.id}/versions/99`)).status, 404)
  assert.equal((await f.request(f.path, f.publisher, 'POST', { personalMapId: 'personal', expectedPersonalRevision: '1' })).status, 400)
})
