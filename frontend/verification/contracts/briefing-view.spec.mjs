import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function createBriefing(page) {
  await installRouteBriefingFixtures(page)
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
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

  test('저촉 배너가 내용·구간·고도를 보여주고 위치 미확인을 분리한다', async ({ page }) => {
    await createBriefing(page)

    // 같은 요약문이 ⑤ 섹션의 NotamCell에도 렌더된다 — 범위를 좁히지 않으면
    // Playwright가 strict mode 위반으로 죽는다(실패가 아니라 오류로 끝나 원인이 안 보인다).
    const banner = page.locator('.bv-banner-notam')
    await expect(banner.getByText('불꽃놀이 실시 — 해당 공역 진입 금지', { exact: true })).toBeVisible()
    await expect(banner.getByText('출발 후 12–18NM · SFC–200FT AGL', { exact: true })).toBeVisible()

    // 위치 미확인은 빨간 저촉과 섞이지 않는다
    const grey = page.locator('.bv-banner-unresolved')
    await expect(grey.getByText('위치를 확인하지 못한 제한 — 직접 확인 필요', { exact: true })).toBeVisible()
    await expect(grey.getByText('구역 좌표 없음', { exact: true })).toBeVisible()

    // 누르면 ⑤ 섹션으로 이동한다
    await page.getByRole('button', { name: /불꽃놀이 실시/ }).click()
    await expect(page.getByRole('heading', { name: '⑤ 경로·공항 NOTAM', exact: true })).toBeInViewport()
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
