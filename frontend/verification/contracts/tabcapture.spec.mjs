// ponytail: throwaway capture spec for RKSS→RKPC tab screenshots. Delete after review.
import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'

const OUT = '../artifacts/tab-capture'

test.describe('tabcapture', () => {
  test('captures alternate-route and alternate-altitude tabs for RKSS-RKPC', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'capture is desktop-only')

    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    })
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()

    await page.getByRole('tab', { name: 'IFR', exact: true }).click()
    await page.getByRole('button', { name: '출발 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: '도착 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKPC$/ }).click()

    await page.getByRole('textbox', { name: /en-route 경로|예: OSPAT/ }).fill('SEL')
    await page.getByRole('button', { name: '경로 적용', exact: true }).click()
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
    await page.screenshot({ path: `${OUT}/1-route-apply.png`, fullPage: true })

    // Tab 2 — 대안경로
    await page.getByRole('button', { name: '경로비교로', exact: true }).click()
    await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${OUT}/2-alternate-routes.png`, fullPage: true })

    // 대안 경로 카드 실제 렌더 확인용 — "우회안 만들기"로 경로 A/B 생성.
    await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
    await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
    await expect(page.locator('.rb-alternative-card').nth(1)).toBeVisible()
    await page.screenshot({ path: `${OUT}/2b-alternate-route-cards.png`, fullPage: true })

    // Tab 3 — 대안고도 (우회안 생성 시 대안이 선택 상태라 버튼 라벨이 달라짐)
    await page.getByRole('button', { name: /경로로 고도 비교|우회안으로 고도 비교/ }).click()
    await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
    await page.getByRole('button', { name: '고도 비교', exact: true }).click()
    await expect(page.getByRole('button', { name: /^FL90/ })).toBeVisible()
    await page.screenshot({ path: `${OUT}/3-alternate-altitudes.png`, fullPage: true })

    await page.getByRole('button', { name: /^FL90/ }).click()
    await page.screenshot({ path: `${OUT}/4-altitude-selected.png`, fullPage: true })
  })
})
