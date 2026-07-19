import { test, expect } from '../fixtures.mjs'

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
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
    await page.getByRole('button', { name: weatherEntry }).click()

    const radar = page.getByRole('button', { name: '레이더', exact: true })
    await expect(radar).toBeVisible()
    const wasPressed = await radar.getAttribute('aria-pressed')
    await radar.click()
    await expect(radar).toHaveAttribute('aria-pressed', wasPressed === 'true' ? 'false' : 'true')
  })
})
