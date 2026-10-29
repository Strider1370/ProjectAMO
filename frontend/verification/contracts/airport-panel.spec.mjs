import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { installMonitoringFixture, MONITORING_FIXTURE_NOW } from '../monitoring-fixture.mjs'

test.describe('airport-panel', () => {
  test('opens the RKSI airport panel from its direct link', async ({ page }, testInfo) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeVisible()
    await page.waitForFunction(() => {
      const data = window.__map?.getSource('kma-weather-airports')?.serialize?.()?.data
      return data?.features?.some((feature) => feature.properties?.icao === 'RKSI')
    })
    const airportMarker = await page.evaluate(() => {
      const map = window.__map
      const data = map?.getSource('kma-weather-airports')?.serialize?.()?.data
      return {
        featureCount: data?.features?.length ?? 0,
        stationLayer: Boolean(map?.getLayer('kma-weather-airports-station-center')),
        labelLayer: Boolean(map?.getLayer('kma-weather-airports-label')),
      }
    })
    expect(airportMarker.featureCount).toBeGreaterThan(0)
    expect(airportMarker.stationLayer).toBe(true)
    expect(airportMarker.labelLayer).toBe(true)
    const sectionNav = page.getByRole('navigation', { name: '섹션 이동' })
    await expect(sectionNav.getByRole('button', { name: 'METAR', exact: true })).toBeVisible()
    await expect(sectionNav.getByRole('button', { name: /^TAF/ })).toBeVisible()
    await expect(sectionNav.getByRole('button', { name: 'NOTAM', exact: true })).toBeVisible()

    const operations = page.getByRole('group', { name: '공항 운항정보' })
    await expect(operations).toBeVisible()
    await expect(operations.getByText('표고 23 ft', { exact: true })).toBeVisible()
    await expect(operations.getByText(/^☀ 일출 \d{2}:\d{2} · 일몰 \d{2}:\d{2}$/)).toBeVisible()

    const stripLayout = await operations.evaluate((strip) => ({
      itemCount: strip.children.length,
      itemsFit: [...strip.children].every((item) => item.scrollWidth <= item.clientWidth),
      inHeader: strip.parentElement?.classList.contains('airport-panel-head'),
      rightGap: Math.round(strip.parentElement.getBoundingClientRect().right - strip.getBoundingClientRect().right),
      bottomGap: Math.round(strip.parentElement.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom),
    }))
    expect(stripLayout.itemCount).toBe(2)
    expect(stripLayout.itemsFit).toBe(true)
    expect(stripLayout.inHeader).toBe(true)
    expect(stripLayout.rightGap).toBeGreaterThanOrEqual(0)
    expect(stripLayout.rightGap).toBeLessThanOrEqual(24)
    expect(stripLayout.bottomGap).toBeGreaterThanOrEqual(0)
    expect(stripLayout.bottomGap).toBeLessThanOrEqual(12)

    const captureDir = process.env.PROJECTAMO_CAPTURE_DIR
    if (captureDir) {
      await page.locator('.airport-panel').screenshot({
        path: `${captureDir}/${testInfo.project.name}-${process.env.PROJECTAMO_CAPTURE_LABEL || 'capture'}.png`,
      })
    }

    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeHidden()

    await page.goto('/?airport=RJAA', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('도쿄 나리타 · RJAA', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: '공항 운항정보' })).toHaveCount(0)
  })
})

test('airport-panel: warning and nearby lightning rotate, then lightning expires', async ({ page }) => {
  const now = MONITORING_FIXTURE_NOW.getTime()
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString()
  await page.clock.install({ time: MONITORING_FIXTURE_NOW })
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await installMonitoringFixture(page, { warning: { airports: {
    RKSI: { warnings: [{ wrng_type_key: 'STRONG_WIND', valid_start: iso(60), valid_end: iso(-60) }] },
  } } })
  await page.route('**/api/lightning', (route) => route.fulfill({ json: {
    content_hash: 'airport-lightning-test',
    airports: { RKSI: { strikes: [{ time: iso(10), distance_km: 7.4, zone: 'alert' }] } },
    nationwide: { strikes: [], coverage: {
      status: 'complete', to: iso(5),
      successfulWindows: [{ from: iso(240), to: iso(5) }],
    } },
  } }))
  await page.route('**/api/demo-mode', (route) => route.fulfill({ json: { on: false, now: iso(0) } }))

  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })
  const section = page.locator('#sec-warn')
  await expect(section.getByRole('heading', { name: '공항경보 / 낙뢰관측' })).toBeVisible()
  await expect(section.locator('.ap-observation-heading')).toHaveText('공항경보 · 강풍경보')
  await page.clock.fastForward(6100)
  await expect(section.locator('.ap-observation-heading')).toHaveText('최근 15분 낙뢰 관측')
  await section.getByRole('button', { name: '1번째 안내: 강풍경보' }).click()
  await expect(section.locator('.ap-observation-heading')).toHaveText('공항경보 · 강풍경보')
  await section.getByRole('button', { name: '2번째 안내: 낙뢰 관측' }).click()
  await expect(section.locator('.ap-observation-heading')).toHaveText('최근 15분 낙뢰 관측')
  await expect(section.locator('.ap-observation-detail')).toContainText('최단 7.4km')

  await page.clock.fastForward(6 * 60_000)
  await expect(section.locator('.ap-observation-heading')).toHaveText('최근 30분 낙뢰 관측')
  await page.clock.fastForward(15 * 60_000)
  await expect(section.getByRole('heading', { name: '공항경보', exact: true })).toBeVisible()
  await expect(section.locator('.ap-observation-carousel')).toHaveCount(0)
  await expect(section.locator('.ap-current-warning--danger')).toBeVisible()

  await page.route('**/api/warning', (route) => route.fulfill({ json: { airports: {} } }))
  await page.clock.setFixedTime(MONITORING_FIXTURE_NOW)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(section.getByRole('heading', { name: '공항경보 / 낙뢰관측' })).toBeVisible()
  await expect(section.locator('.ap-observation-heading')).toHaveText('최근 15분 낙뢰 관측')
  await expect(section.locator('.ap-current-warning--ok')).toHaveCount(0)
})

