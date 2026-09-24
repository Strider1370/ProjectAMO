import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { prepareUiAction } from '../../../backend/src/ai/ui-actions.js'

async function setup(page, result) {
  await installRouteBriefingFixtures(page)
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'contract', role: 'pilot' } }))
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true, ready: true } }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: 'ui-contract', revision: 0 } }))
  await page.route('**/api/ai/chat', (route) => {
    const body = route.request().postDataJSON()
    return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
      text: '화면 연결 버튼을 준비했어요.', cards: [{ tool: 'request_ui_action', result }], context: body.context, displayTimezone: body.displayTimezone } })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.evaluate(() => Boolean(window.__map?.isStyleLoaded()))).toBe(true)
  await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
  await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
  await page.getByLabel('기상이에게 질문', { exact: true }).fill('화면 열어줘')
  await page.getByRole('button', { name: '전송', exact: true }).click()
  await expect(page.getByRole('region', { name: '화면 연결', exact: true })).toBeVisible()
}

test.describe('copilot-chat-actions', () => {
  test('airport opens only on click and the verified receipt survives folding', async ({ page }, info) => {
    await setup(page, prepareUiAction({ action: 'open_airport', airport: '김포' }))
    const card = page.getByRole('region', { name: '화면 연결', exact: true })
    await expect(page.locator('.airport-panel')).toHaveCount(0)
    await expect(card.getByRole('status')).toHaveCount(0)
    await card.getByRole('button', { name: 'RKSS 공항 패널 열기', exact: true }).click()
    await expect(page.locator('.airport-panel')).toBeVisible()
    await expect(page.locator('.airport-panel-title-code')).toContainText('RKSS')
    await page.screenshot({ path: info.outputPath('copilot-airport-action.png') })
    await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
    await expect(card.getByRole('status')).toContainText('RKSS 공항 패널을 열었어요')
  })

  test('weather selection uses the existing toggle and repeated enable remains on', async ({ page }, info) => {
    await setup(page, prepareUiAction({ action: 'enable_weather_layer', layer: 'airmet' }))
    const card = page.getByRole('region', { name: '화면 연결', exact: true })
    for (let i = 0; i < 2; i++) {
      await card.getByRole('button', { name: 'AIRMET 켜기', exact: true }).click()
      await expect(page.locator('.layer-tile').filter({ hasText: 'AIRMET' })).toHaveAttribute('aria-pressed', 'true')
      if (!i) await page.screenshot({ path: info.outputPath('copilot-layer-action.png') })
      await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
      await expect(card.getByRole('status')).toContainText('레이어 선택을 켰어요')
      await expect(card.getByRole('status')).toContainText('자료의 존재·최신성은 확인한 것이 아니에요')
    }
  })

  test('ambiguous and forged actions provide no executable button', async ({ page }) => {
    await setup(page, prepareUiAction({ action: 'open_airport', airport: '서울' }))
    const card = page.getByRole('region', { name: '화면 연결', exact: true })
    await expect(card).toContainText('AMBIGUOUS_AIRPORT')
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(page.locator('.airport-panel')).toHaveCount(0)
    await setup(page, { status: 'ok', data: { action: { schemaVersion: 1, type: 'open_url', target: 'javascript:alert(1)' } } })
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(card).toContainText('화면은 변경하지 않았어요')
  })
})
