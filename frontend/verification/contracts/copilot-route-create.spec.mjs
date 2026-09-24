import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { createLocalRuntime } from '../../../backend/src/ai/local-runtime.js'
import { createFileRoutePlanningProvider } from '../../../backend/src/briefing/route-planning-provider.js'
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const inputs = { departure: '김포', arrival: '제주', flightRule: 'IFR', cruiseAltitude: { value: 310, unit: 'FL' },
  departureLocal: '2026-09-23T21:03', tasKt: 450 }

async function setup(page, { incomplete = false, mismatch = false, changedAirway = false, runtime: suppliedRuntime } = {}) {
  const runtime = suppliedRuntime ?? createLocalRuntime({ dataRoot: '/nonexistent-copilot-create-contract',
    planningOptions: { servedNavdataRoot: null }, readSnapshot: () => ({ snapshot: null }) })
  const planned = await runtime.call('plan_route', incomplete ? { departure: '김포', arrival: '제주' } : inputs, 'contract-owner')
  let briefing, stored
  if (!incomplete) {
    briefing = await runtime.call('get_route_briefing', { context_ref: planned.reference.contextRef }, 'contract-owner')
    stored = runtime.getResult(briefing.reference.briefingRef, 'contract-owner')
    expect(stored.status).toBe('ok')
    if (mismatch) {
      stored.plan.publicationId = 'other-publication'
      stored.reference.publicationId = 'other-publication'
    }
    if (changedAirway) stored.plan.sourceSegments[0].lowerLimit = 'changed restriction'
  }
  const requests = await installRouteBriefingFixtures(page)
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'copilot-contract', role: 'pilot' } }))
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true, ready: true } }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: 'create-contract', revision: 0 } }))
  await page.route('**/api/ai/chat', (route) => {
    const body = route.request().postDataJSON()
    return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
      text: incomplete ? '비행규칙, 출발 일시, 고도와 TAS를 알려주세요.' : '계산된 경로의 브리핑입니다. 기상자료는 미확인입니다.',
      cards: [{ tool: 'plan_route', result: planned }, ...(briefing ? [{ tool: 'get_route_briefing', result: briefing }] : [])],
      context: body.context, displayTimezone: body.displayTimezone } })
  })
  await page.route('**/api/ai/results/*', (route) => route.fulfill({ json: stored }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
  await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
  await page.getByLabel('기상이에게 질문', { exact: true }).fill('김포 제주 새 경로와 브리핑')
  await page.getByRole('button', { name: '전송', exact: true }).click()
  return { planned, briefing, stored, requests }
}

async function openResult(page) {
  await page.locator('.copilot-fact summary').filter({ hasText: '경로 브리핑' }).click()
  await page.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
  await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toBeVisible()
}

test.describe('copilot-route-create', () => {
  test('publication replacement pins old server and browser snapshots, then reload rejects old imports and accepts new plans', async ({ page }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(path.join(os.tmpdir(), 'amo-publication-contract-'))
    const source = new URL('../../public/data/navdata/', import.meta.url)
    const sourceBefore = await readFile(new URL('enroute.json', source), 'utf8')
    try {
      await cp(source, root, { recursive: true })
      const providerA = await createFileRoutePlanningProvider({ navdataRoot: root, servedNavdataRoot: root })
      const publicationA = (await providerA.loadNavdata()).publicationId
      const runtimeFor = provider => createLocalRuntime({ dataRoot: '/nonexistent-publication-contract',
        createPlanningProvider: () => provider, readSnapshot: () => ({ snapshot: null }) })
      const runtimeA = runtimeFor(providerA)
      const first = await setup(page, { runtime: runtimeA })
      await openResult(page)
      const browserPublication = () => page.evaluate(async () => {
        const { navdataProvider } = await import('/src/features/route-briefing/lib/routePlanner.js')
        return (await navdataProvider.loadNavdata()).publicationId
      })
      expect(await browserPublication()).toBe(publicationA)
      const newEnroute = { ...JSON.parse(sourceBefore), publicationId: `${publicationA}:acceptance-next` }
      await writeFile(path.join(root, 'enroute.json'), JSON.stringify(newEnroute))
      const providerB = await createFileRoutePlanningProvider({ navdataRoot: root, servedNavdataRoot: root })
      const publicationB = (await providerB.loadNavdata()).publicationId
      expect(publicationB).toBe(newEnroute.publicationId)
      expect(providerB.snapshotId).not.toBe(providerA.snapshotId)
      expect((await providerA.loadNavdata()).publicationId).toBe(first.stored.plan.publicationId)
      const oldAgain = await runtimeA.call('plan_route', inputs, 'contract-owner')
      expect(oldAgain.reference.navdataSnapshotId).toBe(first.stored.plan.snapshotId)
      expect(runtimeA.getResult(first.briefing.reference.briefingRef, 'contract-owner').resultHash).toBe(first.stored.resultHash)
      await page.route('**/data/navdata/enroute.json', route => route.fulfill({ json: newEnroute }))
      // A publication is not mixed into the middle of an already loaded browser.
      expect(await browserPublication()).toBe(publicationA)
      await page.reload({ waitUntil: 'domcontentloaded' })
      expect(await browserPublication()).toBe(publicationB)
      await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
      await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
      await page.getByLabel('기상이에게 질문', { exact: true }).fill('이전 자료로 계산한 결과 확인')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      await openResult(page)
      await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('NAVDATA_PLAN_MISMATCH')
      await expect(page.getByRole('button', { name: '확인하고 경로 가져오기', exact: true })).toHaveCount(0)
      await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveAttribute('data-result-hash', first.stored.resultHash)
      const second = await setup(page, { runtime: runtimeFor(providerB) })
      expect(second.stored.plan.publicationId).toBe(publicationB)
      expect(second.stored.plan.snapshotId).toBe(providerB.snapshotId)
      await openResult(page)
      await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
      await expect(page.getByRole('region', { name: '계산 경로 가져오기 확인' })).toBeVisible()
      await page.getByRole('button', { name: '확인하고 경로 가져오기', exact: true }).click()
      await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
        ?.find(feature => feature.geometry?.type === 'LineString')?.geometry)).toEqual(second.stored.request.routeGeometry)
      expect([...second.requests.single.keys()]).toHaveLength(0)
      await page.screenshot({ path: info.outputPath('publication-reloaded-new-plan.png') })
      expect(await readFile(new URL('enroute.json', source), 'utf8')).toBe(sourceBefore)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test('missing conditions are shown together without fabricated geometry or an open-result action', async ({ page }) => {
    await setup(page, { incomplete: true })
    const card = page.getByRole('region', { name: '경로 계산 결과' })
    await expect(card).toContainText('비행 규칙 · 순항고도 · 출발시각 · 진대기속도(TAS, kt)')
    await expect(card).toContainText('경로를 계산하지 않았으며')
    await expect(page.getByRole('button', { name: '같은 결과 전체 보기' })).toHaveCount(0)
  })

  test('generated route opens the exact stored briefing and only imports into the editor after confirmation', async ({ page }, info) => {
    const { stored, requests } = await setup(page)
    await expect(page.getByRole('region', { name: '경로 계산 결과' })).toContainText('RKSS → RKPC')
    await expect(page.getByRole('region', { name: '경로 계산 결과' })).toContainText('거리/TAS 추정')
    await openResult(page)
    const notice = page.getByRole('region', { name: '챗봇 보관 결과' })
    await expect(notice).toHaveAttribute('data-result-hash', stored.resultHash)
    expect([...requests.single.keys()]).toHaveLength(0)
    await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
    await expect(page.getByRole('region', { name: '계산 경로 가져오기 확인' })).toBeVisible()
    await expect(notice).toBeVisible()
    await page.getByRole('button', { name: '가져오기 취소', exact: true }).click()
    await expect(notice).toBeVisible()
    await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
    await page.getByRole('button', { name: '확인하고 경로 가져오기', exact: true }).click()
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
    if (info.project.name === 'mobile') {
      const launcher = await page.getByRole('button', { name: '기상이에게 질문하기' }).boundingBox()
      const next = await page.getByRole('button', { name: '경로비교로', exact: true }).boundingBox()
      expect(next.x + next.width + 8).toBeLessThanOrEqual(launcher.x + 1)
      // Hit-test the right edge, not just the unobscured button centre.
      expect(await page.getByRole('button', { name: '경로비교로', exact: true }).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(rect.right - 2, rect.y + rect.height / 2))
      })).toBe(true)
    }
    await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
    await expect.poll(async () => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
      ?.find((feature) => feature.geometry?.type === 'LineString')?.geometry)).toEqual(stored.request.routeGeometry)
    // The import itself must not replace the original weather with a fresh query.
    expect([...requests.single.keys()]).toHaveLength(0)
    await expect(page.getByText('답변에 사용한 보관 결과 · 읽기 전용')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('copilot-generated-route-editor.png') })
  })

  test('different publication remains viewable but cannot replace the current editor', async ({ page }) => {
    await setup(page, { mismatch: true })
    await openResult(page)
    await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('NAVDATA_PLAN_MISMATCH')
    await expect(page.getByRole('button', { name: '확인하고 경로 가져오기' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toBeVisible()
  })

  test('same publication with changed used airway restrictions cannot be imported', async ({ page }) => {
    await setup(page, { changedAirway: true })
    await openResult(page)
    await page.getByRole('button', { name: '이 경로를 편집기로 가져오기', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('NAVDATA_PLAN_MISMATCH')
    await expect(page.getByRole('button', { name: '확인하고 경로 가져오기' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toBeVisible()
  })
})
