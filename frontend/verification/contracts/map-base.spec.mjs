import { test, expect } from '../fixtures.mjs'

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
  test('changes the selected base map', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click()
    const terrain = page.getByRole('menuitemradio', { name: /^지형/ })
    await terrain.click()
    await expect(page.getByRole('button', { name: '지형 지도 선택' })).toBeVisible()
  })

  test('opens the weather layer panel and toggles radar', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    })
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
    await page.addInitScript(() => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', '0.2.5') })
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
