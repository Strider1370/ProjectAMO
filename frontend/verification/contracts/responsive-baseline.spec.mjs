import { test, expect } from '../fixtures.mjs'

test.describe('responsive-baseline', () => {
  test('main shell fits its assigned viewport', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('amo.tour.v1.done', 'true'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('main')).toBeVisible()
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    }))

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport + 1)
  })
})
