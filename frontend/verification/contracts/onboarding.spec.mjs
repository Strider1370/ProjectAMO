import { test, expect } from '../fixtures.mjs'

// 첫 방문 사용 안내: 업데이트 내역 대신 프로젝트 소개·주의 카드로 시작하고, 발표된 SIGMET·AIRMET이 없으면 예시 배지를 강조한다.
test.describe('onboarding', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '자동 사용 안내는 데스크톱 첫 방문만')
  })

  test('first visit opens the intro with the operational caution, then the steps', async ({ page }) => {
    await page.addInitScript(() => { localStorage.removeItem('amo.tour.v1.done'); localStorage.removeItem('projectamo:lastSeenVersion') })
    for (const type of ['sigmet', 'airmet']) await page.route(`**/api/${type}`, (route) => route.fulfill({ json: { items: [] } }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const card = page.getByRole('dialog', { name: '사용 안내' })
    await expect(card.getByRole('heading', { name: 'ProjectAMO 사용 안내' })).toBeVisible()
    await expect(card.getByRole('note')).toContainText('실제 운항 판단에는 항공기상청 공식 자료')
    await expect(page.locator('.updates-overlay')).toHaveCount(0)
    await card.getByRole('button', { name: '안내 시작' }).click()
    // 첫 단계는 사이드바 — 접고 펴는 방법을 알려 준다.
    await expect(page.getByRole('dialog', { name: '사용 안내' })).toContainText('사이드바를 접고 펼 수 있습니다')
    await page.getByRole('dialog', { name: '사용 안내' }).getByRole('button', { name: '다음' }).click()
    // 발표된 것이 없으니 같은 자리에 예시 배지를 띄우고 강조한다.
    await expect(page.locator('[data-tour-demo="advisory"]')).toBeVisible()
    await expect(page.getByRole('dialog', { name: '사용 안내' })).toContainText('예시로 표시합니다')
    await page.keyboard.press('Escape')
    await expect(page.locator('.tour-root')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('amo.tour.v1.done'))).toBe('1')
  })
})
