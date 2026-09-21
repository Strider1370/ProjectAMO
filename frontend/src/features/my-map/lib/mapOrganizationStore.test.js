import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrganizationMapSession, organizationDocumentId, shareOrganizationMap, MapOrganizationError } from './mapOrganizationStore.js'

const member = { id: 7, name: '비행 기관', role: 'member', status: 'active' }
const row = (version = 1, id = 12) => ({ id, organizationId: 7, version, name: `공유 ${version}`, publisherUserId: 5, sourcePersonalMapId: 'personal', sourcePersonalRevision: version, note: '', itemCount: 1, groupCount: 0, updatedAt: '2026-09-21T00:00:00Z' })
const detail = (version = 1, id = 12) => ({ ...row(version, id), snapshot: { id: 'personal', kind: 'personal', name: `원본 ${version}`, groups: [], items: [{ id: 'a', source: { metadataEntries: [{ key: 'same', value: 0 }, { key: 'same', value: false }] } }], source: { fileName: 'original.kmz' } } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture(overrides = {}) {
  const docs = new Map(), errors = [], removed = [], membershipEvents = []
  const api = { listMemberships: async () => [member], listOrganizationMaps: async () => [row()], getOrganizationMap: async () => detail(), ...overrides }
  const session = createOrganizationMapSession({ api, onInstall: (doc) => docs.set(doc.id, doc), onRemove: (id) => { docs.delete(id); removed.push(id) }, onError: (message) => errors.push(message), onMemberships: (members) => membershipEvents.push(members) })
  return { api, session, docs, errors, removed, membershipEvents, id: organizationDocumentId(7, 12) }
}

test('목록 갱신은 읽던 버전을 유지하고 명시적 적용만 새 스냅샷으로 교체한다', async () => {
  const f = fixture()
  await f.session.refresh()
  assert.equal(f.docs.get(f.id).loaded, false)
  const first = await f.session.load(f.id)
  assert.equal(first.kind, 'organization')
  assert.deepEqual(first.items[0].source, detail().snapshot.items[0].source)
  f.api.listOrganizationMaps = async () => [row(2)]
  const serverDetail = detail(2)
  f.api.getOrganizationMap = async () => serverDetail
  await f.session.refresh()
  assert.equal(f.docs.get(f.id).organization.version, 1)
  assert.equal(f.docs.get(f.id).organization.latestVersion, 2)
  assert.equal(f.docs.get(f.id).name, '공유 1')
  assert.equal((await f.session.load(f.id)).organization.version, 1)
  const applied = await f.session.load(f.id, { applyLatest: true })
  assert.equal(applied.organization.version, 2)
  assert.equal(applied.name, '공유 2')
  applied.items[0].source.metadataEntries[0].value = 99
  assert.equal(serverDetail.snapshot.items[0].source.metadataEntries[0].value, 0)
  f.session.dispose()
})

test('탈퇴·공유 중단을 갱신하면 자료를 제거하고 늦은 상세 응답으로 복원하지 않는다', async () => {
  for (const revoked of ['membership', 'sharedMap']) {
    const pending = deferred(), f = fixture({ getOrganizationMap: () => pending.promise })
    await f.session.refresh()
    const loading = f.session.load(f.id)
    if (revoked === 'membership') f.api.listMemberships = async () => []
    else f.api.listOrganizationMaps = async () => []
    await f.session.refresh()
    pending.resolve(detail())
    assert.equal(await loading, null)
    assert.equal(f.docs.has(f.id), false)
    assert.deepEqual(f.removed, [f.id])
    f.session.dispose()
  }
})

test('계정 세션을 폐기하면 늦은 목록과 상세 응답이 새 계정에 설치되지 않는다', async () => {
  const memberships = deferred(), f = fixture({ listMemberships: () => memberships.promise })
  const refresh = f.session.refresh()
  f.session.dispose(); memberships.resolve([member]); await refresh
  assert.equal(f.docs.size, 0)
  assert.equal(f.membershipEvents.length, 0)
  const pending = deferred(), other = fixture({ getOrganizationMap: () => pending.promise })
  await other.session.refresh()
  const loading = other.session.load(other.id)
  other.session.dispose(); pending.resolve(detail())
  assert.equal(await loading, null)
  assert.equal(other.docs.get(other.id).loaded, false)
})

test('통신 실패는 읽던 자료를 유지하지만 권한 거부는 같은 기관 자료를 모두 가린다', async () => {
  const f = fixture({ listOrganizationMaps: async () => [row(), row(1, 13)] })
  await f.session.refresh(); await f.session.load(f.id)
  f.api.listOrganizationMaps = async () => { throw new MapOrganizationError(0, 'network_error') }
  await f.session.refresh()
  assert.equal(f.docs.get(f.id).loaded, true)
  f.api.getOrganizationMap = async () => { throw new MapOrganizationError(403, 'organization_forbidden') }
  await f.session.load(f.id, { applyLatest: true })
  assert.equal(f.docs.size, 0)
  assert.deepEqual(f.membershipEvents.at(-1), [])
  f.session.dispose()
})

test('늦은 목록이 더 최신 상세 버전이나 확인한 공유 중단을 되돌리지 않는다', async () => {
  for (const response of [detail(2), new MapOrganizationError(404, 'not_found')]) {
    const f = fixture(), pending = deferred()
    await f.session.refresh()
    f.api.listOrganizationMaps = () => pending.promise
    const refreshing = f.session.refresh()
    // refresh가 멤버십을 받은 뒤 목록 요청을 시작하게 한다.
    await Promise.resolve(); await Promise.resolve()
    f.api.getOrganizationMap = async () => { if (response instanceof Error) throw response; return response }
    await f.session.load(f.id, { applyLatest: true })
    pending.resolve([row(1)]); await refreshing
    if (response instanceof Error) assert.equal(f.docs.has(f.id), false)
    else assert.equal(f.docs.get(f.id).organization.latestVersion, 2)
    f.session.dispose()
  }
})

test('공유 요청은 서버 확정 revision과 쿠키를 보내고 충돌 상세를 유지한다', async () => {
  const controller = new AbortController()
  const input = { personalMapId: 'p', expectedPersonalRevision: 3, note: '전달' }
  let called
  await assert.rejects(shareOrganizationMap(7, input, { signal: controller.signal, fetchImpl: async (url, init) => {
    called = { url, init }
    return { ok: false, status: 409, json: async () => ({ error: 'personal_revision_conflict', details: { currentRevision: 4 } }) }
  } }), (error) => error instanceof MapOrganizationError && error.details.currentRevision === 4 && error.code === 'personal_revision_conflict')
  assert.equal(called.url, '/api/organizations/7/maps')
  assert.equal(called.init.credentials, 'include')
  assert.equal(called.init.signal, controller.signal)
  assert.deepEqual(JSON.parse(called.init.body), input)
})
