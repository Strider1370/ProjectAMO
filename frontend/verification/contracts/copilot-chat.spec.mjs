import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { normalizeRouteContext } from '../../../backend/src/ai/route-context.js'
import fs from 'node:fs'
import { createLocalRuntime } from '../../../backend/src/ai/local-runtime.js'
import { prepareRouteSettings } from '../../../backend/src/ai/route-settings.js'
import { buildVerticalProfile } from '../../../backend/src/briefing/vertical-profile.js'

async function setup(page, { ready = true, enabled = true, slow = false, cards = [], url = '/' } = {}) {
  const calls = []
  let finish, conversationCount = 0
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'copilot-contract', role: 'pilot' } }))
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled, ready: enabled && ready,
    reason: !enabled ? 'FEATURE_DISABLED' : ready ? null : 'PROVIDER_NOT_CONFIGURED' } }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: `conversation-test-${++conversationCount}`, revision: 0 } }))
  await page.route('**/api/ai/chat', async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    if (slow) await new Promise((r) => { finish = r })
    await route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: slow ? 'cancelled' : 'completed',
      text: slow ? '요청을 중지했어요.' : '<script>window.injected=true</script> 관측 자료를 확인했어요.', cards, context: body.context, displayTimezone: body.displayTimezone } })
  })
  await page.route('**/api/ai/cancel', async (route) => { finish?.(); await route.fulfill({ json: { accepted: true } }) })
  const statusResponse = page.waitForResponse('**/api/ai/status')
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await statusResponse
  if (enabled) await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toBeVisible()
  return calls
}

