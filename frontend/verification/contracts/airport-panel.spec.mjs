import { test, expect } from '../fixtures.mjs'

test.describe('airport-panel', () => {
  test('opens the RKSI airport panel from its direct link', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    })
    await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeVisible()
    const sectionNav = page.getByRole('navigation', { name: '섹션 이동' })
    await expect(sectionNav.getByRole('button', { name: 'METAR', exact: true })).toBeVisible()
    await expect(sectionNav.getByRole('button', { name: /^TAF/ })).toBeVisible()
    await expect(sectionNav.getByRole('button', { name: 'NOTAM', exact: true })).toBeVisible()

    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeHidden()
  })
})
