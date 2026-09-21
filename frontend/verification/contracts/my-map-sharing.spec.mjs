import path from 'node:path'
import { test, expect } from '../fixtures.mjs'
import { createDb } from '../../../backend/src/db/index.js'
import { createUser } from '../../../backend/src/db/users.js'

test('my-map 기관 공유 실제 서버: 두 세션·불변 버전·원본 독립·권한 재검사', async ({ playwright }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '실제 서버 API 통합은 데스크톱 실행에서 한 번 검증')
  const dataPath = process.env.CONTRACT_DATA_PATH
  if (!dataPath) throw new Error('격리된 계약 DB 경로가 필요합니다.')
  const db = createDb(path.join(dataPath, 'projectamo.db'))
  const suffix = `${Date.now()}_${testInfo.workerIndex}`
  const password = 'map-contract-only-password'
  const context = () => playwright.request.newContext({ baseURL: 'http://127.0.0.1:5173', extraHTTPHeaders: { origin: 'http://127.0.0.1:5173' } })
  const publisher = await context(), recipient = await context(), guest = await context()
  try {
    createUser(db, { username: `map_pub_${suffix}`, password, status: 'active' })
    const reader = createUser(db, { username: `map_read_${suffix}`, password, status: 'active' })
    for (const [client, username] of [[publisher, `map_pub_${suffix}`], [recipient, `map_read_${suffix}`]]) {
      expect((await client.post('/api/auth/login', { data: { username, password } })).status()).toBe(200)
    }
    const organizationResponse = await publisher.post('/api/me/organizations', { data: { name: '지도 공유 계약 기관' } })
    expect(organizationResponse.status()).toBe(201)
    const { organization } = await organizationResponse.json()
    // 멤버십 fixture는 실제 DB에 넣고, 이후 권한 검사는 실제 서버가 매 요청 실행한다.
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO organization_members (organization_id,user_id,role,status,version,created_at,updated_at)
      VALUES (?,?,'member','active',1,?,?)`).run(organization.id, reader.id, now, now)
    const url = `/api/organizations/${organization.id}/maps`
    // 전역 JSON 파서보다 세션·기관 권한 검사가 먼저 실행되어야 한다.
    const malformed = await guest.post(url, { data: '{', headers: { 'content-type': 'application/json' } })
    expect(malformed.status()).toBe(401)
    expect((await publisher.post(url, { data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(400)
    const snapshot = { schemaVersion: 1, id: `shared-personal-${suffix}`, name: '공유 원본', kind: 'personal', revision: 0, ungroupedOrder: 0, groups: [], source: null,
      items: [{ id: 'point', groupId: null, order: 0, kind: 'point', name: '참고 지점', description: '메모', geometry: { type: 'Point', coordinates: [127, 37] }, definition: null,
        style: { color: '#123456', width: 2, opacity: 1, fillColor: '#123456', fillOpacity: 0.1, pointSize: 5, dash: 'solid', icon: 'dot' },
        label: { visible: true, size: 12, always: false }, altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' },
        source: { sourceAssetId: 'asset', itemId: 'original', folderPath: ['원본 폴더'], properties: { zero: 0, enabled: false }, metadataEntries: [{ key: 'same', value: 0 }, { key: 'same', value: false }], descriptionRaw: '원문', descriptionText: '원문', summary: [], warnings: [] },
      }] }
    const savedResponse = await publisher.post('/api/me/maps', { data: { snapshot } })
    expect(savedResponse.status()).toBe(201)
    const saved = (await savedResponse.json()).document
    const shareResponse = await publisher.post(url, { data: { personalMapId: saved.id, expectedPersonalRevision: saved.revision, note: '공유 메모' } })
    expect(shareResponse.status()).toBe(201)
    const shared = (await shareResponse.json()).map
    const first = (await (await recipient.get(`${url}/${shared.id}`)).json()).map
    expect(first.snapshot).toEqual(saved)
    expect((await recipient.get(`/api/me/maps/${saved.id}`)).status()).toBe(404)
    const next = { ...snapshot, name: '변경한 원본' }
    expect((await publisher.put(`/api/me/maps/${saved.id}`, { data: { expectedRevision: 1, snapshot: next } })).status()).toBe(200)
    expect((await (await recipient.get(`${url}/${shared.id}`)).json()).map.snapshot).toEqual(saved)
    const input = { personalMapId: saved.id, expectedPersonalRevision: 2, expectedSharedVersion: 1 }
    expect((await recipient.post(`${url}/${shared.id}/versions`, { data: input })).status()).toBe(403)
    expect((await publisher.post(`${url}/${shared.id}/versions`, { data: input })).status()).toBe(201)
    expect((await publisher.post(`${url}/${shared.id}/versions`, { data: input })).status()).toBe(409)
    expect((await (await recipient.get(`${url}/${shared.id}/versions/1`)).json()).map.snapshot).toEqual(saved)
    expect((await publisher.delete(`/api/me/maps/${saved.id}`)).status()).toBe(200)
    const latest = (await (await recipient.get(`${url}/${shared.id}`)).json()).map
    expect(latest.version).toBe(2)
    expect(latest.snapshot.name).toBe('변경한 원본')
    expect(latest.snapshot.items[0].source).toEqual(saved.items[0].source)
    db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?").run(organization.id, reader.id)
    expect((await recipient.get(`${url}/${shared.id}`)).status()).toBe(403)
    expect((await recipient.get(`${url}/${shared.id}/versions/1`)).status()).toBe(403)
    expect((await publisher.delete(`${url}/${shared.id}`)).status()).toBe(200)
    expect((await publisher.get(`${url}/${shared.id}/versions/1`)).status()).toBe(404)
  } finally {
    await Promise.all([publisher.dispose(), recipient.dispose(), guest.dispose()])
    db.close()
  }
})
