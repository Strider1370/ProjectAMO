import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { createLocalRuntime } from '../../../backend/src/ai/local-runtime.js'
import { createDb } from '../../../backend/src/db/index.js'
import { createSavedRouteTools } from '../../../backend/src/ai/saved-route-tools.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

async function setup(page, { legacy = false, alternatives = false, candidates = false, vfr = false, rebrief = false, expiredOrigin = false, manualEta = false, realContext = false } = {}) {
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-copilot-personal-contract',
    ...(realContext ? { navdata: JSON.parse(readFileSync(new URL('../../public/data/navdata/enroute.json', import.meta.url))),
      procedureRoot: fileURLToPath(new URL('../../public/data/navdata/procedures/', import.meta.url)) } : {}),
    planningOptions: { servedNavdataRoot: null }, readSnapshot: () => ({ snapshot: null }) })
  const planned = await runtime.call('plan_route', { departure: '김포', arrival: '제주', flightRule: 'IFR',
    cruiseAltitude: { value: 310, unit: 'FL' }, departureLocal: '2026-09-24T21:03', tasKt: 450 }, 'user:901')
  const briefing = await runtime.call('get_route_briefing', { context_ref: planned.reference.contextRef }, 'user:901')
  const stored = runtime.getResult(briefing.reference.briefingRef, 'user:901')
  expect(stored.status).toBe('ok')
  const { editor } = stored.plan
  const entry = legacy ? { routeForm: editor.routeForm } : {
    version: 3, base: { routeForm: editor.routeForm, procedures: editor.procedures, enroute: editor.enroute, routeString: editor.rawText },
    alternatives: alternatives ? [{ id: 'alt-1', name: '대체 경로', routeForm: editor.routeForm,
      procedures: editor.procedures, enroute: editor.enroute, routeString: editor.rawText }] : [],
    routeGeometry: stored.request.routeGeometry, routeModel: stored.request.routeModel, routeMarkers: stored.request.routeMarkers,
    etd: stored.request.etd, eta: stored.request.eta, cruiseAltitudeFt: 31000, tasKt: 450,
    profileRequest: { procedureContext: stored.request.procedureContext },
  }
  // Deliberately different from the planner's distance/TAS estimate.
  if (manualEta) entry.eta = new Date(Date.parse(entry.etd) + 3600_000).toISOString()
  if (vfr) {
    entry.base = { routeForm: { ...editor.routeForm, flightRule: 'VFR' }, routeString: '' }
    entry.routeGeometry = { type: 'LineString', coordinates: [[126.79, 37.55], [127, 36], [126.6, 35], [126.49, 33.5]] }
    entry.routeModel = null
    entry.routeMarkers = []
    entry.cruiseAltitudeFt = 5500
    entry.tasKt = 120
  }
  const db = createDb(':memory:')
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(901,?,?,?)').run('contract', 'unused', new Date().toISOString())
  const insert = () => Number(db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(901,?,?,?,?)')
    .run('나의 김포 제주', JSON.stringify(entry), new Date().toISOString(), new Date().toISOString()).lastInsertRowid)
  const id = insert()
  if (candidates) insert()
  const tools = createSavedRouteTools({ database: () => db, executor: runtime })
  const result = await tools.call(candidates ? 'search_my_routes' : 'get_my_saved_route', candidates ? {} : { route_id: id, mode: rebrief ? 'current_briefing' : 'inputs' }, 'user:901')
  if (rebrief) expect(result.reference.briefingRef).toBeTruthy()
  const requests = await installRouteBriefingFixtures(page)
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  let reads = 0, writes = 0
  const contexts = [], chats = [], currentBriefings = []
  page.on('request', (request) => {
    if (/\/api\/me\//.test(request.url()) && !['GET', 'HEAD'].includes(request.method())) writes++
  })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'contract', role: 'pilot' } }))
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true, ready: true } }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: 'personal-contract', revision: 0 } }))
  await page.route('**/api/ai/contexts', (route) => {
    contexts.push(route.request().postDataJSON())
    if (realContext) {
      const registered = runtime.registerContext(contexts.at(-1), 'user:901')
      expect(registered.status).toBe('ok')
      return route.fulfill({ status: 201, json: registered })
    }
    return route.fulfill({ status: 201, json: { status: 'ok', contextRef: `personal-context-${contexts.length}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString() } })
  })
  await page.route('**/api/ai/chat', async (route) => {
    const body = route.request().postDataJSON()
    chats.push(body)
    if (realContext && body.context?.contextRef) {
      const current = await runtime.call('get_route_briefing', { context_ref: body.context.contextRef }, 'user:901')
      expect(current.status).toBe('partial')
      currentBriefings.push({ digest: current, bundle: runtime.getResult(current.reference.briefingRef, 'user:901') })
      return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
        text: '사용자가 생성한 현재 경로입니다. 기상자료는 미확인입니다.', cards: [{ tool: 'get_route_briefing', result: current }],
        context: body.context, displayTimezone: body.displayTimezone } })
    }
    return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
      text: '저장 입력을 확인했습니다.', cards: [{ tool: candidates ? 'search_my_routes' : 'get_my_saved_route', result },
        ...(manualEta ? [{ tool: 'get_route_briefing', result: briefing }] : [])],
      context: body.context, displayTimezone: body.displayTimezone } })
  })
  await page.route('**/api/ai/saved-routes/*', (route) => {
    reads++
    try { return route.fulfill({ json: tools.getForScreen(route.request().url().split('/').at(-1), 'user:901') }) }
    catch (error) { return route.fulfill({ status: error.code === 'SAVED_ROUTE_CHANGED' ? 409 : 404, json: { error: { code: error.code } } }) }
  })
  await page.route('**/api/ai/results/*', (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('savedOrigin')).toBe(result.reference.savedRouteOriginRef ?? null)
    if (expiredOrigin) return route.fulfill({ status: 404, json: { error: 'REFERENCE_EXPIRED' } })
    const value = runtime.getResult(url.pathname.split('/').at(-1), 'user:901')
    return route.fulfill({ json: rebrief ? tools.attachResultOrigin(value, url.searchParams.get('savedOrigin'), 'user:901') : value })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
  await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
  await page.getByLabel('기상이에게 질문', { exact: true }).fill('내 저장 경로 확인')
  await page.getByRole('button', { name: '전송', exact: true }).click()
  return { stored, entry, db, id, requests, contexts, chats, currentBriefings, counts: () => ({ reads, writes }) }
}

test.describe('copilot-personal', () => {
  test('manual saved ETA survives opening and closing a different read-only result', async ({ page }, info) => {
    const x = await setup(page, { manualEta: true })
    try {
      expect(x.entry.eta).not.toBe(x.stored.request.eta)
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
      async function askScreen(changed = false) {
        await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
        await page.getByLabel('현재 화면 연결', { exact: true }).check()
        const count = x.chats.length
        await page.getByLabel('기상이에게 질문', { exact: true }).fill('현재 화면의 경로 설명')
        await page.getByRole('button', { name: '전송', exact: true }).click()
        if (changed) await page.getByRole('button', { name: '현재 기준으로 새 대화', exact: true }).click()
        await expect.poll(() => x.chats.length).toBe(count + 1)
        await expect(page.locator('.copilot-message.assistant')).toHaveCount(count + 1)
        const ref = x.chats.at(-1).context.contextRef
        return x.contexts[Number(ref.split('-').at(-1)) - 1].request
      }
      const applied = await askScreen()
      expect(applied.etd).toBe(x.entry.etd)
      expect(applied.eta).toBe(x.entry.eta)
      const facts = page.locator('.copilot-message.assistant').last().locator('.copilot-fact')
      await facts.locator('summary').click()
      await facts.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
      await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toBeVisible()
      const frozen = await askScreen(true)
      expect(frozen.etd).toBe(x.stored.request.etd)
      expect(frozen.eta).toBe(x.stored.request.eta)
      await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
      const mobile = info.project.name === 'mobile'
      if (mobile) await page.getByRole('button', { name: '브리핑', exact: true }).click()
      await page.getByRole('button', { name: mobile ? '이전 단계' : '닫기', exact: true }).last().click()
      await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveCount(0)
      const restored = await askScreen(true)
      expect(restored).toEqual(applied)
      expect(restored.eta).toBe(x.entry.eta)
      expect(x.counts().writes).toBe(0)
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect(x.requests.crossSection.count).toBe(0)
    } finally { x.db.close() }
  })

  test('confirmation and cancel are read-only; import preserves saved geometry without fresh weather or writes', async ({ page }, info) => {
    const x = await setup(page)
    try {
      await expect(page.getByRole('region', { name: '선택한 저장 경로', exact: true })).toContainText('당시의 기상 결과는 보관되어 있지 않습니다')
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toBeVisible()
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toBeFocused()
      await page.screenshot({ path: info.outputPath('copilot-saved-route-confirmation.png') })
      expect(x.counts()).toEqual({ reads: 1, writes: 0 })
      await page.getByRole('button', { name: '불러오기 취소', exact: true }).click()
      await expect(page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true })).toBeFocused()
      expect(x.counts().writes).toBe(0)
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
        ?.find((f) => f.geometry?.type === 'LineString')?.geometry)).toEqual(x.stored.request.routeGeometry)
      expect(x.counts()).toEqual({ reads: 3, writes: 0 })
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect([...x.requests.batch.keys()]).toHaveLength(0)
      expect(x.requests.crossSection.count).toBe(0)
      expect(x.requests.nwpTimeRefresh.count).toBe(0)
      await page.screenshot({ path: info.outputPath('copilot-saved-route-editor.png') })
    } finally { x.db.close() }
  })

  for (const mutation of ['changed', 'deleted']) test(`${mutation} original is rejected after confirmation without changing the editor`, async ({ page }) => {
    const x = await setup(page)
    try {
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toBeVisible()
      if (mutation === 'changed') x.db.prepare('UPDATE routes SET name=? WHERE id=?').run('수정된 이름', x.id)
      else x.db.prepare('DELETE FROM routes WHERE id=?').run(x.id)
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText(mutation === 'changed' ? 'SAVED_ROUTE_CHANGED' : 'SAVED_ROUTE_NOT_FOUND')
      expect(x.counts().writes).toBe(0)
      expect([...x.requests.single.keys()]).toHaveLength(0)
    } finally { x.db.close() }
  })

  test('duplicate candidates require explicit selection and only prefill a question', async ({ page }) => {
    const x = await setup(page, { candidates: true })
    try {
      const region = page.getByRole('region', { name: '내 저장 경로 후보' })
      await expect(region.getByRole('button', { name: /선택 질문 작성/ })).toHaveCount(2)
      await region.getByRole('button', { name: `#${x.id} 선택 질문 작성`, exact: true }).click()
      await expect(page.getByLabel('기상이에게 질문', { exact: true })).toHaveValue(`저장 경로 ID ${x.id}의 저장 입력을 확인해 줘`)
      expect(x.counts()).toEqual({ reads: 0, writes: 0 })
    } finally { x.db.close() }
  })

  test('legacy input restores only an editable draft without invented route or weather', async ({ page }) => {
    const x = await setup(page, { legacy: true })
    try {
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toContainText('입력 초안만 불러오며')
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeDisabled()
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect(x.counts().writes).toBe(0)
    } finally { x.db.close() }
  })

  test('legacy draft continues through explicit user generation, real context registration and exact stored briefing', async ({ page }, info) => {
    const x = await setup(page, { legacy: true, realContext: true })
    try {
      const original = x.db.prepare('SELECT * FROM routes WHERE id=?').get(x.id)
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeDisabled()
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect(x.contexts).toHaveLength(0)
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features?.length ?? 0)).toBe(0)
      await page.getByRole('button', { name: '자동 생성', exact: true }).click()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
      await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
      await page.getByRole('button', { name: '경로비교로', exact: true }).click()
      await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
      const geometry = await page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
        ?.find(feature => feature.geometry?.type === 'LineString')?.geometry)
      expect(geometry?.coordinates.length).toBeGreaterThan(2)
      await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
      await page.getByLabel('현재 화면 연결', { exact: true }).check()
      await page.getByLabel('기상이에게 질문', { exact: true }).fill('방금 생성한 현재 경로로 브리핑해 줘')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      await expect.poll(() => x.currentBriefings.length).toBe(1)
      expect(x.contexts).toHaveLength(1)
      const { digest, bundle } = x.currentBriefings[0]
      expect(bundle.status).toBe('ok')
      expect(bundle.request.routeGeometry).toEqual(geometry)
      expect(bundle.request.departureAirport).toBe('RKSS')
      expect(bundle.request.arrivalAirport).toBe('RKPC')
      expect(Date.parse(bundle.request.eta)).toBeGreaterThan(Date.parse(bundle.request.etd))
      for (const key of ['etd', 'eta']) expect(Date.parse(bundle.request[key])).toBe(Date.parse(x.contexts[0].request[key]))
      expect(bundle.request.plannedCruiseAltitudeFt).toBe(x.contexts[0].request.plannedCruiseAltitudeFt)
      expect(bundle.request.routeMarkers.map(({ id }) => id)).toEqual(x.contexts[0].request.routeMarkers.map(({ id }) => id))
      expect(bundle.issues.some(issue => issue.code === 'DATA_UNAVAILABLE')).toBe(true)
      await page.locator('.copilot-message.assistant').last().locator('.copilot-fact summary').click()
      await page.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
      await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveAttribute('data-result-hash', digest.reference.resultHash)
      expect(x.db.prepare('SELECT * FROM routes WHERE id=?').get(x.id)).toEqual(original)
      expect(x.counts().writes).toBe(0)
      await page.screenshot({ path: info.outputPath('legacy-generated-current-briefing.png') })
    } finally { x.db.close() }
  })

  test('saved alternatives are not dropped during import', async ({ page }) => {
    const x = await setup(page, { alternatives: true })
    try {
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toContainText('경로 2개')
      await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toContainText('현재 항법자료로 복원')
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
      // Import itself never performs the exposure queries used on entry to comparison.
      expect([...x.requests.single.keys()]).toHaveLength(0)
      await page.getByRole('button', { name: '경로비교로', exact: true }).click()
      await expect(page.getByText('대체 경로', { exact: true }).first()).toBeVisible()
      expect(x.counts().writes).toBe(0)
    } finally { x.db.close() }
  })

  test('VFR import retains intermediate geometry without relying on stored marker metadata', async ({ page }) => {
    const x = await setup(page, { vfr: true })
    try {
      await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
      await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
      await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
        ?.find((f) => f.geometry?.type === 'LineString')?.geometry)).toEqual(x.entry.routeGeometry)
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect(x.counts().writes).toBe(0)
    } finally { x.db.close() }
  })

  for (const expiredOrigin of [false, true]) test(`saved result provenance ${expiredOrigin ? 'expiry is explicit' : 'survives source deletion in the full view'}`, async ({ page }) => {
    // A geometry-only VFR template needs no external procedure catalog for context registration.
    const x = await setup(page, { vfr: true, rebrief: true, expiredOrigin })
    try {
      await expect(page.getByRole('region', { name: '선택한 저장 경로', exact: true })).toContainText('현재 수집 자료로 새로 계산한 브리핑')
      x.db.prepare('DELETE FROM routes WHERE id=?').run(x.id)
      await page.locator('.copilot-fact summary').filter({ hasText: '저장 경로 재브리핑' }).click()
      await page.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
      if (expiredOrigin) {
        await expect(page.getByRole('alert')).toContainText('REFERENCE_EXPIRED')
        await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveCount(0)
      } else {
        const notice = page.getByRole('region', { name: '챗봇 보관 결과' })
        await expect(notice).toContainText(`저장 입력 출처: 나의 김포 제주 · #${x.id}`)
        await expect(notice).toContainText('경로를 저장했던 당시의 기상 결과가 아닙니다')
      }
      expect([...x.requests.single.keys()]).toHaveLength(0)
      expect(x.requests.crossSection.count).toBe(0)
      expect(x.counts().writes).toBe(0)
    } finally { x.db.close() }
  })
})