test.describe('copilot-chat', () => {
  test('feature OFF leaves the airport dashboard usable without chat requests or launcher clearance', async ({ page }) => {
    const calls = await setup(page, { enabled: false, url: '/?airport=RKSI' })
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toHaveCount(0)
    await expect(page.locator('.copilot-window, .copilot-launcher')).toHaveCount(0)
    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeVisible()
    const nav = page.getByRole('navigation', { name: '섹션 이동' })
    await nav.getByRole('button', { name: /^TAF/ }).click()
    await expect(nav.getByRole('button', { name: 'METAR', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeHidden()
    await expect(page.locator('.map-shell')).toBeVisible()
    expect(calls).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('provider HTTP failure preserves the map and retries only the same explicit request', async ({ page }) => {
    await setup(page)
    const requests = []
    await page.route('**/api/ai/chat', route => {
      const body = route.request().postDataJSON()
      requests.push(body)
      return requests.length === 1 ? route.fulfill({ status: 503, json: { error: 'PROVIDER_UNAVAILABLE' } })
        : route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1,
          status: 'completed', text: '명시적으로 다시 확인한 응답입니다.', cards: [], context: body.context, displayTimezone: body.displayTimezone } })
    })
    const bounds = await page.locator('.map-shell').boundingBox()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('김포공항 자료 확인')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('PROVIDER_UNAVAILABLE')
    await expect(page.getByRole('log')).not.toContainText('명시적으로 다시 확인한 응답입니다.')
    expect(requests.length).toBe(1)
    await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
    expect(await page.locator('.map-shell').boundingBox()).toEqual(bounds)
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByRole('button', { name: '같은 요청 다시 확인', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('명시적으로 다시 확인한 응답입니다.')
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
  })

  test('floating launcher preserves map bounds, drafts, history and plain text rendering', async ({ page }, info) => {
    const calls = await setup(page)
    const mobile = info.project.name === 'mobile'
    const before = await page.locator('.map-shell').boundingBox()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    const input = page.getByLabel('기상이에게 질문', { exact: true })
    await input.fill('김포공항 날씨')
    await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toBeFocused()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await expect(input).toHaveValue('김포공항 날씨')
    expect(await page.locator('.map-shell').boundingBox()).toEqual(before)
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('<script>window.injected=true</script>')
    expect(await page.evaluate(() => window.injected)).toBeUndefined()
    await input.fill('제주는?')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect.poll(() => calls.length).toBe(2)
    expect(calls[1].conversationId).toBe(calls[0].conversationId)
    expect(calls[1].revision).toBe(1)
    if (!mobile) {
      const win = page.getByRole('dialog', { name: '기상이 대화', exact: true })
      const original = await win.boundingBox()
      await page.getByRole('button', { name: '대화창 이동: 방향키 사용' }).focus()
      await page.keyboard.press('ArrowLeft')
      expect((await win.boundingBox()).x).toBe(original.x - 20)
      await page.getByRole('button', { name: '대화창 크게 보기' }).click()
      expect((await win.boundingBox()).width).toBe(480)
      await page.getByRole('button', { name: '대화창 기본 위치로' }).click()
      expect(await page.locator('.map-shell').boundingBox()).toEqual(before)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('copilot-open.png') })
  })

  test('folding does not cancel; explicit stop completes the active request', async ({ page }) => {
    const calls = await setup(page, { slow: true })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('지금 SIGMET은?')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect.poll(() => calls.length).toBe(1)
    await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await expect(page.getByRole('button', { name: '중지', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '중지', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('요청을 중지했어요.')
  })

  test('unconfigured provider is explicit, with no fabricated response', async ({ page }) => {
    const calls = await setup(page, { ready: false })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await expect(page.getByText('서버의 LLM 연결 설정이 필요해요.')).toBeVisible()
    await expect(page.getByRole('button', { name: '전송', exact: true })).toHaveCount(0)
    expect(calls.length).toBe(0)
  })
})

test.describe('copilot-route', () => {
  test('late manual route calculation cannot replace newly prefilled settings', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    await installRouteBriefingFixtures(page)
    let release, requested = false
    const waiting = new Promise((resolve) => { release = resolve })
    await page.route('**/api/briefing/route-exposure', async (route) => {
      requested = true
      await waiting
      await route.fulfill({ json: { trigger: 'unavailable', hazards: [] } })
    })
    await setup(page, { cards: [{ tool: 'prepare_route_settings', result: prepareRouteSettings({ departure: '김포', arrival: '제주' }) }] })
    await page.getByRole('button', { name: mobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
    await page.getByRole('button', { name: /RKPK$/ }).click()
    await enterRouteTokens(page, ['SEL'])
    await expect.poll(() => requested).toBe(true)
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('김포에서 제주로 새 입력')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true }).click()
    await page.getByRole('button', { name: '확인하고 입력 채우기', exact: true }).click()
    await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
    const completed = page.waitForResponse((response) => response.url().endsWith('/api/briefing/route-exposure'))
    release()
    await completed
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) })
    await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features?.length ?? 0)).toBe(0)
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeDisabled()
  })

  test('validated settings prefill waits for a click, then existing user generation exports exact flight inputs', async ({ page }, info) => {
    await installRouteBriefingFixtures(page)
    const result = prepareRouteSettings({ departure: '김포', arrival: '제주', flightRule: 'IFR', cruiseAltitude: { value: 310, unit: 'FL' },
      departureLocal: '2026-09-23T21:03', arrivalLocal: '2026-09-23T22:30' })
    const contexts = [], calculations = []
    const navdata = JSON.parse(fs.readFileSync(new URL('../../public/data/navdata/enroute.json', import.meta.url)))
    await page.route('**/api/ai/contexts', (route) => {
      contexts.push(normalizeRouteContext(route.request().postDataJSON(), { navdata }))
      return route.fulfill({ status: 201, json: { status: 'ok', contextRef: 'context-prefilled', expiresAt: new Date(Date.now() + 900_000).toISOString() } })
    })
    page.on('request', (request) => { if (request.method() === 'POST' && /\/api\/(route-briefing|vertical-profile|briefing\/)/.test(request.url())) calculations.push(request.url()) })
    const calls = await setup(page, { cards: [{ tool: 'prepare_route_settings', result }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('김포에서 제주로 21시3분 출발, 22시30분 도착, IFR FL310')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    const card = page.getByRole('region', { name: '경로 설정 입력안', exact: true })
    await expect(card).toContainText('31,000 ft')
    await expect(card).toContainText('21:03 KST')
    expect(contexts.length).toBe(0)
    expect(calculations).toEqual([])
    await card.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true }).click()
    await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
    await expect(page.getByRole('region', { name: '경로 설정 덮어쓰기 확인' })).toHaveCount(0)
    expect(calculations).toEqual([])
    await page.screenshot({ path: info.outputPath('copilot-settings-prefilled.png') })
    await enterRouteTokens(page, ['SEL'])
    await page.getByRole('button', { name: '경로비교로', exact: true }).click()
    await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('적용한 경로를 설명해 줘')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect.poll(() => contexts.length).toBe(1)
    expect(contexts[0].request.departureAirport).toBe('RKSS')
    expect(contexts[0].request.arrivalAirport).toBe('RKPC')
    expect(contexts[0].request.etd).toBe(result.data.action.fields.etd)
    expect(contexts[0].request.eta).toBe(result.data.action.fields.eta)
    expect(contexts[0].request.plannedCruiseAltitudeFt).toBe(31000)
    await expect.poll(() => calls.length).toBe(2)
    expect(calls[1].context.contextRef).toBe('context-prefilled')
  })

  for (const applied of [false, true]) {
    test(`settings prefill confirms ${applied ? 'applied route removal' : 'draft replacement and stale preview'} without auto generation`, async ({ page }, info) => {
      const mobile = info.project.name === 'mobile'
      await installRouteBriefingFixtures(page)
      const result = prepareRouteSettings({ departure: '김포', arrival: '제주' })
      await setup(page, { cards: [{ tool: 'prepare_route_settings', result }] })
      await page.getByRole('button', { name: mobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
      await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
      await page.getByRole('button', { name: /RKSS$/ }).click()
      await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
      await page.getByRole('button', { name: /RKPK$/ }).click()
      if (applied) {
        await enterRouteTokens(page, ['SEL'])
        await page.getByRole('button', { name: '경로비교로', exact: true }).click()
        await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
      }
      await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
      await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
      await page.getByLabel('기상이에게 질문', { exact: true }).fill('김포에서 제주로 바꾸고 싶어')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      const card = page.getByRole('region', { name: '경로 설정 입력안', exact: true })
      await card.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true }).click()
      const confirm = page.getByRole('region', { name: '경로 설정 덮어쓰기 확인', exact: true })
      await expect(confirm).toBeVisible()
      await confirm.getByRole('button', { name: '입력 변경 취소' }).click()
      await expect(confirm).toHaveCount(0)
      await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
      if (mobile) await page.getByRole('button', { name: '브리핑', exact: true }).click()
      if (applied) await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
      else await expect(page.getByRole('button', { name: /도착.*RKPK/ })).toBeVisible()
      await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
      await card.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true }).click()
      await expect(confirm).toBeVisible()
      if (!applied) {
        await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
        if (mobile) await page.getByRole('button', { name: '브리핑', exact: true }).click()
        await page.getByRole('button', { name: /도착.*RKPK/ }).click()
        await page.getByRole('button', { name: /RKNY$/ }).click()
        await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
        await confirm.getByRole('button', { name: '확인하고 입력 채우기' }).click()
        await expect(card.getByRole('alert')).toContainText('ROUTE_SETTINGS_CHANGED')
        await card.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true }).click()
        await expect(confirm).toBeVisible()
      }
      await confirm.getByRole('button', { name: '확인하고 입력 채우기' }).click()
      await expect(page.getByRole('button', { name: /출발.*RKSS/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
      await expect(page.getByText('기본 경로', { exact: true })).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features?.length ?? 0)).toBe(0)
    })
  }

  test('ambiguous route settings show airport candidates without an execution button', async ({ page }) => {
    const result = prepareRouteSettings({ departure: '서울', arrival: '제주' })
    await setup(page, { cards: [{ tool: 'prepare_route_settings', result }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('서울에서 제주로')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    const card = page.getByRole('region', { name: '경로 설정 입력안', exact: true })
    await expect(card).toContainText('RKSI')
    await expect(card).toContainText('RKSS')
    await expect(card.getByRole('button', { name: '경로 설정에 입력 채우기', exact: true })).toHaveCount(0)
  })

  for (const choice of ['current', 'previous', 'none', 'changed-again']) {
    test(`context conflict ${choice} freezes the selected route and isolates changed conversation facts`, async ({ page }, info) => {
      const mobile = info.project.name === 'mobile'
      const fixture = JSON.parse(fs.readFileSync(new URL('../../../backend/fixtures/ai/gimpo-jeju.json', import.meta.url)))
      const runtime = createLocalRuntime({ dataRoot: '/nonexistent-copilot-contract', fixture, readSnapshot: () => ({ snapshot: null }) })
      const card = await runtime.call('get_route_briefing', { fixture_id: fixture.id }, 'test')
      await installRouteBriefingFixtures(page)
      const calls = await setup(page, { cards: [{ tool: 'get_route_briefing', result: card }] })
      const contexts = []
      await page.route('**/api/ai/contexts', (route) => {
        contexts.push(route.request().postDataJSON())
        return route.fulfill({ status: 201, json: { status: 'ok', contextRef: `context-${contexts.length}`, expiresAt: new Date(Date.now() + 900_000).toISOString() } })
      })
      await page.route('**/api/ai/results/*', (route) => route.fulfill({ json: runtime.getResult(card.reference.briefingRef, 'test') }))
      await page.getByRole('button', { name: mobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
      await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
      await page.getByRole('button', { name: /RKSS$/ }).click()
      await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
      await page.getByRole('button', { name: /RKPK$/ }).click()
      await enterRouteTokens(page, ['SEL'])
      await page.getByRole('button', { name: '경로비교로', exact: true }).click()
      await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
      const input = page.getByLabel('기상이에게 질문', { exact: true })
      await input.fill('첫 경로 설명')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      await expect(page.getByRole('log')).toContainText('관측 자료를 확인했어요.')
      expect(contexts[0].request.arrivalAirport).toBe('RKPK')
      // Change the displayed route via the real read-only result installation.
      await page.getByText('경로 브리핑 · 일부 미확인', { exact: true }).click()
      await page.getByRole('button', { name: '같은 결과 전체 보기' }).click()
      await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toBeVisible()
      await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
      await input.fill('이 경로 착빙 자료는?')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      const conflict = page.getByRole('region', { name: '어느 맥락으로 질문할까요?' })
      await expect(conflict).toBeVisible()
      await expect(conflict).toContainText('이전: RKSS → RKPK')
      await expect(conflict).toContainText('현재: RKSS → RKPC')
      expect(calls.length).toBe(1)
      expect(contexts.length).toBe(1) // No registration/provider cost before choice.
      // Cancel preserves draft and focus; folding preserves the unsubmitted choice.
      await page.getByRole('button', { name: '취소하고 질문 수정' }).click()
      await expect(input).toHaveValue('이 경로 착빙 자료는?')
      await expect(input).toBeFocused()
      await page.getByRole('button', { name: '전송', exact: true }).click()
      await expect(conflict).toBeVisible()
      await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
      await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
      await expect(conflict).toBeVisible()
      if (choice === 'changed-again') {
        await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
        if (mobile) await page.getByRole('button', { name: '브리핑', exact: true }).click()
        await page.getByRole('button', { name: mobile ? '이전 단계' : '닫기', exact: true }).last().click()
        await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveCount(0)
        await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
        await page.getByRole('button', { name: '현재 기준으로 새 대화', exact: true }).click()
        await expect(conflict).toContainText('화면이 다시 변경됐어요.')
        await expect(conflict).toContainText('현재: RKSS → RKPK')
        expect(calls.length).toBe(1)
        expect(contexts.length).toBe(1)
        await page.getByRole('button', { name: '취소하고 질문 수정', exact: true }).click()
        // Detaching explicitly must not keep the prior route in the server conversation.
        await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
        await page.getByRole('button', { name: '전송', exact: true }).click()
        await expect.poll(() => calls.length).toBe(2)
        expect(calls[1].context).toBeNull()
        expect(calls[1].conversationId).not.toBe(calls[0].conversationId)
        return
      }
      if (choice === 'current') await page.screenshot({ path: info.outputPath('copilot-context-choice.png') })
      const labels = { current: '현재 기준으로 새 대화', previous: '이전 기준으로 이어가기', none: '연결 없이 새 대화' }
      await page.getByRole('button', { name: labels[choice], exact: true }).click()
      await expect.poll(() => calls.length).toBe(2)
      await expect(conflict).toHaveCount(0)
      if (choice === 'previous') {
        expect(calls[1].conversationId).toBe(calls[0].conversationId)
        expect(calls[1].context).toEqual(calls[0].context)
        expect(contexts.length).toBe(1)
      } else {
        expect(calls[1].conversationId).not.toBe(calls[0].conversationId)
        expect(calls[1].revision).toBe(0)
        if (choice === 'none') {
          expect(calls[1].context).toBeNull()
          await expect(page.getByLabel('현재 화면 연결', { exact: true })).not.toBeChecked()
        } else {
          expect(contexts[1].request.routeGeometry).toEqual(fixture.request.routeGeometry)
          expect(contexts[1].request.routeMarkers).toEqual(fixture.request.routeMarkers)
          expect(contexts[1].request.nwpTimeSelection).toEqual(fixture.request.nwpTimeSelection)
          expect(calls[1].context.contextRef).toBe('context-2')
          expect(calls[1].context.revision).not.toBe(calls[0].context.revision)
        }
      }
      await expect(page.getByRole('log')).toContainText('첫 경로 설명')
      await expect(page.getByRole('log')).toContainText('이 경로 착빙 자료는?')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  }

  test('expired stored result offers an explicit new question without replacing the result', async ({ page }) => {
    const reference = { briefingRef: 'briefing_12345678-1234-1234-1234-123456789abc', resultHash: 'expired' }
    await page.route('**/api/ai/results/*', (route) => route.fulfill({ status: 404, json: { status: 'error', error: { code: 'REFERENCE_EXPIRED' } } }))
    const calls = await setup(page, { cards: [{ tool: 'get_route_briefing', result: { status: 'partial', reference } }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('이전 결과')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByText('경로 브리핑 · 일부 미확인', { exact: true }).click()
    await page.getByRole('button', { name: '같은 결과 전체 보기' }).click()
    await expect(page.getByRole('alert')).toContainText('REFERENCE_EXPIRED')
    await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveCount(0)
    await page.getByRole('button', { name: '현재 경로로 다시 질문 작성' }).click()
    await expect(page.getByLabel('기상이에게 질문', { exact: true })).toHaveValue('현재 적용된 경로를 최신 자료로 다시 브리핑해 줘')
    expect(calls.length).toBe(1) // Button prepares text; only the user submits a new paid request.
  })

  test('late stored result cannot reopen over a newly selected route screen', async ({ page }, info) => {
    const fixture = JSON.parse(fs.readFileSync(new URL('../../../backend/fixtures/ai/gimpo-jeju.json', import.meta.url)))
    const runtime = createLocalRuntime({ dataRoot: '/nonexistent-copilot-contract', fixture, readSnapshot: () => ({ snapshot: null }) })
    const card = await runtime.call('get_route_briefing', { fixture_id: fixture.id }, 'test')
    let release, requested = false
    await page.route('**/api/ai/results/*', async (route) => {
      requested = true
      await new Promise((resolve) => { release = resolve })
      await route.fulfill({ json: runtime.getResult(card.reference.briefingRef, 'test') })
    })
    await setup(page, { cards: [{ tool: 'get_route_briefing', result: card }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('이전 결과')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByText('경로 브리핑 · 일부 미확인', { exact: true }).click()
    await page.getByRole('button', { name: '같은 결과 전체 보기' }).click()
    await expect.poll(() => requested).toBe(true)
    await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
    await page.getByRole('button', { name: info.project.name === 'mobile' ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    release()
    await expect(page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ })).toBeVisible()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    if (info.project.name === 'mobile') await page.getByText('경로 브리핑 · 일부 미확인', { exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('RESULT_OPEN_CANCELLED')
    await expect(page.getByRole('region', { name: '챗봇 보관 결과' })).toHaveCount(0)
  })

  test('opens the identical stored briefing and route without any latest-weather calculation', async ({ page }, info) => {
    const fixture = JSON.parse(fs.readFileSync(new URL('../../../backend/fixtures/ai/gimpo-jeju.json', import.meta.url)))
    fixture.request.nwpTimeSelection = { baseTime: fixture.request.etd,
      waypointOverrides: [{ waypointId: fixture.request.routeMarkers[5].id, offsetHours: 3 }] }
    const runtime = createLocalRuntime({ dataRoot: '/nonexistent-copilot-contract', fixture, readSnapshot: () => ({ snapshot: null }) })
    const card = await runtime.call('get_route_briefing', { fixture_id: fixture.id }, 'test')
    const stored = runtime.getResult(card.reference.briefingRef, 'test')
    expect(stored.status).toBe('ok')
    // Explicit synthetic terrain for the rendering contract; real stored KIM/DEM
    // equivalence is covered separately by copilot-stored-nwp-eval.mjs.
    stored.verticalProfile = buildVerticalProfile(stored.request, { sampleAxis: axis => ({
      terrain: { unit: 'm', values: axis.samples.map(({ index }) => ({ index, elevationM: 100 })) }, warnings: [],
    }) })
    const calculations = []
    const attached = []
    await page.route('**/api/ai/contexts', (route) => {
      attached.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { status: 'ok', contextRef: 'context-stored-result', expiresAt: new Date(Date.now() + 900_000).toISOString() } })
    })
    await page.route('**/api/ai/results/*', (route) => route.fulfill({ json: stored }))
    await page.route(/\/api\/(route-briefing|vertical-profile|briefing\/(cross-section|altitudes|nwp-time-refresh))$/, (route) => {
      calculations.push(route.request().url()); return route.fulfill({ status: 500, json: { error: 'MUST_NOT_RECALCULATE' } })
    })
    await setup(page, { cards: [{ tool: 'get_route_briefing', result: card }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('보관된 브리핑 보기')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByText('경로 브리핑 · 일부 미확인', { exact: true }).click()
    await page.getByRole('button', { name: '같은 결과 전체 보기' }).click()
    const notice = page.getByRole('region', { name: '챗봇 보관 결과' })
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('data-result-ref', card.reference.briefingRef)
    await expect(notice).toHaveAttribute('data-result-hash', card.reference.resultHash)
    await expect(notice).toContainText('최신 조회가 아닙니다')
    await expect(page.getByText('경로·시간에 걸린 위험기상 없음', { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features?.find((f) => f.properties?.role === 'route-preview-line')?.geometry))
      .toEqual(fixture.request.routeGeometry)
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toBeVisible()
    const timeRail = page.getByLabel('NWP 시간 규칙', { exact: true }).first()
    await expect(timeRail).toContainText('+3h')
    await expect(timeRail.getByRole('button')).toHaveCount(0)
    await expect(page.locator('.vertical-profile-nwp-hint').first()).toContainText('이 화면에서는 변경할 수 없습니다')
    await expect(page.locator('.vertical-profile-procedure-line').first()).toHaveCSS('fill', 'none')
    await expect(page.locator('.vertical-profile-nwp-rail-line').first()).toHaveCSS('stroke-width', '6px')
    expect(calculations).toEqual([])
    await page.screenshot({ path: info.outputPath('copilot-stored-result.png') })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('지금 보고 있는 이 경로는?')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect.poll(() => attached.length).toBe(1)
    expect(attached[0].request.routeGeometry).toEqual(fixture.request.routeGeometry)
    expect(attached[0].request.routeMarkers).toEqual(fixture.request.routeMarkers)
    expect(attached[0].request.nwpTimeSelection).toEqual(fixture.request.nwpTimeSelection)
    await page.getByRole('button', { name: '기상이 창 접기', exact: true }).click()
    if (info.project.name === 'mobile') await page.getByRole('button', { name: '브리핑', exact: true }).click()
    await expect(notice).toBeVisible()
    await page.getByRole('button', { name: info.project.name === 'mobile' ? '이전 단계' : '닫기', exact: true }).last().click()
    await expect(notice).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features?.length)).toBe(0)
    expect(calculations).toEqual([])
  })

  test('altitude table renders server rows without turning unknown or invalid inputs into safe choices', async ({ page }, info) => {
    await setup(page, { cards: [{ tool: 'compare_route_altitudes', result: { status: 'partial', reference: { effectiveNow: '2026-09-23T12:00:00Z' },
      sources: [], issues: [{ code: 'MODEL_WEATHER_UNAVAILABLE' }], data: { rows: [
        { altitudeFt: 31000, label: 'FL310', status: 'input_only', profileStatus: 'cruise_fallback', wind: null, hazards: { total: 0 }, notams: { total: 0 } },
        { altitudeFt: 32000, label: 'FL320', status: 'input_invalid', profileStatus: 'not_assessed' },
      ] } } }] })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('FL310과 FL320을 비교해줘')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByText('고도 비교 · 일부 미확인', { exact: true }).click()
    const table = page.getByRole('table', { name: '요청 고도별 비교 · 절차 구간을 포함한 전체 경로' })
    await expect(table).toBeVisible()
    await expect(table.getByRole('row').filter({ hasText: 'FL310' })).toContainText('입력 고도 · 조건 미확인')
    await expect(table.getByRole('row').filter({ hasText: 'FL310' })).toContainText('착빙 자료 없음')
    await expect(table.getByRole('row').filter({ hasText: 'FL320' })).toContainText('AIP 조건 불일치')
    await expect(page.getByText('고도 추천이나 안전 순위가 아닙니다.', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('copilot-altitudes.png') })
  })

  test('exports the applied browser route with independent markers and keeps the route panel in place', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    await installRouteBriefingFixtures(page)
    const calls = await setup(page)
    const contexts = [], errors = []
    const navdata = JSON.parse(fs.readFileSync(new URL('../../public/data/navdata/enroute.json', import.meta.url)))
    await page.route('**/api/ai/contexts', async (route) => {
      try {
        const value = normalizeRouteContext(route.request().postDataJSON(), { navdata })
        contexts.push(value)
        await route.fulfill({ status: 201, json: { status: 'ok', contextRef: 'context-browser-test', expiresAt: new Date(Date.now() + 900_000).toISOString() } })
      } catch (error) {
        errors.push(error.code)
        await route.fulfill({ status: 400, json: { error: error.code } })
      }
    })
    await page.getByRole('button', { name: mobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
    await page.getByRole('button', { name: /RKPK$/ }).click()
    await enterRouteTokens(page, ['SEL'])
    await page.getByRole('button', { name: '경로비교로', exact: true }).click()
    await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
    const bounds = await page.locator('.map-shell').boundingBox()
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('이 경로 자료를 설명해 줘')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect.poll(() => contexts.length + errors.length).toBe(1)
    expect(errors).toEqual([])
    expect(contexts[0].request.departureAirport).toBe('RKSS')
    expect(contexts[0].request.arrivalAirport).toBe('RKPK')
    expect(contexts[0].request.routeGeometry.coordinates.length).toBeGreaterThanOrEqual(2)
    expect(contexts[0].request.routeMarkers.length).toBeGreaterThanOrEqual(2)
    expect(contexts[0].request.routeModel.schemaVersion).toBe(1)
    await expect.poll(() => calls.length).toBe(1)
    expect(calls[0].context.contextRef).toBe('context-browser-test')
    expect(calls[0].context.revision).toBe(contexts[0].revision)
    expect(await page.locator('.map-shell').boundingBox()).toEqual(bounds)
    if (!mobile) await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
  })
})
