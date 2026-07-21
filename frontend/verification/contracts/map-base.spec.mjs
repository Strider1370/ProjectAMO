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
    body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { confidence: 0.9, bearingDeg: 90 }, geometry: { type: 'LineString', coordinates: [[126, 37], [126.3, 37]] } }] }),
  }))
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
})
