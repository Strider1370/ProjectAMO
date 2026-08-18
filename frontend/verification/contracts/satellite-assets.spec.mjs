import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64')
const TM = '202608181410'
const BOUNDS = [[29.3, 114], [45.8, 138]]

async function installSatelliteAssets(page) {
  await page.route('**/api/demo-mode', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ on: false, now: '2026-08-18T05:15:00.000Z' }),
  }))
  await page.route('**/data/satellite/sat_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'SATELLITE', tm: TM, frames: [{ tm: TM, path: `/data/satellite/sat_korea_${TM}.webp`, bounds: BOUNDS }] }),
  }))
  await page.route('**/data/satellite/visible/visible_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'GK2A_VISIBLE', tm: TM, frames: [{ tm: TM, path: `/data/satellite/visible/vis_korea_${TM}.webp`, bounds: BOUNDS }] }),
  }))
  await page.route('**/data/satellite/convective/convective_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'SATELLITE_CONVECTIVE', tm: TM,
      frames: [{
        tm: TM, request_tm_utc: '202608180510', observedAt: '2026-08-18T05:10:00.000Z', bounds: BOUNDS,
        ci: { path: `/data/satellite/convective/ci_${TM}.geojson` },
        ctps: { images: { all: `/data/satellite/convective/ctps_${TM}_all.webp` } },
      }],
    }),
  }))
  await page.route('**/data/satellite/convective/*.geojson', (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
  }))
  await page.route('**/data/satellite/**/*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: WEBP }))
}

test.describe('satellite-assets', () => {
  test('loads IR/FOG, VI006, CI, and CTPS assets through their published metadata', async ({ page }, testInfo) => {
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await installSatelliteAssets(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const entry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
    await page.locator(`[aria-label="${entry}"]`).first().click()
    for (const name of ['적외영상', '가시영상', '대류 가능성', '구름 꼭대기']) {
      const button = page.getByRole('button', { name, exact: true })
      if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
    }

    await expect.poll(() => page.evaluate(() => ['kma-satellite-overlay', 'gk2a-visible-overlay', 'gk2a-ci-fill', 'gk2a-ctps-raster']
      .map((id) => window.__map?.getLayer(id)?.id ?? null))).toEqual([
      'kma-satellite-overlay', 'gk2a-visible-overlay', 'gk2a-ci-fill', 'gk2a-ctps-raster',
    ])
  })
})
