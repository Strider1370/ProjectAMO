import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState, MONITORING_FIXTURE_NOW } from '../monitoring-fixture.mjs'

test.describe('monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: MONITORING_FIXTURE_NOW })
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
      if (url.pathname.startsWith('/api/')) apiStatuses.push({ path: url.pathname, status: response.status() })
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
      '/api/weather/flight-category-overlay',
      '/data/radar/wissdom/wissdom_meta.json', '/data/radar/qpf/qpf_meta.json',
      '/data/radar/echotop/echotop_meta.json', '/data/radar/rainviewer_meta.json',
      '/data/satellite/convective/convective_meta.json',
    ]) {
      expect(requested).not.toContain(path)
    }
    expect(apiStatuses.filter((entry) => entry.status === 503 && [
      '/api/airports', '/api/metar', '/api/taf', '/api/sigmet', '/api/airmet', '/api/lightning',
    ].includes(entry.path))).toEqual([])

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

  test('상황판은 독립 알림을 띄우지 않고 통합 알림 설정으로 안내한다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')
    await openMonitoringState(page, 'ops')
    await page.getByLabel('화면 제어').click()
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await expect(page.locator('.alert-table')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '알림', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '통합 알림 설정' })).toHaveAttribute('href', '/alerts/settings')
  })

  test('ground mode shows only general and slideshow settings', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // openMonitoringState(page, 'settings')는 '/monitoring?mode=ops'로 다시 이동해
    // 지상 모드를 되돌린다(monitoring-fixture.mjs:322). 여기서는 쓰지 않고 직접 연다.
    await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // 지상 모드에서는 알람이 아예 표시되지 않는다 (스펙 §8).
    await expect(page.locator('.alert-table')).toHaveCount(0)

    await page.getByLabel('화면 제어').click()
    await page.getByRole('button', { name: '설정', exact: true }).click()
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

  test('mobile is redirected away from monitoring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test')

    await page.goto('/monitoring')
    await expect(page).toHaveURL(/\/$/)
  })

})
