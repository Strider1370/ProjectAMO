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

  test('alert dispatcher rows name both the checkbox and its 예시 button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // A <label> wrapping the row used to take the 예시 button's accessible name and leave the
    // checkbox unnamed, so a screen reader announced neither correctly.
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()

    for (const label of ['알람 목록 표시', '소리 사용']) {
      const checkbox = page.getByRole('checkbox', { name: label, exact: true })
      await expect(checkbox).toHaveCount(1)
      // Clicking the row text must still toggle the checkbox.
      const before = await checkbox.isChecked()
      await page.getByText(label, { exact: true }).click()
      await expect(checkbox).toBeChecked({ checked: !before })

      await expect(page.getByRole('button', { name: `${label} 예시`, exact: true })).toHaveCount(1)
    }
  })

  test('alert table sorts by severity and fills exactly one row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 강조 창을 짧게 두어 테스트가 기본값 60초를 기다리지 않게 한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { highlight_seconds: 3 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 3건이 표에 쌓인다.
    const rows = page.locator('.alert-table-row')
    await expect(rows).toHaveCount(3)

    // 색으로 채운 줄은 항상 1건뿐이다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(1)

    // 심각도순 정렬 — 위험이 맨 위다.
    await expect(rows.first()).toHaveClass(/alert-table-row--critical/)

    // 강조 창이 지나면 채운 줄이 가라앉되 목록에서 사라지지 않는다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(0, { timeout: 10000 })
    await expect(rows).toHaveCount(3)
  })

  test('alert table renders above the fullscreen slideshow overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()
    await expect(page.locator('.alert-table')).toBeVisible()

    // 실제 전체화면 슬라이드 오버레이를 띄운 뒤 알람 표가 여전히 보이는지 본다.
    // CSS 상수를 CSS로 읽어 비교하면 동어반복이라 회귀를 못 잡는다.
    await page.evaluate(() => {
      const stage = document.createElement('div')
      stage.className = 'monitoring-slide-overlay monitoring-slide-overlay--whole-screen is-visible'
      stage.style.background = '#000'
      stage.dataset.testStage = 'true'
      document.body.appendChild(stage)
    })

    const table = page.locator('.alert-table')
    await expect(table).toBeVisible()
    // 표의 한 점이 오버레이가 아니라 표 자신에게 닿아야 한다.
    const onTop = await table.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 4)
      return el.contains(hit) || hit === el
    })
    expect(onTop).toBe(true)
  })

  test('ground mode hides alerts and disables the list preview button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // openMonitoringState(page, 'settings')는 '/monitoring?mode=ops'로 다시 이동해
    // 지상 모드를 되돌린다(monitoring-fixture.mjs:322). 여기서는 쓰지 않고 직접 연다.
    await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // 지상 모드에서는 알람이 아예 표시되지 않는다 (스펙 §8).
    await expect(page.locator('.alert-table')).toHaveCount(0)

    await page.getByLabel('설정').click()
    await page.getByRole('button', { name: '알림', exact: true }).click()

    await expect(page.getByRole('button', { name: '알람 목록 표시 예시', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '소리 사용 예시', exact: true })).toBeEnabled()
  })

  test('low visibility alert outlines the METAR visibility cell', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 2번이 METAR 시정 칸을 대상으로 삼는다.
    await expect(page.locator('.metar-surface-card.alert-outline-blink')).toHaveCount(1)
  })

  test('resolved alerts drop out of the table on their own', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 예시 알람은 alertKey가 없어 조건 해소 판정을 타지 않는다. 대신 강조 창 + 10초 뒤
    // 스스로 빠지는 경로가 "아무도 조작하지 않아도 정리된다"를 같은 자리에서 증명한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { highlight_seconds: 1 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    await expect(page.locator('.alert-table-row')).toHaveCount(3)
    await expect(page.locator('.alert-table')).toHaveCount(0, { timeout: 20000 })
  })

  test('mobile is redirected away from monitoring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test')

    await page.goto('/monitoring')
    await expect(page).toHaveURL(/\/$/)
  })
})