test('airport-panel: airport marker wins over overlapping SIGMET and AIRMET areas', async ({ page }) => {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await installMonitoringFixture(page)
  const now = Date.now()
  const geometry = { type: 'Polygon', coordinates: [[[125, 36], [129, 36], [129, 39], [125, 39], [125, 36]]] }
  for (const kind of ['sigmet', 'airmet']) {
    await page.route(`**/api/${kind}`, (route) => route.fulfill({ json: { items: [{
      id: `over-airport-${kind}`,
      phenomenon_code: kind === 'sigmet' ? 'OBSC_TS' : 'SFC_VIS',
      geometry,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + 60 * 60_000).toISOString(),
    }] } }))
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__map)
  // The app's remote default style can be unavailable in CI; install a local
  // style before checking rendered layers and real pointer clicks.
  await page.evaluate(() => window.__map.setStyle({
    version: 8, sources: {}, layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#eef2f5' } },
      { id: 'bottom', type: 'slot' }, { id: 'middle', type: 'slot' }, { id: 'top', type: 'slot' },
    ],
  }, { diff: false }))
  await page.waitForFunction(() => {
    const map = window.__map
    return map?.getSource('kma-weather-airports')?.serialize?.()?.data?.features?.some((feature) => feature.properties?.icao === 'RKSI')
      && map.getLayer('kma-sigmet-advisories-fill') && map.getLayer('kma-airmet-advisories-fill')
  })
  const position = async (coordinates) => page.evaluate((coords) => {
    const map = window.__map
    const point = map.project(coords)
    const rect = map.getCanvas().getBoundingClientRect()
    return { x: rect.left + point.x, y: rect.top + point.y,
      airport: map.queryRenderedFeatures(point, { layers: ['kma-weather-airports-circle'] }).length,
      advisories: map.queryRenderedFeatures(point, { layers: ['kma-sigmet-advisories-fill', 'kma-airmet-advisories-fill'] }).length }
  }, coordinates)
  await page.evaluate(() => window.__map.jumpTo({ center: [126.8, 37.5], zoom: 7 }))
  await expect.poll(() => position([126.4407, 37.4602]), { timeout: 15_000 })
    .toMatchObject({ airport: 1, advisories: 2 })

  const airport = await position([126.4407, 37.4602])
  await page.mouse.click(airport.x, airport.y)
  await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeVisible()
  await expect(page.locator('.mapbox-advisory-popup')).toHaveCount(0)

  await page.getByRole('button', { name: '닫기' }).click()
  const area = await position([126.8, 37.1])
  expect(area.airport).toBe(0)
  expect(area.advisories).toBe(2)
  await page.mouse.click(area.x, area.y)
  await expect(page.locator('.mapbox-advisory-popup')).toHaveCount(2)
})

test('airport-panel: TAF TAC starts folded and opens on demand', async ({ page }) => {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await installMonitoringFixture(page, { now: new Date() })
  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })

  const tafTac = page.locator('.ap-taf .ap-raw-fold')
  await expect(tafTac).toBeAttached()
  await expect(tafTac).toHaveJSProperty('open', false)
  await tafTac.locator('summary').click()
  await expect(tafTac).toHaveJSProperty('open', true)
})

test('airport-panel: TAF switches between timeline and table when the viewport changes', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await installMonitoringFixture(page, { now: new Date() })
  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })

  const taf = page.locator('#sec-taf .ap-taf')
  const timeline = taf.locator('.ap-taf-timeline')
  const table = taf.locator('.ap-taf-table')
  await expect(timeline).toBeAttached()
  for (const width of [1279, 719, 390, 1194]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(table).toBeAttached()
    await expect(timeline).toHaveCount(0)
    if (width <= 719) await expect(taf).not.toHaveClass(/ap-taf--compact/)
    else await expect(taf).toHaveClass(/ap-taf--compact/)
  }
  await page.setViewportSize({ width: 1280, height: 1000 })
  await expect(timeline).toBeAttached()
  await expect(table).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(table).toBeAttached()
  await expect(timeline).toHaveCount(0)
})
