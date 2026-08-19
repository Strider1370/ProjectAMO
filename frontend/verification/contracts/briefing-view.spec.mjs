import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function createBriefing(page) {
  const requests = await installRouteBriefingFixtures(page)
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // 진입점이 화면 크기마다 다르다: 데스크톱은 사이드바 "비행 전 브리핑",
  // 모바일은 사이드바가 숨으므로 하단 "주요 작업" 탭의 "브리핑".
  const desktopEntry = page.getByRole('button', { name: '비행 전 브리핑', exact: true })
  const mobileEntry = page.getByRole('navigation', { name: '주요 작업' })
    .getByRole('button', { name: '브리핑', exact: true })
  await desktopEntry.or(mobileEntry).first().click()
  // 모바일 패널은 라벨이 짧다("출발 선택") — 데스크톱은 "출발 공항 선택".
  await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
  await page.getByRole('button', { name: /RKSS$/ }).click()
  await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
  await page.getByRole('button', { name: /RKPK$/ }).click()
  // 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다.
  await enterRouteTokens(page, ['SEL'])
  await page.getByRole('button', { name: '경로비교로', exact: true }).click()
  await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()
  await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: '고도 비교', exact: true }).click()
  // 고도 비교는 선택 사항이다. 비교 카드가 뜨면 고도를 고르고, 안 뜨면(모바일에서
  // 관측되는 상태) 그대로 다음 단계로 간다 — 브리핑 생성 자체는 순항고도만 있으면 된다.
  const flOption = page.getByRole('button', { name: /^FL90/ })
  const comparisonOptional = page.getByText('고도 비교는 선택 사항입니다.', { exact: false })
  await flOption.or(comparisonOptional).first().waitFor()
  if (await flOption.count()) {
    await flOption.click()
    await page.getByRole('button', { name: '연직단면도 숨기고 지도 보기', exact: true }).click()
  }
  await page.getByRole('button', { name: '브리핑 준비로', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 생성', exact: true }).click()
  return requests
}

test.describe('briefing-view', () => {
  test('keeps NAVLOG in the desktop table layout on iPad landscape', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-landscape', 'iPad 가로 전용 NAVLOG 레이아웃')
    await createBriefing(page)

    const navlog = page.getByRole('region', { name: 'NAVLOG', exact: true })
    const table = navlog.locator('.bv-main-navlog-table')
    await expect(table).toHaveCSS('display', 'table')
    await expect(table.locator('thead')).toHaveCSS('display', 'table-header-group')
    await expect(table.locator('.bv-leg-row').first()).toHaveCSS('display', 'table-row')
    const [fromCell, legCell, toCell, sidSummary, arrivalSummary] = await Promise.all([
      page.getByRole('row', { name: '웨이포인트 FIXA', exact: true }).getByRole('cell').boundingBox(),
      page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true }).getByRole('cell').first().boundingBox(),
      page.getByRole('row', { name: '웨이포인트 FIXB', exact: true }).getByRole('cell').boundingBox(),
      navlog.getByRole('row', { name: '절차 FIXTURE1A 요약', exact: true }).boundingBox(),
      navlog.getByRole('row', { name: '절차 FIXTURE2P · ILS18 요약', exact: true }).boundingBox(),
    ])
    // 엇갈린 병합: 출발 웨이포인트 중간에서 구간 셀이 시작하고, 그 구간 셀 중간에서 다음 웨이포인트가 시작한다.
    expect(fromCell.y).toBeLessThan(legCell.y)
    expect(legCell.y).toBeLessThan(toCell.y)
    expect(Math.abs((fromCell.y + fromCell.height) - toCell.y)).toBeLessThanOrEqual(1)
    expect(legCell.y + legCell.height).toBeGreaterThan(toCell.y)
    expect(fromCell.height).toBeGreaterThanOrEqual(44)
    expect(fromCell.height).toBeLessThanOrEqual(56)
    expect(Math.abs(sidSummary.height - legCell.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(arrivalSummary.height - legCell.height)).toBeLessThanOrEqual(1)
    const fromCellLocator = page.getByRole('row', { name: '웨이포인트 FIXA', exact: true }).getByRole('cell')
    const legCellLocator = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true }).getByRole('cell').first()
    const procedureCellLocator = navlog.getByRole('row', { name: '절차 FIXTURE1A 요약', exact: true }).getByRole('cell').first()
    await expect(fromCellLocator).toHaveCSS('font-size', '14px')
    await expect(fromCellLocator).toHaveCSS('vertical-align', 'middle')
    await expect(legCellLocator).toHaveCSS('font-size', '14px')
    await expect(legCellLocator).toHaveCSS('vertical-align', 'middle')
    await expect(procedureCellLocator).toHaveCSS('font-size', '14px')
    await expect(procedureCellLocator).toHaveCSS('vertical-align', 'middle')

    await expect(procedureCellLocator.getByRole('button')).toHaveCount(0)
  })

  test('renders route weather legs as a table or mobile cards', async ({ page }) => {
    const requests = await createBriefing(page)

    await expect(page.getByRole('heading', { name: 'NAVLOG', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '연직단면도', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: '웨이포인트 FIXA', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: '웨이포인트 FIXB', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: 'FIXB에서 FIXC까지 구간', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: '웨이포인트 FIXC', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: '웨이포인트 FIXA', exact: true }).getByRole('cell')).toHaveAttribute('rowspan', '2')
    const firstLegRow = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })
    await expect(firstLegRow.getByRole('cell').first()).toHaveAttribute('rowspan', '2')
    await expect(page.getByRole('row', { name: '웨이포인트 FIXA', exact: true }).locator('.bv-leg-connector')).toHaveCount(0)
    await expect(firstLegRow.locator('.bv-leg-direction')).toBeVisible()
    await expect(firstLegRow.locator('.bv-leg-direction')).toHaveCSS('border-left-style', 'solid')
    await expect(page.getByText(/NOTAM 판정 불가/)).toBeVisible()
    await expect(page.getByText('ETA 또는 연료 계산은 포함하지 않습니다.', { exact: true })).toBeVisible()
    // 표/카드 전환은 뷰포트가 아니라 패널 컨테이너 폭(@container briefing)이 정한다.
    // 데스크톱에서도 패널이 좁으면 카드로 떨어지므로 프로젝트 이름으로 분기하지 않는다.
    await expect(page.getByTestId('route-weather-leg-card')).toHaveCount(2)
    await expect(page.locator('.bv-main-navlog-table [data-label="위험기상"]').first()).toBeVisible()

    // 연직단면도는 기온·습도·바람·SIGMET/AIRMET이 켜진 채로 열린다.
    await expect(page.locator('.cs-toggle').first()).toBeVisible()
    for (const label of ['기온', '습도', '바람', 'SIGMET/AIRMET']) {
      await expect(page.locator('.cs-toggle[aria-pressed="true"]').filter({ hasText: label }).first()).toBeVisible()
    }
    expect(requests.crossSection.bodies.length).toBeGreaterThan(0)
    for (const body of requests.crossSection.bodies) {
      expect(Date.parse(body.etd)).not.toBeNaN()
    }
  })

  test('refreshes the chart and NAVLOG together when the forecast hour changes', async ({ page }) => {
    const requests = await createBriefing(page)
    const profile = page.getByRole('region', { name: '연직단면도', exact: true })
    const firstLeg = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })

    await expect(firstLeg.getByRole('cell', { name: '풍향/풍속 자료 없음', exact: true })).toBeVisible()
    await profile.getByRole('button', { name: '다음 예보시간', exact: true }).click()

    await expect(profile.getByRole('button', { name: '다음 예보시간', exact: true })).toBeDisabled()
    await expect(firstLeg.getByText('250/30kt', { exact: true })).toBeVisible()
    await expect(firstLeg.getByText('AIP 고도 제약', { exact: true })).toHaveCount(0)
    expect(requests.nwpTimeRefresh.bodies).toHaveLength(1)
    expect(requests.nwpTimeRefresh.bodies[0].hf).toBe(3)
  })

  test('procedure summaries stay inline and merge STAR with IAP without detail controls', async ({ page }) => {
    const duplicateKeyWarnings = []
    page.on('console', (message) => {
      if (message.text().includes('same key')) duplicateKeyWarnings.push(message.text())
    })
    await createBriefing(page)
    const navlog = page.getByRole('region', { name: 'NAVLOG', exact: true })
    const summaries = navlog.getByTestId('procedure-navlog-summary')
    await expect(summaries).toHaveCount(2)
    await expect(summaries.nth(0)).toContainText('FIXTURE1A')
    await expect(summaries.nth(1)).toContainText('FIXTURE2P')
    await expect(summaries.nth(1)).toContainText('ILS18')
    await expect(summaries.nth(0)).not.toContainText('SID')
    await expect(summaries.nth(1)).not.toContainText('STAR')
    await expect(summaries.nth(1)).not.toContainText('IAP')
    await expect(summaries.nth(0)).toContainText('24 NM')
    await expect(summaries.nth(0).getByText('착빙 2')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('12NM')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('난류 중')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('7NM')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('SIGMET_TS_ALPHA')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('SIGMET_ICE_BRAVO')).toHaveCount(1)
    await expect(summaries.nth(1)).toContainText('22 NM')
    await expect(summaries.nth(1).getByText('착빙 2')).toHaveCount(1)
    await expect(summaries.nth(1).getByText('7NM')).toHaveCount(1)
    await expect(summaries.nth(1).getByText('난류 중')).toHaveCount(1)
    await expect(summaries.nth(1).getByText('3NM')).toHaveCount(1)
    expect(duplicateKeyWarnings).toEqual([])
    await expect(navlog.locator('.procedure-navlog-groups')).toHaveCount(0)

    await expect(summaries.getByRole('button')).toHaveCount(0)
    await expect(navlog.locator('.bv-procedure-direction')).toHaveCount(0)
    await expect(navlog.getByTestId('procedure-navlog-detail-leg')).toHaveCount(0)
    await expect(navlog.getByRole('row', { name: '웨이포인트 IAF18', exact: true })).toHaveCount(0)
    await expect(navlog.getByRole('row', { name: '웨이포인트 RKSS', exact: true })).toHaveCount(1)
    await expect(navlog.getByRole('row', { name: '웨이포인트 FIXA', exact: true })).toHaveCount(1)
  })

  // 모바일 시트에는 헤더 닫기 버튼이 없고(그래버 스와이프가 그 역할을 겸함) 브리핑은
  // 경로 패널 위에 뜨는 별도 화면이라 패널 푸터의 "이전 단계"도 물려받지 않는다.
  // 그래서 경로를 고치러 돌아갈 길이 화면에서 사라졌던 회귀를 고정한다.
  test('모바일 브리핑에서 이전 단계로 경로 패널에 돌아간다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '모바일 시트 전용 출구')
    await createBriefing(page)

    // 경로 패널의 "이전 단계"가 아래에 남아 있어 범위를 좁히지 않으면 strict mode 위반.
    const back = page.locator('.bv-sheet-footer').getByRole('button', { name: '이전 단계', exact: true })
    await expect(back).toBeVisible()
    await back.click()

    // 브리핑이 닫히고 경로 패널(브리핑 준비 단계)로 복귀한다 — 데스크톱 "닫기"와 같은 동작.
    await expect(page.getByRole('heading', { name: 'NAVLOG', exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: '브리핑 생성', exact: true })).toBeVisible()
  })

  test('mobile fullscreen vertical profile keeps controls and layer state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '모바일 전체화면 단면도 전용')
    await createBriefing(page)

    await page.getByRole('button', { name: '단면도 크게 열기', exact: true }).click()
    const fullscreen = page.getByRole('dialog', { name: '단면도 전체화면', exact: true })
    await expect(fullscreen.getByRole('button', { name: '닫기', exact: true })).toBeVisible()
    await expect(fullscreen.getByRole('button', { name: '이전 예보시간', exact: true })).toBeVisible()
    await expect(fullscreen.getByRole('button', { name: '다음 예보시간', exact: true })).toBeVisible()
    for (const label of ['기온', '습도', '구름', '착빙', '바람', '난류', 'SIGMET/AIRMET']) {
      await expect(fullscreen.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    const temperature = fullscreen.getByRole('button', { name: '기온', exact: true })
    await temperature.click()
    await expect(temperature).toHaveAttribute('aria-pressed', 'false')
    await fullscreen.getByRole('button', { name: '닫기', exact: true }).click()
    await expect(page.locator('.bv-leg-briefing').getByRole('button', { name: '기온', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('shows two outline-only KIM CLD cloud regions and toggles them', async ({ page }, testInfo) => {
    await createBriefing(page)
    const profile = page.getByRole('region', { name: '연직단면도', exact: true })
    const cloudToggle = profile.getByRole('button', { name: '구름', exact: true })
    await expect(cloudToggle).toHaveAttribute('aria-pressed', 'true')
    const contours = profile.getByTestId('kim-cloud-contours')
    await expect(contours).toBeVisible()
    await expect(contours.locator('path.cs-cloud-contour')).toHaveCount(2)
    await expect(profile.getByText('KIM CLD ≥ 0.6 윤곽 · 일부 결측', { exact: true })).toBeVisible()
    expect(await contours.locator('path.cs-cloud-contour').evaluateAll((paths) => paths.every((path) => path.getAttribute('fill') === 'none' && getComputedStyle(path).fill === 'none'))).toBe(true)
    await cloudToggle.click(); await expect(profile.getByTestId('kim-cloud-contours')).toHaveCount(0)
    await cloudToggle.click(); await expect(profile.getByTestId('kim-cloud-contours')).toBeVisible()
    const screenshotTarget = testInfo.project.name === 'mobile'
      ? await (async () => {
          await page.getByRole('button', { name: '단면도 크게 열기', exact: true }).click()
          const fullscreen = page.getByRole('dialog', { name: '단면도 전체화면', exact: true })
          await expect(fullscreen.getByTestId('kim-cloud-contours')).toBeVisible()
          const fullscreenContours = fullscreen.locator('path.cs-cloud-contour')
          const plotScroll = fullscreen.locator('.vertical-profile-plot-scroll')
          await plotScroll.evaluate((element) => { element.scrollLeft = 0 })
          await expect(fullscreenContours.first()).toBeInViewport()
          return fullscreen.locator('.vertical-profile-chart')
        })()
      : profile.locator('.vertical-profile-chart')
    await expect(screenshotTarget).toHaveScreenshot('kim-cld-cloud-contours.png', { animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
