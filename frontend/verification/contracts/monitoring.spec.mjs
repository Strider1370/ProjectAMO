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

  test('alert panel collapses to a badge but keeps the list until dismissed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'popup panel is a desktop dashboard surface')

    // 접히기까지의 시간을 줄여 테스트가 기본값 10초를 기다리지 않게 한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { auto_dismiss_seconds: 2 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '팝업 사용 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 3건이 순서대로 쌓여 패널이 펼쳐진다.
    const featured = page.locator('.alert-panel-featured')
    await expect(featured).toBeVisible()
    await expect(page.locator('.alert-panel-row')).toHaveCount(2)

    // 머무는 시간이 지나면 패널은 배지로 접힌다 — 알림이 지워진 것이 아니다.
    const badge = page.getByRole('button', { name: '알림 3건 펼치기', exact: true })
    await expect(badge).toBeVisible()
    await expect(featured).toHaveCount(0)

    // 배지를 누르면 3건이 그대로 돌아온다.
    await badge.click()
    await expect(featured).toBeVisible()
    await expect(page.locator('.alert-panel-row')).toHaveCount(2)
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
