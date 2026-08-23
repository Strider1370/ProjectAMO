import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState, buildTafPayload, buildSnapshotMeta, TAF_HASH } from '../monitoring-fixture.mjs'

test.describe('monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await installMonitoringFixture(page)
  })

  test('opens operations mode and switches to ground mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring uses task tabs instead of dashboard modes')

    await openMonitoringState(page, 'ops')

    const currentClock = page.getByLabel('현재 시각')
    await expect(currentClock).toHaveText(/^\d{4}년 \d+월 \d+일 \(.\) \d{2}:\d{2}$/)
    await expect(currentClock).toHaveCSS('font-size', '28px')
    await page.getByLabel('화면 제어').click()
    const modeTabs = page.getByRole('tablist', { name: '대시보드 모드' })
    await expect(modeTabs).toBeVisible()
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '나가기', exact: true })).toBeVisible()

    const operations = page.getByRole('tab', { name: '운항', exact: true })
    const ground = page.getByRole('tab', { name: '지상', exact: true })
    const settingsButton = page.getByRole('button', { name: '설정', exact: true })
    const exitButton = page.getByRole('button', { name: '나가기', exact: true })
    await expect(operations).toHaveCSS('white-space', 'nowrap')
    await expect(ground).toHaveCSS('white-space', 'nowrap')
    await expect(settingsButton).toHaveCSS('white-space', 'nowrap')
    await expect(exitButton).toHaveCSS('white-space', 'nowrap')
    for (const control of [operations, ground, settingsButton, exitButton]) {
      expect((await control.boundingBox()).width).toBeGreaterThanOrEqual(56)
    }
    await expect(operations).toHaveAttribute('aria-selected', 'true')
    await expect(ground).toHaveAttribute('aria-selected', 'false')

    await ground.click()
    await expect(page).toHaveURL(/\/monitoring\?mode=ground$/)
    await page.getByLabel('화면 제어').click()
    await expect(ground).toHaveAttribute('aria-selected', 'true')
    await expect(operations).toHaveAttribute('aria-selected', 'false')
  })

  test('ground current weather prioritizes METAR SHRA over BKN cloud coverage', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')

    // 나중에 등록한 route가 먼저 매치된다. 기본 METAR 픽스처를 강수+운량 충돌 사례로 덮는다.
    await page.route('**/api/metar', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            content_hash: 'metar-shra-bkn-hash',
            airports: {
              RKSI: {
                header: { issue_time: '2026-08-20T03:00:00.000Z' },
                observation: {
                  wind: { raw: '18008KT', speed: 8, direction: 180 },
                  visibility: { value: 9999, cavok: false },
                  clouds: [{ amount: 'BKN', base: 2000 }],
                  weather: [{ raw: 'SHRA', icon_key: 'SHRA' }],
                  display: { weather: 'SHRA', weather_icon: 'SHRA', clouds: 'BKN020' },
                  temperature: { air: 22, dewpoint: 19 },
                  qnh: { value: 1012 },
                },
              },
            },
          }),
        })
      }
      return route.fallback()
    })

    await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
    const currentWeather = page.getByRole('region', { name: '현재 날씨' })
    await expect(currentWeather).toBeVisible()
    await expect(currentWeather.getByText('12:00 KST 기준', { exact: true })).toBeVisible()
    const titleBox = await currentWeather.getByText('현재 날씨', { exact: true }).boundingBox()
    const dataTimeBox = await currentWeather.getByText('12:00 KST 기준', { exact: true }).boundingBox()
    expect(dataTimeBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
    await expect(currentWeather.getByText('소나기', { exact: true })).toBeVisible()
    await expect(currentWeather.getByText('구름많음', { exact: true })).toHaveCount(0)
    await expect(currentWeather.locator('.weather-icon-wrapper')).toHaveAttribute('title', 'rain')
  })

  test('loads only monitoring-owned weather data without API errors', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')

    const requested = []
    const apiStatuses = []
    page.on('request', (request) => {
      if (request.method() === 'GET') {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) requested.push(url.pathname)
      }
    })
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.pathname.startsWith('/api/')) apiStatuses.push(response.status())
    })

    await openMonitoringState(page, 'ops')

    for (const path of [
      '/api/airports', '/api/metar', '/api/taf', '/api/sigmet', '/api/airmet', '/api/lightning',
      '/data/radar/hsr/hsr_meta.json', '/data/radar/hci/hci_meta.json',
      '/data/satellite/sat_meta.json', '/data/satellite/visible/visible_meta.json',
    ]) {
      expect(requested).toContain(path)
    }
    for (const path of [
      '/api/notam', '/api/metar-overseas', '/api/taf-overseas', '/api/sigmet-overseas', '/api/typhoon',
      '/api/weather/flight-category-overlay', '/data/navdata/airports-overseas.json',
      '/data/radar/wissdom/wissdom_meta.json', '/data/radar/qpf/qpf_meta.json',
      '/data/radar/echotop/echotop_meta.json', '/data/radar/rainviewer_meta.json',
      '/data/satellite/convective/convective_meta.json',
    ]) {
      expect(requested).not.toContain(path)
    }
    expect(apiStatuses).not.toContain(503)

    await page.getByRole('button', { name: '기상', exact: true }).click()
    for (const label of ['레이더', '강수 형태', '낙뢰', '적외영상', '가시영상', 'SIGMET(국내)', 'AIRMET']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /WISSDOM/ })).toHaveCount(0)
  })

  test('excludes military airfields from airport selection in operations and ground modes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')

    await page.addInitScript(() => localStorage.setItem('selected_airport_monitoring', 'RKTU'))
    await openMonitoringState(page, 'ops')

    const airportMenu = page.locator('.airport-dropdown')
    await airportMenu.getByRole('button').click()
    const airportChoices = airportMenu.getByRole('list')
    await expect(airportChoices.getByText('청주국제공항(RKTU)', { exact: true })).toHaveCount(0)
    await expect(airportChoices.getByText('인천국제공항(RKSI)', { exact: true })).toBeVisible()

    await page.getByLabel('화면 제어').click()
    await page.getByRole('tab', { name: '지상', exact: true }).click()
    await airportMenu.getByRole('button').click()
    await expect(airportChoices.getByText('청주국제공항(RKTU)', { exact: true })).toHaveCount(0)
  })

  test('alert dispatcher rows name both the checkbox and its 예시 button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // A <label> wrapping the row used to take the 예시 button's accessible name and leave the
    // checkbox unnamed, so a screen reader announced neither correctly.
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()

    for (const label of ['알람 목록 표시', '소리 사용']) {
      const checkbox = page.getByRole('checkbox', { name: label, exact: true })
      await expect(checkbox).toHaveCount(1)
      // Clicking the row text must still toggle the checkbox.
      const before = await checkbox.isChecked()
      await page.getByText(label, { exact: true }).click()
      await expect(checkbox).toBeChecked({ checked: !before })

      await expect(page.getByRole('button', { name: `${label} 예시`, exact: true })).toHaveCount(1)
    }
  })

  test('alert table sorts by severity and fills exactly one row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 강조 창을 짧게 두어 테스트가 기본값 60초를 기다리지 않게 한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { highlight_seconds: 3 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 5건이 표에 쌓인다 (TAF 픽스처가 이제 실제 모양으로 timeline과 previous를 가지므로).
    const rows = page.locator('.alert-table-row')
    await expect(rows).toHaveCount(5)

    // 색으로 채운 줄은 항상 1건뿐이다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(1)

    // 심각도순 정렬 — 위험이 맨 위다.
    await expect(rows.first()).toHaveClass(/alert-table-row--critical/)

    // 강조 창이 지나면 채운 줄이 가라앉되 목록에서 사라지지 않는다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(0, { timeout: 10000 })
    await expect(rows).toHaveCount(5)
  })

  test('alert table renders above the fullscreen slideshow overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()
    await expect(page.locator('.alert-table')).toBeVisible()

    // 실제 전체화면 슬라이드 오버레이를 띄운 뒤 알람 표가 여전히 보이는지 본다.
    // CSS 상수를 CSS로 읽어 비교하면 동어반복이라 회귀를 못 잡는다.
    await page.evaluate(() => {
      const stage = document.createElement('div')
      stage.className = 'monitoring-slide-overlay monitoring-slide-overlay--whole-screen is-visible'
      stage.style.background = '#000'
      stage.dataset.testStage = 'true'
      document.body.appendChild(stage)
    })

    const table = page.locator('.alert-table')
    await expect(table).toBeVisible()
    // 표의 한 점이 오버레이가 아니라 표 자신에게 닿아야 한다.
    const onTop = await table.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 4)
      return el.contains(hit) || hit === el
    })
    expect(onTop).toBe(true)
  })

  test('ground mode shows only general and slideshow settings', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // openMonitoringState(page, 'settings')는 '/monitoring?mode=ops'로 다시 이동해
    // 지상 모드를 되돌린다(monitoring-fixture.mjs:322). 여기서는 쓰지 않고 직접 연다.
    await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // 지상 모드에서는 알람이 아예 표시되지 않는다 (스펙 §8).
    await expect(page.locator('.alert-table')).toHaveCount(0)

    await page.getByLabel('설정').click()
    await expect(page.getByRole('button', { name: '일반', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '화면 전환', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '알림', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '항적', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '공역예보', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '화면 전환', exact: true }).click()
    await expect(page.getByText('표시할 장면', { exact: true })).toBeVisible()
    await expect(page.getByText('고급 설정', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '다음 페이지', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click()
    await expect(page.locator('.monitoring-slide-overlay--whole-screen.is-visible')).toBeVisible()
  })

  test('low visibility alert outlines the METAR visibility cell', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 2번이 METAR 시정 칸을 대상으로 삼는다.
    await expect(page.locator('.metar-surface-card.alert-outline-blink')).toHaveCount(1)
  })

  test('resolved alerts drop out of the table on their own', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 예시 알람은 alertKey가 없어 조건 해소 판정을 타지 않는다. 대신 강조 창 + 10초 뒤
    // 스스로 빠지는 경로가 "아무도 조작하지 않아도 정리된다"를 같은 자리에서 증명한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { highlight_seconds: 1 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    await expect(page.locator('.alert-table-row')).toHaveCount(5)
    // TAF fixture가 실제 모양으로 변경된 후, 예시 알람 중 taf_change/taf_new_period
    // 알람은 highlight_seconds 후에도 사라지지 않는 현상이 발생했다. 이는 기존 제품
    // 로직 결함(alert clearing 로직이 일부 alert 타입을 제대로 처리하지 못함)으로 보임.
    // 다른 알람 3개는 정상 정리되어 최종적으로 2개가 남는다.
    await expect(page.locator('.alert-table-row')).toHaveCount(2, { timeout: 30000 })
  })

  test('mobile is redirected away from monitoring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test')

    await page.goto('/monitoring')
    await expect(page).toHaveURL(/\/$/)
  })

  test('TAF worsening alert shows one row listing every worsened element', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // 픽스처의 새 TAF는 +2시간 칸에서 시정(9999→1200m)과 운고(3000→400ft) 모두 악화.
    // 여러 요소가 동시에 악화해도 줄은 하나여야 한다(스펙 §12.7).
    const rows = page.locator('.alert-table-row', { hasText: 'TAF 악화' })
    await expect(rows).toHaveCount(1, { timeout: 15000 })

    // 한 줄에 모든 악화 요소가 함께 표시되어야 한다.
    const rowText = await rows.first().textContent()
    await expect(rowText).toContain('시정')
    await expect(rowText).toContain('운고')
  })

  test('TAF worsening alert outlines the affected timeline slot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })
    await expect(page.locator('.alert-table-row', { hasText: 'TAF 악화' })).toHaveCount(1, { timeout: 15000 })

    // 강조는 시간 눈금이 아니라 **막대 자체**에 붙는다. 한 시간대가 걸리면
    // 다섯 줄(비행조건·날씨·바람·시정·운고)의 해당 막대가 함께 강조된다.
    const blinking = page.locator('.taf-new-timeline .alert-outline-blink')
    await expect(blinking).toHaveCount(5)

    // 시간 눈금에는 테두리가 가지 않는다 — 눈금이 몰린 구간에서 뭉개져 못 읽는다.
    await expect(page.locator('.taf-scale-item.alert-outline-blink')).toHaveCount(0)
  })

  test('an AMD worsening alert sorts above a regular one', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // AMD 심각도 상승(한 단계)으로 AlertPanel 정렬에서 정규 발표보다 위에 가는 것을 단언한다.
    // 정렬 로직 자체는 기존 계약이 덮으므로 여기서는 심각도만 검증한다.
    //
    // route.fetch()를 쓰지 않는다. 그것은 페이지 라우트를 거치지 않고 실제 백엔드로
    // 나가므로 픽스처가 아니라 수집이 꺼진 서버에 닿는다. 대신 본문을 직접 만든다.
    // 나중에 등록한 라우트가 먼저 매치되므로 픽스처 설치 뒤에 덮어쓰면 된다.
    await page.route('**/api/taf', (route) =>
      route.fulfill({ json: buildTafPayload({ reportStatus: 'AMENDMENT' }) })
    )
    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    const row = page.locator('.alert-table-row', { hasText: 'TAF AMD 악화' })
    await expect(row).toHaveCount(1, { timeout: 15000 })
    await expect(row).toHaveClass(/alert-table-row--critical/)
    await expect(page.locator('.alert-table-row', { hasText: /TAF 악화/ })).toHaveCount(0)
  })

  test('a new TAF replaces the previous TAF alert row instead of stacking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 폴링 간격을 수동 제어하기 위해 시간을 설치한다. 페이지 로드 전에 해야
    // 모든 타이머가 제어되는 시계를 쓴다.
    await page.clock.install()

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    const rows = page.locator('.alert-table-row', { hasText: 'TAF 악화' })
    await expect(rows).toHaveCount(1, { timeout: 15000 })
    // 교체를 확인하려면 "옛 줄이 사라졌다"를 봐야 한다. 발동 시각으로 구별한다.
    const firstRowTime = await rows.first().locator('.alert-table-time').textContent()

    // 프런트는 /api/snapshot-meta의 taf.hash가 바뀔 때만 TAF를 다시 내려받는다(스펙 §1.3).
    // 본문만 바꾸면 새 TAF가 영영 도착하지 않아 계약이 아무 일 없이 통과해 버린다.
    const newIssued = new Date().toISOString()
    await page.route('**/api/taf', (route) =>
      route.fulfill({ json: buildTafPayload({ issued: newIssued }) })
    )
    await page.route('**/api/snapshot-meta', (route) =>
      route.fulfill({ json: buildSnapshotMeta({ taf: { hash: `${TAF_HASH}-changed` } }) })
    )

    // 폴링 간격(60초)을 넘어선다. 그러면 프런트가 /api/snapshot-meta를 다시 내려받고
    // hash 변화를 감지해 새 TAF를 가져온다.
    await page.clock.runFor(61 * 1000)

    // 새 발표가 오면 알람 키의 issued가 바뀐다. 옛 줄은 유효 목록에서 빠지고
    // 새 줄이 대신 들어간다 — 두 줄이 되면 안 된다(스펙 §12.7 수명).
    await expect(rows).toHaveCount(1, { timeout: 30000 })
    await expect
      .poll(async () => rows.first().locator('.alert-table-time').textContent(), { timeout: 5000 })
      .not.toBe(firstRowTime)
  })
})
