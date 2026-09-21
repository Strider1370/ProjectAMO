import path from 'node:path'
import { test, expect } from '../fixtures.mjs'
import { createDb } from '../../../backend/src/db/index.js'
import { createUser } from '../../../backend/src/db/users.js'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

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

test('my-map 기관 공유 화면: 숨김 포함·저장 대기·새 버전 적용·개인 사본·권한 회수', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '두 실제 계정의 패널 통합')
  test.setTimeout(180000)
  const db = createDb(path.join(process.env.CONTRACT_DATA_PATH, 'projectamo.db'))
  const suffix = `${Date.now()}_${testInfo.workerIndex}`, password = 'map-ui-contract-password'
  const publisherName = `map_p_${suffix}`, recipientName = `map_r_${suffix}`
  createUser(db, { username: publisherName, password, status: 'active' })
  const reader = createUser(db, { username: recipientName, password, status: 'active' })
  const context = () => browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const owner = await context(), receiver = await context()
  const api = (client, url, data, method = 'post') => client.request[method](url, { ...(data === undefined ? {} : { data }), headers: { origin: 'http://127.0.0.1:5173' } })
  const pageErrors = []
  try {
    for (const [client, username] of [[owner, publisherName], [receiver, recipientName]]) {
      expect((await api(client, '/api/auth/login', { username, password })).status()).toBe(200)
      await client.addInitScript((version) => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    }
    const orgResponse = await api(owner, '/api/me/organizations', { name: 'UI 공유 기관' })
    const org = (await orgResponse.json()).organization
    const now = new Date().toISOString()
    db.prepare("INSERT INTO organization_members (organization_id,user_id,role,status,version,created_at,updated_at) VALUES (?,?,'member','active',1,?,?)").run(org.id, reader.id, now, now)
    const page = await owner.newPage(), received = await receiver.newPage()
    for (const p of [page, received]) p.on('pageerror', (error) => pageErrors.push(error.message))
    const enter = async (p) => {
      await p.goto('/', { waitUntil: 'domcontentloaded' })
      await p.getByRole('button', { name: '내 지도', exact: true }).click()
      await expect(p.locator('.my-map-panel')).toBeVisible()
    }
    await enter(page)
    await page.getByRole('button', { name: '새 지도', exact: true }).click()
    await page.getByRole('textbox', { name: '지도 이름', exact: true }).fill('UI 개인 원본')
    await page.getByRole('button', { name: '만들기', exact: true }).click()
    await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
    await page.getByRole('button', { name: '점', exact: true }).click()
    await page.locator('.mapboxgl-canvas').click({ position: { x: 780, y: 320 } })
    await expect(page.getByRole('region', { name: '항목 속성 수정', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '편집 마침', exact: true }).click()
    await page.getByRole('button', { name: '전체 숨기기', exact: true }).click()
    await page.getByRole('button', { name: '기관에 공유', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('숨긴 항목 1개 포함')
    await dialog.getByRole('textbox', { name: '지도 이름', exact: true }).fill('UI 기관 지도')
    await dialog.getByRole('textbox', { name: '전달 메모', exact: true }).fill('함께 확인할 참고점')
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('share-dialog.png') })
    await dialog.getByRole('button', { name: '이 버전 공유', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.my-map-notice')).toContainText('1판을 기관에 공유')
    await enter(received)
    await received.locator('.my-map-document-open').filter({ hasText: 'UI 기관 지도' }).click()
    await expect(received.locator('.my-map-sharing')).toContainText('UI 공유 기관 · 1판')
    await expect(received.getByRole('button', { name: '추가하기', exact: true })).toHaveCount(0)
    const names = (p) => p.evaluate(() => (window.__map?.getSource('my-map-src')?.serialize().data.features ?? []).filter((feature) => feature.properties.__file.startsWith('organization:')).map((feature) => feature.properties.name))
    await expect.poll(() => names(received)).toEqual(['지점 1'])
    // PUT을 실제로 지연시켜 공유가 저장 확정 전에 POST되지 않음을 검증한다.
    let releaseSave, waitingSave = false, versionPosts = 0, failSave = true
    const saveGate = new Promise((resolve) => { releaseSave = resolve })
    await page.route('**/api/me/maps/**', async (route) => {
      if (route.request().method() === 'PUT') {
        if (failSave) { failSave = false; await route.fulfill({ status: 500, json: { error: 'test_save_failure' } }); return }
        waitingSave = true; await saveGate
      }
      await route.continue()
    })
    page.on('request', (request) => { if (request.method() === 'POST' && /\/maps\/\d+\/versions$/.test(new URL(request.url()).pathname)) versionPosts += 1 })
    await page.getByRole('button', { name: '추가하기', exact: true }).click()
    await page.locator('.my-map-editor-item-name').filter({ hasText: '지점 1' }).click()
    await page.getByRole('region', { name: '항목 속성 수정' }).getByRole('textbox', { name: '이름', exact: true }).fill('수정 지점')
    await page.getByRole('button', { name: '편집 마침', exact: true }).click()
    await page.getByRole('button', { name: '기관에 공유', exact: true }).click()
    await dialog.getByRole('combobox', { name: '공유 방식', exact: true }).selectOption({ label: 'UI 기관 지도 · 1판 업데이트' })
    await dialog.getByRole('textbox', { name: '지도 이름', exact: true }).fill('UI 기관 지도')
    await dialog.getByRole('button', { name: '이 버전 공유', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('지도 저장 요청을 처리하지 못했습니다')
    expect(versionPosts).toBe(0)
    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    await page.getByRole('region', { name: '지도 저장 상태' }).getByRole('button', { name: '다시 시도', exact: true }).click()
    await page.getByRole('button', { name: '기관에 공유', exact: true }).click()
    await dialog.getByRole('combobox', { name: '공유 방식', exact: true }).selectOption({ label: 'UI 기관 지도 · 1판 업데이트' })
    await dialog.getByRole('textbox', { name: '지도 이름', exact: true }).fill('UI 기관 지도')
    await dialog.getByRole('button', { name: '이 버전 공유', exact: true }).click()
    await expect.poll(() => waitingSave).toBe(true)
    await expect(dialog.getByRole('button', { name: '저장 확인·공유 중…', exact: true })).toBeDisabled()
    expect(versionPosts).toBe(0)
    releaseSave()
    await expect(dialog).toHaveCount(0)
    await received.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(received.locator('.my-map-sharing-update')).toContainText('2판')
    expect(await names(received)).toEqual(['지점 1'])
    await received.locator('.my-map-sharing-update').getByRole('button', { name: '적용', exact: true }).click()
    await expect.poll(() => names(received)).toEqual(['수정 지점'])
    await received.screenshot({ animations: 'disabled', path: testInfo.outputPath('shared-version-applied.png') })
    await received.locator('.my-map-sharing-actions').getByRole('button', { name: '내 지도로 복사', exact: true }).click()
    await expect(received.getByRole('region', { name: '내 지도 편집', exact: true })).toBeVisible()
    await received.getByRole('button', { name: '편집 마침', exact: true }).click()
    await expect(received.getByRole('region', { name: '지도 저장 상태' })).toContainText('계정에 저장됨')
    const personal = (await (await receiver.request.get('/api/me/maps')).json()).maps
    expect(personal).toHaveLength(1)
    const copy = (await (await receiver.request.get(`/api/me/maps/${personal[0].id}`)).json()).document
    expect(copy.items[0].name).toBe('수정 지점')
    expect(copy.kind).toBe('personal')
    const orgMaps = (await (await owner.request.get(`/api/organizations/${org.id}/maps`)).json()).maps
    const shared = (await (await owner.request.get(`/api/organizations/${org.id}/maps/${orgMaps[0].id}`)).json()).map
    expect(copy.id).not.toBe(shared.snapshot.id)
    expect(copy.items[0].id).not.toBe(shared.snapshot.items[0].id)
    // 공유본 삭제와 권한 회수는 개인 사본에 영향을 주지 않는다.
    await received.getByRole('button', { name: '목록', exact: true }).click()
    await received.locator('.my-map-document-open').filter({ hasText: /^UI 기관 지도기관 지도/ }).click()
    db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?").run(org.id, reader.id)
    await received.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => names(received)).toEqual([])
    await expect(received.getByTestId('my-map-files')).toContainText('UI 기관 지도 사본')
    expect((await receiver.request.get(`/api/me/maps/${copy.id}`)).status()).toBe(200)
    // 기관 스냅샷을 계정 복구 저장소에 영속 보관하지 않는다.
    const recoveredKinds = await received.evaluate(async () => {
      const db = await new Promise((resolve) => { const req = indexedDB.open('projectamo-my-map-account-v1'); req.onsuccess = () => resolve(req.result) })
      const records = await new Promise((resolve) => { const req = db.transaction('completed').objectStore('completed').getAll(); req.onsuccess = () => resolve(req.result) })
      db.close(); return records.map((row) => row.document.kind)
    })
    expect(recoveredKinds).not.toContain('organization')
    await page.getByRole('button', { name: '목록', exact: true }).click()
    await page.locator('.my-map-library-section').filter({ has: page.locator('.my-map-section-heading', { hasText: '기관 지도' }) }).locator('.my-map-document-open').click()
    await page.getByRole('button', { name: '공유 중단', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '공유 중단', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('my-map-files')).toContainText('UI 개인 원본')
    expect((await owner.request.get(`/api/organizations/${org.id}/maps/${shared.id}`)).status()).toBe(404)
    expect((await receiver.request.get(`/api/me/maps/${copy.id}`)).status()).toBe(200)
    expect(pageErrors).toEqual([])
  } finally { await Promise.all([owner.close(), receiver.close()]); db.close() }
})
