import { test, expect } from '../fixtures.mjs'
import { createBriefing } from '../briefing-flow.mjs'

// 데스크톱 노선 섹션의 단면도는 지도형 독과 같은 압축 단면도(위험 막대 아래)다. 모바일은 기존 인라인 단면도.
const documentProfile = (page) => page.locator('.mb-dock.is-document').getByRole('group', { name: '연직단면도', exact: true })

test.describe('briefing-view', () => {
  test('profile-advisory-symbols show wind values, missing-symbol labels and thicker boundaries', async ({ page }, testInfo) => {
    const now = Date.now()
    const geometry = { type: 'Polygon', coordinates: [[[125, 33], [130, 33], [130, 39], [125, 39], [125, 33]]] }
    const advisory = (code, lower, upper) => ({
      id: `profile-${code}`, phenomenon_code: code, geometry,
      valid_from: new Date(now - 3600000).toISOString(), valid_to: new Date(now + 3600000).toISOString(),
      altitude: { lower_fl: lower, upper_fl: upper },
    })
    await page.route('**/api/sigmet', route => route.fulfill({ json: { items: [advisory('OBSC_TS', 80, 100)] } }))
    await page.route('**/api/airmet', route => route.fulfill({ json: { items: [
      { ...advisory('SFC_WIND', 0, 30), surface_wind: { direction_deg: 270, speed_kt: 30 }, motion: { speed_kt: 0 } },
      advisory('MT_OBSC', 30, 50), advisory('MOD_ICE', 50, 70),
    ] } }))
    // 이미지 로드에 실패해도 현상명으로 표시한다.
    await page.route('**/icon_AIRMET/MOD_ICE.png', route => route.abort())
    await createBriefing(page)
    let profile = testInfo.project.name === 'mobile' ? page.getByRole('region', { name: '연직단면도', exact: true }) : documentProfile(page)
    if (testInfo.project.name === 'mobile') {
      await profile.getByRole('button', { name: '단면도 크게 열기', exact: true }).click()
      profile = page.getByRole('dialog', { name: '단면도 전체화면', exact: true })
      await profile.locator('.vpc-operational-controls > summary').click()
    }
    await profile.locator('.vertical-profile-chart').scrollIntoViewIfNeeded()
    const symbols = profile.getByTestId('profile-advisory-symbol')
    const wind = symbols.filter({ has: page.locator('text').filter({ hasText: /^270\/30KT$/ }) })
    await expect(wind).toBeVisible()
    await expect(wind.locator('image')).toHaveAttribute('href', /SFC_WIND\.png$/)
    await expect(symbols.locator('text').filter({ hasText: '가림뇌우' })).toBeVisible()
    const mountain = profile.locator('[data-phenomenon="MT_OBSC"]')
    await expect(mountain.locator('image')).toHaveAttribute('href', /MTOBSC\.png$/)
    const icing = profile.locator('[data-phenomenon="MOD_ICE"]')
    await icing.scrollIntoViewIfNeeded()
    // 아이콘 요청 실패(abort)가 늦게 돌아오면 글자 대체가 늦다 — 기다림을 넉넉히.
    await expect(icing.locator('text')).toHaveText('착빙', { timeout: 15000 })
    await expect(icing.locator('image')).toHaveCount(0)
    const boundaries = profile.getByTestId('profile-advisory-boundary')
    await expect(boundaries).toHaveCount(4)
    expect(await boundaries.evaluateAll(nodes => nodes.every(node =>
      getComputedStyle(node).strokeWidth === '2.5px' && getComputedStyle(node).opacity === '1',
    ))).toBe(true)
    await profile.locator('.vertical-profile-chart').screenshot({ path: testInfo.outputPath('profile-advisory-symbols.png') })
    if (testInfo.project.name !== 'mobile') await profile.locator('.vpc-document-settings > summary').click()
    await profile.getByRole('button', { name: 'SIGMET/AIRMET', exact: true }).click()
    await expect(profile.getByTestId('profile-advisory-symbol')).toHaveCount(0)
    await expect(profile.getByTestId('profile-advisory-boundary')).toHaveCount(0)
  })

  test('keeps NAVLOG in the desktop table layout on iPad landscape', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-landscape', 'iPad 가로 전용 NAVLOG 레이아웃')
    await createBriefing(page)

    const navlog = page.getByRole('region', { name: 'NAVLOG', exact: true })
    const table = navlog.locator('.bv-main-navlog-table')
    await expect(table).toHaveCSS('display', 'table')
    await expect(table.locator('thead')).toHaveCSS('display', 'table-header-group')
    await expect(table.locator('.bv-leg-row').first()).toHaveCSS('display', 'table-row')
    // 구간 하나 = 한 줄: 지점 경계 줄이 없고, 절차 요약 줄도 구간 줄과 같은 높이다.
    await expect(navlog.getByRole('row', { name: /^웨이포인트 / })).toHaveCount(0)
    const [legCell, sidSummary, arrivalSummary] = await Promise.all([
      page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true }).getByRole('cell').first().boundingBox(),
      navlog.getByRole('row', { name: '절차 FIXTURE1A 요약', exact: true }).boundingBox(),
      navlog.getByRole('row', { name: '절차 FIXTURE2P · ILS18 요약', exact: true }).boundingBox(),
    ])
    expect(legCell.height).toBeLessThanOrEqual(40)
    // 절차 줄은 위험기상 칩이 여럿이면 줄을 바꿔 높아질 수 있다 — 구간 줄보다 낮지만 않으면 된다.
    expect(sidSummary.height).toBeGreaterThanOrEqual(legCell.height - 1)
    expect(arrivalSummary.height).toBeGreaterThanOrEqual(legCell.height - 1)
    const legCellLocator = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true }).getByRole('cell').first()
    const procedureCellLocator = navlog.getByRole('row', { name: '절차 FIXTURE1A 요약', exact: true }).getByRole('cell').first()
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
    await expect(page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: 'FIXB에서 FIXC까지 구간', exact: true })).toBeVisible()
    // 구간 하나 = 한 줄 — 지점 경계 줄·병합 칸·위아래로 쌓은 값이 없다.
    await expect(page.getByRole('row', { name: /^웨이포인트 / })).toHaveCount(0)
    const firstLegRow = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })
    await expect(firstLegRow.locator('[rowspan]')).toHaveCount(0)
    await expect(firstLegRow.locator('.bv-leg-stack')).toHaveCount(0)
    await expect(firstLegRow.locator('[data-label="바람성분"]')).toBeVisible()
    // 위험기상 칸은 기상만 싣는다 — NOTAM은 경로·공항 NOTAM 섹션 몫이다.
    await expect(page.locator('.bv-main-navlog-table [data-label="위험기상"]').filter({ hasText: /NOTAM/ })).toHaveCount(0)
    await expect(page.getByText('ETA 또는 연료 계산은 포함하지 않습니다.', { exact: true })).toBeVisible()
    // 표/카드 전환은 뷰포트가 아니라 패널 컨테이너 폭(@container briefing)이 정한다.
    // 데스크톱에서도 패널이 좁으면 카드로 떨어지므로 프로젝트 이름으로 분기하지 않는다.
    await expect(page.getByTestId('route-weather-leg-card')).toHaveCount(2)
    await expect(page.locator('.bv-main-navlog-table [data-label="위험기상"]').first()).toBeVisible()

    // 연직단면도는 착빙·등온선·바람·권계면·제트·SIGMET/AIRMET이 켜진 채로 열린다(구름은 꺼진 채 — BriefingView 기본값).
    // 10-16 단면도 통합 이후 레이어 버튼은 `.vpc-layer-controls`의 aria-pressed 버튼이다(예전 `.cs-toggle`).
    if (await page.locator('.vpc-document-settings').count()) await page.locator('.vpc-document-settings > summary').click()
    const layerButtons = page.getByRole('group', { name: '기상 레이어' }).first().getByRole('button')
    await expect(layerButtons.first()).toBeVisible()
    for (const label of ['착빙', '등온선', '바람깃', '등풍속선', '권계면·제트', 'SIGMET/AIRMET']) {
      await expect(layerButtons.filter({ hasText: label }).first()).toHaveAttribute('aria-pressed', 'true')
    }
    expect(requests.crossSection.bodies.length).toBeGreaterThan(0)
    for (const body of requests.crossSection.bodies) {
      expect(Date.parse(body.etd)).not.toBeNaN()
    }
  })

  // 데스크톱 노선 섹션: 위험 막대 가로축이 아래 압축 단면도 그림과 같은 세로선에 선다.
  test('aligns the document hazard ribbon with the compact profile plot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '모바일은 기존 인라인 단면도')
    await createBriefing(page)
    const dock = page.locator('.mb-dock.is-document')
    await dock.getByRole('button', { name: '전체', exact: true }).click()
    await expect(dock.getByRole('group', { name: '경로상 위험 막대' })).toBeVisible()
    await dock.scrollIntoViewIfNeeded()
    await expect.poll(() => dock.evaluate((root) => {
      const track = root.querySelector('.mb-track').getBoundingClientRect()
      const svg = root.querySelector('.mb-profile-body .vertical-profile-plot-svg')
      const rect = svg.getBoundingClientRect()
      return [Math.abs(Math.round(track.left - (rect.left + Number(svg.dataset.plotLeft)))), Math.abs(Math.round(track.right - (rect.left + Number(svg.dataset.plotRight))))]
    })).toEqual([0, 0])
    // 그림이 납작해지지 않는다(범례가 머리 줄에서 세로로 접히던 문제).
    expect((await dock.locator('.vertical-profile-plot-svg').boundingBox()).height).toBeGreaterThanOrEqual(180)
  })

  test('refreshes the chart and NAVLOG together when the forecast hour changes', async ({ page }) => {
    const requests = await createBriefing(page)
    const profile = documentProfile(page).or(page.getByRole('region', { name: '연직단면도', exact: true }))
    const firstLeg = page.getByRole('row', { name: 'FIXA에서 FIXB까지 구간', exact: true })

    // 풍향/풍속 칸 — 예보시간 전에는 벡터가 비어 있다.
    await expect(firstLeg.locator('[data-label="풍향/풍속"] [aria-label="자료 없음"]')).toBeVisible()
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
    await expect(summaries.nth(0).locator('[data-label="거리"]')).toHaveText('24')
    // 위험기상 칩은 위험 막대와 같은 MOD 이상 짧은 표기(착빙 MOD · 난류 MOD) + 걸린 발표.
    await expect(summaries.nth(0).getByText('착빙 MOD', { exact: true })).toHaveCount(1)
    await expect(summaries.nth(0).getByText('난류 MOD', { exact: true })).toHaveCount(1)
    await expect(summaries.nth(0).getByText('SIGMET_TS_ALPHA')).toHaveCount(1)
    await expect(summaries.nth(0).getByText('SIGMET_ICE_BRAVO')).toHaveCount(1)
    await expect(summaries.nth(1).locator('[data-label="거리"]')).toHaveText('22')
    await expect(summaries.nth(1).getByText('착빙 MOD', { exact: true })).toHaveCount(1)
    await expect(summaries.nth(1).getByText('난류 MOD', { exact: true })).toHaveCount(1)
    expect(duplicateKeyWarnings).toEqual([])
    await expect(navlog.locator('.procedure-navlog-groups')).toHaveCount(0)

    await expect(summaries.getByRole('button')).toHaveCount(0)
    await expect(navlog.locator('.bv-procedure-direction')).toHaveCount(0)
    await expect(navlog.getByTestId('procedure-navlog-detail-leg')).toHaveCount(0)
    await expect(navlog.getByRole('row', { name: /^웨이포인트 / })).toHaveCount(0)
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
    await fullscreen.locator('.vpc-operational-controls > summary').click()
    await expect(fullscreen.getByRole('button', { name: '닫기', exact: true })).toBeVisible()
    await expect(fullscreen.getByRole('button', { name: '이전 예보시간', exact: true })).toBeVisible()
    await expect(fullscreen.getByRole('button', { name: '다음 예보시간', exact: true })).toBeVisible()
    for (const label of ['구름', '착빙', '등온선', '바람깃', '등풍속선', '권계면·제트', '난류', 'SIGMET/AIRMET']) {
      await expect(fullscreen.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    const temperature = fullscreen.getByRole('button', { name: '등온선', exact: true })
    await temperature.click()
    await expect(temperature).toHaveAttribute('aria-pressed', 'false')
    await fullscreen.getByRole('button', { name: '닫기', exact: true }).click()
    await page.locator('.bv-leg-briefing .vpc-operational-controls').evaluate(el => { el.open = true })
    await expect(page.locator('.bv-leg-briefing').getByRole('button', { name: '등온선', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('shows two outline-only KIM CLD cloud regions and toggles them', async ({ page }, testInfo) => {
    await createBriefing(page)
    const mobile = testInfo.project.name === 'mobile'
    const profile = mobile ? page.getByRole('region', { name: '연직단면도', exact: true }) : documentProfile(page)
    // 모델 구름량 윤곽은 '구름·착빙 ▾' 메뉴의 하위 항목이다(기본 꺼짐). 압축 단면도는 레이어 줄에 바로 있다.
    if (mobile) await profile.locator('.vpc-operational-controls').evaluate(el => { el.open = true })
    else await profile.locator('.vpc-document-settings > summary').click()
    await profile.locator('.vpc-operational-options > summary').click()
    const cloudToggle = profile.getByRole('checkbox', { name: '모델 구름량 윤곽', exact: true })
    await expect(cloudToggle).not.toBeChecked()
    await cloudToggle.check()
    const contours = profile.getByTestId('kim-cloud-contours')
    await expect(contours).toBeVisible()
    await expect(contours.locator('path.cs-cloud-contour')).toHaveCount(2)
    // 그림 아래 설명 줄은 기존(모바일) 단면도에만 있다 — 압축 단면도는 메타 줄을 숨긴다.
    if (mobile) await expect(profile.getByText('KIM CLD ≥ 0.6 윤곽 · 일부 결측', { exact: true })).toBeVisible()
    expect(await contours.locator('path.cs-cloud-contour').evaluateAll((paths) => paths.every((path) => path.getAttribute('fill') === 'none' && getComputedStyle(path).fill === 'none'))).toBe(true)
    await cloudToggle.uncheck(); await expect(profile.getByTestId('kim-cloud-contours')).toHaveCount(0)
    await cloudToggle.check(); await expect(profile.getByTestId('kim-cloud-contours')).toBeVisible()
    await page.keyboard.press('Escape')
    // 압축 단면도의 옵션 창은 그림 위로 펼쳐진다 — 찍기 전에 닫는다.
    if (!mobile) await profile.locator('.vpc-operational-options > summary').click()
    if (!mobile) await profile.getByRole('button', { name: '전체', exact: true }).click()
    const screenshotTarget = mobile
      ? await (async () => {
          await page.getByRole('button', { name: '단면도 크게 열기', exact: true }).click()
          const fullscreen = page.getByRole('dialog', { name: '단면도 전체화면', exact: true })
    await fullscreen.locator('.vpc-operational-controls > summary').click()
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
    await expect(page.getByRole('heading', { name: '경로·공항 NOTAM', exact: true })).toBeInViewport()
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


test('briefing-view document profile stays readable on iPad and preserves fullscreen settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-landscape', '아이패드 가로 문서형 단면도')
  await createBriefing(page)
  const profile = documentProfile(page)
  for (const [width, height] of [[1194, 834], [1024, 768]]) {
    await page.setViewportSize({ width, height })
    await profile.scrollIntoViewIfNeeded()
    const plot = profile.locator('.vertical-profile-plot-svg')
    await expect.poll(async () => (await plot.boundingBox()).height).toBeGreaterThanOrEqual(280)
    await expect(profile.getByRole('button', { name: '등온선', exact: true })).toBeHidden()
    await profile.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), style: '.bv-navwrap { visibility: hidden !important; }' })
    await profile.evaluate(el => {
      const scroller = el.closest('.bv-scroll')
      const nav = scroller.querySelector('.bv-navwrap')
      scroller.scrollTop += el.getBoundingClientRect().top - nav.getBoundingClientRect().bottom - 12
    })
    const scroller = profile.locator('.vertical-profile-plot-scroll')
    expect(await scroller.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100)
    const headerBefore = await profile.locator('.vpc-document-header').boundingBox()
    await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth })
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(100)
    const axis = profile.locator('.vertical-profile-axis-overlay')
    await expect(axis).toBeVisible()
    const axisBefore = await axis.boundingBox()
    expect(axisBefore.x).toBe((await scroller.boundingBox()).x)
    await axis.screenshot({ path: testInfo.outputPath(`axis-${width}.png`) })
    const headerAfter = await profile.locator('.vpc-document-header').boundingBox()
    expect(headerAfter.x).toBe(headerBefore.x)
    await page.screenshot({ path: testInfo.outputPath(`scrolled-${width}.png`) })
    await scroller.evaluate(el => { el.scrollLeft = 0 })
    await page.screenshot({ path: testInfo.outputPath(`document-${width}.png`) })
    expect((await profile.locator('.vertical-profile-plot').boundingBox()).height).toBeGreaterThanOrEqual(280)
    const before = (await plot.boundingBox()).height
    await profile.locator('.vpc-document-settings > summary').click()
    await profile.locator('.vpc-document-key > summary').click()
    await expect(profile.getByRole('button', { name: '등온선', exact: true })).toBeVisible()
    expect((await plot.boundingBox()).height).toBe(before)
    await profile.locator('.vpc-document-settings').scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`) })
    await profile.locator('.vpc-document-settings > summary').click()
    await profile.locator('.vpc-document-key > summary').click()
  }
  await profile.getByRole('button', { name: '전체', exact: true }).click()
  await expect.poll(() => profile.locator('.vertical-profile-plot-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await profile.locator('.vpc-document-settings > summary').click()
  await profile.getByRole('button', { name: '등온선', exact: true }).click()
  const previousTime = await profile.locator('.vpc-time-control strong').innerText()
  await profile.getByRole('button', { name: '다음 예보시간', exact: true }).click()
  await expect(profile.locator('.vpc-time-control strong')).not.toHaveText(previousTime)
  const time = await profile.locator('.vpc-time-control strong').innerText()
  await profile.getByRole('button', { name: '단면도 크게 보기', exact: true }).click()
  const fullscreen = page.getByRole('dialog', { name: '단면도 전체화면', exact: true })
  await expect(fullscreen).toBeVisible()
  await expect(fullscreen.locator('.vpc-time-control strong')).toHaveText(time)
  await fullscreen.locator('.vpc-document-settings > summary').click()
  await expect(fullscreen.getByRole('button', { name: '등온선', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await fullscreen.locator('.vpc-document-settings > summary').click()
  await page.screenshot({ path: testInfo.outputPath('fullscreen-1024.png') })
  await fullscreen.getByRole('button', { name: '단면도 전체화면 닫기' }).click()
  await expect(fullscreen).toHaveCount(0)
  await expect(profile.getByRole('button', { name: '단면도 크게 보기' })).toBeFocused()
  await profile.locator('.vpc-document-settings > summary').click()
  await expect(profile.getByRole('button', { name: '등온선', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(profile.locator('.vpc-time-control strong')).toHaveText(time)
  await profile.getByRole('button', { name: '단면도 크게 보기', exact: true }).click()
  await expect(fullscreen).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(fullscreen).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
