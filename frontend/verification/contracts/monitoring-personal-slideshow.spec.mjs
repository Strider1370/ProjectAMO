import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState } from '../monitoring-fixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_IMAGE = path.join(__dirname, 'fixtures', 'monitoring-slideshow-sample.jpg')

async function openSlideshowTab(page) {
  await openMonitoringState(page, 'settings')
  await page.getByRole('button', { name: '화면 전환' }).click()
}

test.describe('monitoring personal slideshow', () => {
  test.beforeEach(async ({ page }) => {
    await installMonitoringFixture(page)
  })

  test('whole-screen preview overlays the image above the still-mounted dashboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await page.getByRole('button', { name: '미리보기' }).click()

    const overlay = page.locator('.monitoring-slide-overlay--whole-screen')
    await expect(overlay).toHaveClass(/is-visible/)
    await expect(overlay.locator('.monitoring-slide-overlay-image')).toBeVisible()
    await expect(page.locator('.dashboard-root')).toBeAttached()

    await overlay.getByRole('button', { name: '화면 전환 종료' }).click()
    await expect(overlay).not.toHaveClass(/is-visible/)
  })

  test('map-panel preview overlays only the map panel and keeps MapView mounted', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await page.getByRole('button', { name: '미리보기' }).click()

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay).toHaveClass(/is-visible/)
    await expect(page.locator('.monitoring-mapbox-panel canvas').first()).toBeAttached()
    await expect(page.locator('.left-panel-body')).toBeVisible()

    await overlay.getByRole('button', { name: '화면 전환 종료' }).click()
    await expect(overlay).not.toHaveClass(/is-visible/)
  })

  test('mobile: slideshow tab is unavailable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test (FR-014)')

    await openSlideshowTab(page)
    await expect(page.getByLabel('화면 전환 사용')).toBeDisabled()
  })
})
