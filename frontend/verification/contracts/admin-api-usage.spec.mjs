import { expect, test } from '@playwright/test'

const FAILED_AT = '2026-10-04T07:00:38.718Z'
const problems = [
  { id: 'satellite_fog', label: 'GK2A 안개', provider: 'KMA API Hub', lastFinishedAt: FAILED_AT, lastIssue: { message: 'HTTP 404' } },
  { id: 'noaa_taf', label: 'TAF 해외', provider: 'NOAA', lastFinishedAt: FAILED_AT, lastIssue: { code: 'api_operation_timeout' } },
]
const health = apiProblems => ({
  generatedAt: FAILED_AT, counts: { total: 0, ok: 0, stopped: 0, never: 0, late: 0 },
  rows: [], groups: {}, collectorExecution: [], apiProblems,
})
const usage = {
  keys: [{ category: 'radar_satellite', label: '레이더·위성', status: 'active', bytes: 500_000_000, limitBytes: 5_000_000_000,
    endpoints: [{ label: 'GK2A 안개', bytes: 500_000_000, requests: 100, failures: 12, lastCalledAt: FAILED_AT }] }],
  onDemandOperations: [{ id: 'adsb', label: 'ADS-B', provider: 'ADS-B Exchange', outcome: 'succeeded', lastFinishedAt: FAILED_AT,
    lastIssue: { message: '이미 복구된 과거 오류' } }],
}
const apiMenu = page => page.getByRole('navigation').getByRole('button', { name: /^API 사용량/ })

// All API responses belong to these fixtures. No account creation, runtime data writes,
// collection requests, or upstream weather calls are needed for this UI contract.
async function fixture(page, { tz = 'KST', usageMode = 'ready' } = {}) {
  const state = { apiProblems: [...problems], usageMode }
  await page.clock.install()
  await page.addInitScript(value => localStorage.setItem('time_zone', value), tz)
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/auth/me') return route.fulfill({ json: { id: 1, username: 'fixture_admin', role: 'admin' } })
    if (pathname === '/api/admin/data-health') return route.fulfill({ json: health(state.apiProblems) })
    if (pathname === '/api/admin/api-hub-usage') return state.usageMode === 'ready'
      ? route.fulfill({ json: usage })
      : route.fulfill({ status: 503, json: { error: 'admin_query_failed' } })
    if (pathname === '/api/admin/pending') return route.fulfill({ json: [] })
    if (pathname === '/api/admin/server-health') return route.fulfill({ json: { process: { bootCount: 1 } } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/admin')
  await expect(apiMenu(page).locator('.ac-badge')).toHaveText('2')
  await apiMenu(page).click()
  return state
}

test.describe('admin-api-usage', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }) })

  for (const [tz, time] of [['KST', '16:00'], ['UTC', '07:00']]) {
    test(`menu badge failures include scheduled and non-API-Hub causes with ${tz} timestamps`, async ({ page }, testInfo) => {
      await fixture(page, { tz })
      const section = page.getByRole('region', { name: '현재 실패한 API 2건' })
      await expect(section).toBeVisible()
      await expect(section.locator('.ac-item')).toHaveCount(2)
      await expect(section).toContainText('GK2A 안개')
      await expect(section).toContainText('HTTP 404')
      await expect(section).toContainText('TAF 해외')
      await expect(section).toContainText('api_operation_timeout')
      await expect(section).toContainText(`${time} ${tz}`)
      expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      await expect(page.getByText('이미 복구된 과거 오류')).toHaveCount(0)
      await expect(page.getByText(/아래 실패 횟수는 오늘의 누적/)).toBeVisible()
      await testInfo.attach(`api-failures-${tz}`, { body: await page.screenshot(), contentType: 'image/png' })
    })
  }

  test('initial usage query failure still explains the menu badge and retries successfully', async ({ page }) => {
    const state = await fixture(page, { usageMode: 'error' })
    await expect(page.getByRole('alert')).toContainText('API 사용량 조회에 실패했습니다')
    await expect(page.getByRole('region', { name: '현재 실패한 API 2건' })).toContainText('HTTP 404')
    state.usageMode = 'ready'
    await page.clock.runFor(5100)
    await expect(page.getByRole('heading', { name: '열쇠별 전송량' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('refresh failure retains usage, while API recovery clears both the list and badge despite historic failures', async ({ page }) => {
    const state = await fixture(page)
    await expect(page.locator('.ac-hero .ac-big')).toHaveText('10%')
    state.usageMode = 'error'
    await page.clock.runFor(5100)
    await expect(page.locator('.ac-api-usage-query')).toContainText('이전 정상 자료를 표시합니다')
    await expect(page.locator('.ac-api-usage-query')).toContainText('마지막 정상 조회')
    await expect(page.locator('.ac-hero .ac-big')).toHaveText('10%')
    state.usageMode = 'ready'
    state.apiProblems = []
    await page.clock.runFor(5100)
    await expect(page.locator('.ac-api-usage-query')).toHaveCount(0)
    await expect(apiMenu(page).locator('.ac-badge')).toHaveCount(0)
    await expect(page.getByRole('region', { name: '현재 실패한 API 0건' })).toContainText('현재 실패 상태인 API가 없습니다')
    const endpoint = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'GK2A 안개', exact: true }) })
    await expect(endpoint.getByRole('cell', { name: '12', exact: true })).toBeVisible()
  })
})
