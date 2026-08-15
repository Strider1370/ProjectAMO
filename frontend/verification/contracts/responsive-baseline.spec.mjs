import { test, expect } from '../fixtures.mjs'

test.describe('responsive-baseline', () => {
  test('an unseen release opens its latest notes once', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('update-contract-initialized')) return
      sessionStorage.setItem('update-contract-initialized', 'true')
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.7')
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const dialog = page.getByRole('dialog', { name: '업데이트 소식', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /v0\.2\.8/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(dialog.getByRole('listitem')).not.toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('projectamo:lastSeenVersion'))).toBe('0.2.8')

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
