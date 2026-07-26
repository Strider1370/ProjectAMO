import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

test.describe('airport-panel', () => {
  test('opens the RKSI airport panel from its direct link', async ({ page }) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
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
