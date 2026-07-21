import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'

async function createBriefing(page) {
  await installRouteBriefingFixtures(page)
  await page.addInitScript(() => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
  await page.getByRole('button', { name: '출발 공항 선택', exact: true }).click()
  await page.getByRole('button', { name: /RKSS$/ }).click()
  await page.getByRole('button', { name: '도착 공항 선택', exact: true }).click()
  await page.getByRole('button', { name: /RKPK$/ }).click()
  await page.getByRole('textbox', { name: /en-route 경로|예: OSPAT/ }).fill('SEL')
  await page.getByRole('button', { name: '경로 적용', exact: true }).click()
  await page.getByRole('button', { name: '경로비교로', exact: true }).click()
  await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()
  await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: '고도 비교', exact: true }).click()
  await page.getByRole('button', { name: /^FL90/ }).click()
  await page.getByRole('button', { name: '연직단면도 숨기고 지도 보기', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 준비로', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 생성', exact: true }).click()
}

test.describe('briefing-view', () => {
  test('renders route weather legs as a table or mobile cards', async ({ page }, testInfo) => {
    await createBriefing(page)

    await expect(page.getByText('경로 구간 기상 브리핑', { exact: true })).toBeVisible()
    await expect(page.getByText('FIXA → FIXB', { exact: true })).toBeVisible()
    await expect(page.getByText('FIXB → FIXC', { exact: true })).toBeVisible()
    await expect(page.getByText(/NOTAM 판정 불가/)).toBeVisible()
    await expect(page.getByText('ETA 또는 연료 계산은 포함하지 않습니다.', { exact: true })).toBeVisible()
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByTestId('route-weather-leg-card')).toHaveCount(2)
    } else {
      await expect(page.getByRole('columnheader', { name: '위험기상', exact: true })).toBeVisible()
    }
  })

  test('switches between full briefing and map-together views for a local navdata route', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'the mobile briefing sheet has no full/map-together view control')
    await createBriefing(page)

    await expect(page.getByRole('heading', { name: 'RKSS → RKPK', exact: true })).toBeVisible()
    const fullView = page.getByRole('button', { name: '전체 보기', exact: true })
    await fullView.click()
    await expect(page.getByRole('button', { name: '지도와 함께 보기', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '지도와 함께 보기', exact: true }).click()
    await expect(fullView).toBeVisible()
  })
})
