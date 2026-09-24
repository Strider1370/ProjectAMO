import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function setup(context, { loggedIn = true, failSave = false, configured = true, enabled = false, remaining = 5 } = {}) {
  let settings = { enabled, configured, funding: 'operator', provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'high', revision: 0,
    quota: { remaining, used: 5 - remaining, limit: 5, resetsAt: new Date(Date.now() + 3_600_000).toISOString() } }
  const calls = []
  await context.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await context.route('**/api/auth/me', (route) => route.fulfill({ status: loggedIn ? 200 : 401,
    json: loggedIn ? { id: 901, username: 'labs-test', role: 'pilot' } : { error: 'unauthenticated' } }))
  await context.route('**/api/ai/status', (route) => route.fulfill({ json: loggedIn
    ? { ...settings, ready: settings.enabled && settings.configured } : { enabled: false, ready: false, reason: 'LOGIN_REQUIRED' } }))
  await context.route('**/api/ai/settings', (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); calls.push(input)
      if (failSave) return route.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } })
      settings = { ...settings, enabled: input.enabled, revision: settings.revision + 1 }
    }
    return route.fulfill({ json: settings })
  })
  await context.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: 'conversation-test', revision: 0 } }))
  await context.route('**/api/ai/chat', (route) => {
    calls.push({ chat: route.request().postDataJSON() })
    settings = { ...settings, quota: { ...settings.quota, remaining: 0, used: 5 } }
    return route.fulfill({ json: { status: 'completed', text: '확인할 공항을 알려주세요.', cards: [], revision: 1, quota: settings.quota } })
  })
  return calls
}
async function openLabs(page, mobile) {
  if (mobile) {
    await page.getByRole('button', { name: '더보기', exact: true }).click()
    await page.getByRole('button', { name: '설정', exact: true }).click()
  } else {
    await page.locator('.sidebar-collapsed-utility > .sidebar-icon-button[aria-label="설정"]').click()
    await page.getByRole('group', { name: '알림, 도움말 및 앱 설정' }).getByRole('button', { name: '설정', exact: true }).click()
  }
  await page.getByRole('tab', { name: '실험실', exact: true }).click()
}

test.describe('copilot-chat-labs', () => {
  test('operator-funded default OFF, no key form, explicit toggle syncs another tab', async ({ page, context }, info) => {
    const calls = await setup(context)
    const peer = await context.newPage()
    await peer.goto('/', { waitUntil: 'domcontentloaded' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toHaveCount(0)
    await openLabs(page, info.project.name === 'mobile')
    const toggle = page.getByRole('switch', { name: '기상이 켜기' })
    await expect(toggle).not.toBeChecked()
    await expect(toggle).toBeEnabled()
    await expect(page.locator('.copilot-labs input[type="password"]')).toHaveCount(0)
    await expect(page.locator('.copilot-labs')).toContainText('API 비용은 운영자가 부담')
    await expect(page.locator('.copilot-labs')).toContainText('오늘 남은 질문 5/5')
    await toggle.click()
    await expect(toggle).toBeChecked()
    await expect(peer.getByRole('button', { name: '기상이에게 질문하기' })).toBeVisible()
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await expect(peer.getByRole('button', { name: '기상이에게 질문하기' })).toHaveCount(0)
    expect(calls).toEqual([{ enabled: true }, { enabled: false }])
    await page.screenshot({ path: info.outputPath('copilot-labs-operator.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await peer.close()
  })

  test('failed preference save never enables the launcher', async ({ page, context }, info) => {
    await setup(context, { failSave: true })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openLabs(page, info.project.name === 'mobile')
    await page.getByRole('switch', { name: '기상이 켜기' }).click()
    await expect(page.locator('.copilot-labs [role="alert"]')).toContainText('저장하지 못했어요')
    await expect(page.getByRole('switch', { name: '기상이 켜기' })).not.toBeChecked()
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toHaveCount(0)
  })

  test('anonymous users see login guidance, not credentials or an active launcher', async ({ page, context }, info) => {
    await setup(context, { loggedIn: false })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openLabs(page, info.project.name === 'mobile')
    await expect(page.locator('.copilot-labs')).toContainText('로그인 후')
    await expect(page.locator('.copilot-labs input')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '기상이에게 질문하기' })).toHaveCount(0)
  })

  test('missing operator configuration cannot enable chat', async ({ page, context }, info) => {
    await setup(context, { configured: false })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openLabs(page, info.project.name === 'mobile')
    await expect(page.getByRole('switch', { name: '기상이 켜기' })).toBeDisabled()
    await expect(page.locator('.copilot-labs [role="alert"]')).toContainText('서버의 LLM 연결 설정')
  })

  test('fifth question shows 0/5, preserves the answer, blocks new sends across reload', async ({ page, context }, info) => {
    const calls = await setup(context, { enabled: true, remaining: 1 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await expect(page.locator('.copilot-composer')).toContainText('오늘 남은 질문 1/5')
    await page.getByLabel('기상이에게 질문', { exact: true }).fill('안녕')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await expect(page.locator('.copilot-bubble').last()).toHaveText('확인할 공항을 알려주세요.')
    await expect(page.locator('.copilot-composer')).toContainText('오늘 남은 질문 0/5')
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeDisabled()
    expect(calls.filter((call) => call.chat)).toHaveLength(1)
    await page.screenshot({ path: info.outputPath('copilot-quota-exhausted.png') })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
    await expect(page.locator('.copilot-composer')).toContainText('오늘 남은 질문 0/5')
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeDisabled()
    expect(calls.filter((call) => call.chat)).toHaveLength(1)
  })
})
