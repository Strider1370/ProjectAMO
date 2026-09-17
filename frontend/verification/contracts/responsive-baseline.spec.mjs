import { test, expect } from '../fixtures.mjs'
import { CHANGELOG, CURRENT_VERSION } from '../../src/features/about/changelog.js'

test.describe('responsive-baseline', () => {
  test('an unseen release opens its latest notes once', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('update-contract-initialized')) return
      sessionStorage.setItem('update-contract-initialized', 'true')
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.8')
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const dialog = page.getByRole('dialog', { name: '업데이트 소식', exact: true })
    await expect(dialog).toBeVisible()
    const latest = CHANGELOG[0]
    await expect(dialog.getByRole('button', { name: new RegExp(`v${latest.version}`) })).toHaveAttribute('aria-expanded', 'true')
    await expect(dialog.getByRole('listitem')).not.toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('projectamo:lastSeenVersion'))).toBe(CURRENT_VERSION)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(dialog).toHaveCount(0)
  })

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
