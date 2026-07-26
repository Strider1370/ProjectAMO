import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function openApp(page) {
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
    localStorage.setItem('time_zone', 'KST')
  }, CURRENT_VERSION)
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
