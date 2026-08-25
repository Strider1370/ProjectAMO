import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function installRadarMotionFixture(page) {
  const observedAtMs = Date.UTC(2026, 4, 14, 3, 5)
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO', tm: '202605141205',
      frames: [
        { tm: '202605141200', path: '/data/radar/echo_korea_202605141200.png', bounds: [[30, 120], [40, 130]] },
        { tm: '202605141205', path: '/data/radar/echo_korea_202605141205.png', bounds: [[30, 120], [40, 130]], motion: { observedAtMs, comparedFromMs: observedAtMs - 5 * 60 * 1000, path: '/data/radar/motion_korea_202605141205.geojson' } },
      ],
    }),
  }))
  await page.route('**/data/radar/motion_korea_202605141205.geojson', (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [126, 37] }, properties: { bearingDeg: 90, speedKt: 30, matchScore: 120, neighbourAgreement: 0.9 } }],
    }),
  }))
}

async function installSatelliteRadarStackFixture(page) {
  const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA=', 'base64')
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  const tm = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}${pad(kst.getUTCHours())}${pad(Math.floor(kst.getUTCMinutes() / 10) * 10)}`
  const frame = { tm, timeMs: now.getTime(), path: '/data/satellite/sat_korea_202607231200.webp', bounds: [[29.3, 114], [45.8, 138]] }
  await page.route('**/data/satellite/sat_meta.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'SATELLITE', tm: frame.tm, latest: frame, frames: [frame] }) }))
  await page.route('**/data/satellite/visible/visible_meta.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'GK2A_VISIBLE', tm: frame.tm, latest: { ...frame, path: '/data/satellite/visible/vis_korea_202607231200.webp', timeMs: now.getTime() }, frames: [{ ...frame, path: '/data/satellite/visible/vis_korea_202607231200.webp', timeMs: now.getTime() }] }) }))
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'RADAR_ECHO', tm: frame.tm, frames: [{ ...frame, path: '/data/radar/echo_korea_202607231200.png' }] }) }))
  await page.route('**/data/satellite/sat_korea_*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: webp }))
  await page.route('**/data/satellite/visible/vis_korea_*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: webp }))
  await page.route('**/data/radar/echo_korea_*.png', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }))
}

async function installConvectiveFixture(page) {
  const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64')
  await page.route('**/data/satellite/sat_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'SATELLITE', tm: '202607231200', frames: [{ tm: '202607231200', path: '/data/satellite/sat_korea_202607231200.webp', bounds: [[29.3, 114], [45.8, 138]] }] }),
  }))
  await page.route('**/data/satellite/convective/convective_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'SATELLITE_CONVECTIVE', tm: '202607231200', frames: [{ tm: '202607231200', request_tm_utc: '202607230300', observedAt: '2026-07-23T03:00:00.000Z', bounds: [[29.3, 114], [45.8, 138]], ci: { path: '/data/satellite/convective/ci_202607231200.geojson' }, ctps: { images: { all: '/data/satellite/convective/ctps_202607231200_all.webp', '100': '/data/satellite/convective/ctps_202607231200_fl100.webp' } } }] }),
  }))
  await page.route('**/data/satellite/convective/ci_202607231200.geojson', (route) => route.fulfill({ contentType: 'application/geo+json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }))
  await page.route('**/data/satellite/convective/ctps_202607231200_*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: webp }))
}

test.describe('map-base', () => {
  test('keeps radar above visible and infrared satellite after a style replacement', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The deterministic Mapbox stack contract runs once on desktop.')
    await page.addInitScript((version) => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installSatelliteRadarStackFixture(page)
    const infraredMeta = page.waitForResponse('**/data/satellite/sat_meta.json')
    const visibleMeta = page.waitForResponse('**/data/satellite/visible/visible_meta.json')
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await Promise.all([infraredMeta, visibleMeta])
    await page.getByRole('button', { name: '기상정보' }).click()
    for (const label of ['레이더', '적외영상', '가시영상']) {
      const button = page.getByRole('button', { name: label, exact: true })
      if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
    }
    const stack = async () => page.evaluate(() => {
      if (!window.__map.isStyleLoaded()) return []
      const layers = window.__map.getStyle().layers
      return ['kma-satellite-overlay', 'gk2a-visible-overlay', 'kma-radar-overlay'].map((id) => {
        const index = layers.findIndex((layer) => layer.id === id)
        return { id, index, opacity: index >= 0 ? layers[index].paint?.['raster-opacity'] : undefined }
      })
    })
    await page.waitForTimeout(1000)
    expect(await stack()).toEqual([
      { id: 'kma-satellite-overlay', index: expect.any(Number), opacity: 1 },
      { id: 'gk2a-visible-overlay', index: expect.any(Number), opacity: 1 },
      { id: 'kma-radar-overlay', index: expect.any(Number), opacity: 0.88 },
    ])
    const before = await stack()
    expect(before[0].index).toBeLessThan(before[1].index)
    expect(before[1].index).toBeLessThan(before[2].index)
    await page.getByRole('button', { name: /지도 선택$/ }).click()
    await page.getByRole('menuitemradio', { name: /^위성/ }).click()
    await expect.poll(async () => {
      const layers = await stack()
      return layers.length === 3
        && layers[0].index >= 0 && layers[0].index < layers[1].index && layers[1].index < layers[2].index
        && layers[0].opacity === 1 && layers[1].opacity === 1 && layers[2].opacity === 0.88
    }).toBe(true)
    const after = await stack()
    expect(after[0].index).toBeLessThan(after[1].index)
    expect(after[1].index).toBeLessThan(after[2].index)
    await page.screenshot({ path: testInfo.outputPath('satellite-radar-stack.png') })
  })

  test('keeps an airport-warning badge label on one line on iPad', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-landscape', 'This regression occurs on the iPad landscape surface.')
    await page.setViewportSize({ width: 1024, height: 768 })

    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await page.route('**/api/warning', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        airports: {
          RKSI: { warnings: [{ wrng_type_key: 'WIND_SHEAR' }] },
        },
      }),
    }))
    const advisory = (id) => ({
      id,
      phenomenon_code: 'TS',
      valid_from: '2026-08-26T00:00:00.000Z',
      valid_to: '2026-08-26T06:00:00.000Z',
      geometry: { type: 'Polygon', coordinates: [[[126, 37], [127, 37], [127, 38], [126, 37]]] },
    })
    await page.route('**/api/sigmet', (route) => route.fulfill({ json: { items: [advisory('sigmet-ipad')] } }))
    await page.route('**/api/airmet', (route) => route.fulfill({ json: { items: [advisory('airmet-ipad')] } }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const warning = page.getByRole('button', { name: /공항경보/ })
    await expect(warning).toBeVisible()
    await page.getByRole('button', { name: '사이드바 펼치기' }).click()

    await expect(page.getByRole('button', { name: /SIGMET/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /AIRMET/ })).toBeVisible()
    const measurement = await warning.evaluate((chip) => {
      const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT)
      let text = null
      let candidate = null
      while ((candidate = walker.nextNode())) {
        if (candidate.textContent.trim() === '공항경보') {
          text = candidate
          break
        }
      }
      const range = document.createRange()
      range.selectNodeContents(text)
      return { lineCount: range.getClientRects().length }
    })

    expect(measurement.lineCount).toBe(1)
    await page.screenshot({ path: testInfo.outputPath('ipad-advisory-badges.png') })
  })

  test('changes the selected base map', async ({ page }) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click()
    const terrain = page.getByRole('menuitemradio', { name: /^지형/ })
    await terrain.click()
    await expect(page.getByRole('button', { name: '지형 지도 선택' })).toBeVisible()
  })

  test('opens the weather layer panel and toggles radar', async ({ page }, testInfo) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await installRadarMotionFixture(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
    await page.getByRole('button', { name: weatherEntry }).click()

    const radar = page.getByRole('button', { name: '레이더', exact: true })
    await expect(radar).toBeVisible()
    const wasPressed = await radar.getAttribute('aria-pressed')
    await radar.click()
    await expect(radar).toHaveAttribute('aria-pressed', wasPressed === 'true' ? 'false' : 'true')

    if (wasPressed !== 'true') {
      if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '범례' }).click()
      const motion = page.getByRole('button', { name: '이동 화살표 표시' })
      await expect(motion).toBeEnabled()
      await motion.click()
      await expect(motion).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('keeps CI and CTPS independent through a basemap replacement', async ({ page }, testInfo) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    await page.addInitScript((version) => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installConvectiveFixture(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
    await page.getByRole('button', { name: weatherEntry }).click()
    const ci = page.getByRole('button', { name: '대류 가능성', exact: true })
    const ctps = page.getByRole('button', { name: '구름 꼭대기', exact: true })
    await ci.click(); await ctps.click()
    await expect(ci).toHaveAttribute('aria-pressed', 'true')
    await expect(ctps).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('구름 꼭대기', { exact: true }).last()).toBeVisible()
    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^지형/ }).click()
    await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^기본/ }).click()
    await expect(ci).toHaveAttribute('aria-pressed', 'true')
    await expect(ctps).toHaveAttribute('aria-pressed', 'true')
  })

})
