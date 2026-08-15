// ponytail: throwaway capture spec for RKSS→RKPC tab screenshots. Delete after review.
import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const OUT = '../artifacts/tab-capture'

test.describe('tabcapture', () => {
  test('captures alternate-route and alternate-altitude tabs for RKSS-RKPC', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'capture is desktop-only')

    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()

    await page.getByRole('tab', { name: 'IFR', exact: true }).click()
    await page.getByRole('button', { name: '출발 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: '도착 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKPC$/ }).click()

    // 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다.
    await enterRouteTokens(page, ['SEL'])
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

  test('diagnose route-design-line colors on the map for base/A/B', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'debug-only, desktop')

    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    await page.getByRole('tab', { name: 'IFR', exact: true }).click()
    await page.getByRole('button', { name: '출발 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: '도착 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKPC$/ }).click()
    // 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다.
    await enterRouteTokens(page, ['SEL'])
    await page.getByRole('button', { name: '경로비교로', exact: true }).click()
    await page.getByText('기본 경로', { exact: true }).waitFor()

    await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
    await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
    await page.locator('.rb-alternative-card').nth(1).waitFor()

    // 경로 B(두 번째 대안) 선택
    await page.locator('.rb-alternative-card').nth(1).click()
    await page.waitForTimeout(300)

    const dump = await page.evaluate(() => {
      const map = window.__map
      if (!map) return { error: 'window.__map not found' }
      const applied = map.getSource('briefing-route-applied')?._data
      const baseline = map.getSource('briefing-route-baseline')?._data
      const summarize = (fc) => (fc?.features ?? []).map((f) => ({ role: f.properties?.role, designId: f.properties?.designId, selected: f.properties?.selected, color: f.properties?.color }))
      return { applied: summarize(applied), baseline: summarize(baseline) }
    })
    console.log('MAP SOURCE DUMP:', JSON.stringify(dump, null, 2))

    await page.screenshot({ path: `${OUT}/color-diagnosis.png`, fullPage: true })
  })
})
