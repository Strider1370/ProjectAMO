import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState } from '../monitoring-fixture.mjs'

test.describe('monitoring visual', () => {
  test.beforeEach(async ({ page }) => {
    await installMonitoringFixture(page)
  })

  test('monitoring visual: ops', async ({ page }) => {
    await openMonitoringState(page, 'ops')
    await page.waitForTimeout(500) // Stabilize rendering
    await expect(page).toHaveScreenshot('monitoring-ops.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    })
  })

  test('monitoring visual: ground', async ({ page }) => {
    await openMonitoringState(page, 'ground')
    await page.waitForTimeout(500) // Stabilize rendering
    await expect(page).toHaveScreenshot('monitoring-ground.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    })
  })

  test('monitoring visual: map panel', async ({ page }) => {
    await openMonitoringState(page, 'map')
    await page.waitForTimeout(500) // Stabilize rendering
    await expect(page).toHaveScreenshot('monitoring-map-panel.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    })
  })

  test('monitoring visual: settings', async ({ page }) => {
    await openMonitoringState(page, 'settings')
    await page.waitForTimeout(500) // Stabilize rendering
    await expect(page).toHaveScreenshot('monitoring-settings.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    })
  })
})
