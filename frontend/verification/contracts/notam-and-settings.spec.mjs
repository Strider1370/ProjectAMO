import { test, expect } from '../fixtures.mjs'

async function openApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    localStorage.setItem('time_zone', 'KST')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

test.describe('notam-and-settings', () => {
  test('toggles the NOTAM map master switch on desktop surfaces', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'NOTAM has no mobile entry in the current More menu; mobile settings is covered below.')
    await openApp(page)

    await page.getByRole('button', { name: 'NOTAM', exact: true }).click()
    const masterSwitch = page.getByRole('switch', { name: '지도에 NOTAM 표시' })
    await expect(masterSwitch).toBeVisible()
    const wasChecked = await masterSwitch.getAttribute('aria-checked')
    await masterSwitch.click()
    await expect(masterSwitch).toHaveAttribute('aria-checked', wasChecked === 'true' ? 'false' : 'true')
  })

  test('saves the selected time zone', async ({ page }, testInfo) => {
    await openApp(page)

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '더보기', exact: true }).click()
    }
    await page.getByRole('button', { name: '설정', exact: true }).click()

    const timeZone = page.getByRole('combobox', { name: '시간대', exact: true })
    await expect(timeZone).toBeVisible()
    await timeZone.selectOption('UTC')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeHidden()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('time_zone'))).toBe('UTC')
  })
})
