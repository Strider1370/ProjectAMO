import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState } from '../monitoring-fixture.mjs'

test.describe('monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await installMonitoringFixture(page)
  })

  test('opens operations mode and switches to ground mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mobile monitoring uses task tabs instead of dashboard modes')

    await openMonitoringState(page, 'ops')

    const modeTabs = page.getByRole('tablist', { name: '대시보드 모드' })
    await expect(modeTabs).toBeVisible()

    const operations = page.getByRole('tab', { name: '운항', exact: true })
    const ground = page.getByRole('tab', { name: '지상', exact: true })
    await expect(operations).toHaveAttribute('aria-selected', 'true')
    await expect(ground).toHaveAttribute('aria-selected', 'false')

    await ground.click()
    await expect(page).toHaveURL(/\/monitoring\?mode=ground$/)
    await expect(ground).toHaveAttribute('aria-selected', 'true')
    await expect(operations).toHaveAttribute('aria-selected', 'false')
  })

  test('alert dispatcher rows name both the checkbox and its 예시 button', async ({ page }) => {
    // A <label> wrapping the row used to take the 예시 button's accessible name and leave the
    // checkbox unnamed, so a screen reader announced neither correctly.
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()

    for (const label of ['팝업 사용', '소리 사용', '하단 알림 바 표시']) {
      const checkbox = page.getByRole('checkbox', { name: label, exact: true })
      await expect(checkbox).toHaveCount(1)
      // Clicking the row text must still toggle the checkbox.
      const before = await checkbox.isChecked()
      await page.getByText(label, { exact: true }).click()
      await expect(checkbox).toBeChecked({ checked: !before })

      await expect(page.getByRole('button', { name: `${label} 예시`, exact: true })).toHaveCount(1)
    }
  })

  test('mobile: opens monitoring and navigates task tabs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test')

    await openMonitoringState(page, 'ops')
    await expect(page.locator('[class*="dashboard-root"]')).toBeVisible()

    // Open map task
    await openMonitoringState(page, 'map')
    await page.waitForTimeout(300)

    // Open settings task
    await openMonitoringState(page, 'settings')
    await page.waitForTimeout(300)
  })
})
