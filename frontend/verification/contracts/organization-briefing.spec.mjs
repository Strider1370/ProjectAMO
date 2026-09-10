import { test, expect } from '../fixtures.mjs'
import { installOrganizationBriefingFixture } from '../organization-fixture.mjs'

test.describe('organization-briefing-provider', () => {
  test.setTimeout(60000)
  test('uses the existing briefing screen and organization API for shared plan revisions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '데스크톱·iPad 가로 대상')
    const requests = await installOrganizationBriefingFixture(page)
    await page.goto('/?orgId=11&orgFlightId=71', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.briefing-view')).toBeVisible({ timeout: 25000 })
    await expect(page.getByRole('region', { name: '기관 브리핑 조회', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('기관 조회 고도')).toHaveCount(0)
    await expect(page.getByText('model_values_incomplete')).toHaveCount(0)
    await expect(page.getByText('위험 판단 제한', { exact: true })).toBeVisible()
    await expect(page.getByText('경로·시간에 걸린 위험기상 없음', { exact: true })).toHaveCount(0)
    await page.waitForTimeout(700)
    expect(requests.personal).toEqual([])
    expect(requests.organization[0].flightVersion).toBe(1)
    requests.flight.version = 2
    requests.flight.etd = requests.flight.snapshot.etd = '2026-09-10T03:00:00Z'
    requests.flight.eta = requests.flight.snapshot.eta = '2026-09-10T04:00:00Z'
    requests.flight.snapshot.cruiseAltitudeFt = 4500
    await page.reload()
    await expect(page.locator('.briefing-view')).toBeVisible({ timeout: 25000 })
    await expect.poll(() => requests.organization.length).toBe(2)
    expect(requests.organization[1].flightVersion).toBe(2)
    await expect(page.locator('.bv-header')).toContainText('12:00')
    expect(requests.personal).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('organization-existing-briefing.png'), fullPage: true })
    await page.locator('.bv-head-side').getByRole('button', { name: '닫기', exact: true }).click()
    await expect(page).toHaveURL(/\/lounge\/11\/flights\/71$/)
    await expect(page.getByRole('region', { name: '기관 브리핑 조회', exact: true })).toHaveCount(0)
  })

  test('initial failure has only retry and return actions without the duplicate controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '데스크톱·iPad 가로 대상')
    const requests = await installOrganizationBriefingFixture(page)
    requests.failNext = true
    await page.goto('/?orgId=11&orgFlightId=71')
    await expect(page.getByText('기상 브리핑을 불러오지 못했습니다.', { exact: false })).toBeVisible()
    await expect(page.getByLabel('기관 조회 시각')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '개인 경로로 전환', exact: true })).toHaveCount(0)
    await expect(page.getByText('fixture_partial_failure')).toHaveCount(0)
    expect(requests.personal).toEqual([])
    await page.getByRole('button', { name: '다시 시도', exact: true }).click()
    await expect(page.locator('.briefing-view')).toBeVisible({ timeout: 25000 })
    expect(requests.organization).toHaveLength(2)
    expect(requests.personal).toEqual([])
  })

  test('a late organization response cannot restore a briefing after returning to the lounge', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '데스크톱·iPad 가로 대상')
    const requests = await installOrganizationBriefingFixture(page)
    requests.holdNext = true
    await page.goto('/?orgId=11&orgFlightId=71')
    await expect.poll(() => Boolean(requests.release)).toBe(true)
    await page.getByRole('button', { name: '기관 비행으로 돌아가기', exact: true }).click()
    requests.release()
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(/\/lounge\/11\/flights\/71$/)
    await expect(page.locator('.briefing-view')).toHaveCount(0)
    expect(requests.personal).toEqual([])
  })
})
