import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

test.describe('airport-panel', () => {
  test('opens the RKSI airport panel from its direct link', async ({ page }, testInfo) => {
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

    const operations = page.getByRole('group', { name: '공항 운항정보' })
    await expect(operations).toBeVisible()
    await expect(operations.getByText('표고 23 ft', { exact: true })).toBeVisible()
    await expect(operations.getByText(/^☀ 일출 \d{2}:\d{2} · 일몰 \d{2}:\d{2}$/)).toBeVisible()

    const stripLayout = await operations.evaluate((strip) => ({
      itemCount: strip.children.length,
      itemsFit: [...strip.children].every((item) => item.scrollWidth <= item.clientWidth),
      inHeader: strip.parentElement?.classList.contains('airport-panel-head'),
      rightGap: Math.round(strip.parentElement.getBoundingClientRect().right - strip.getBoundingClientRect().right),
      bottomGap: Math.round(strip.parentElement.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom),
    }))
    expect(stripLayout.itemCount).toBe(2)
    expect(stripLayout.itemsFit).toBe(true)
    expect(stripLayout.inHeader).toBe(true)
    expect(stripLayout.rightGap).toBeGreaterThanOrEqual(0)
    expect(stripLayout.rightGap).toBeLessThanOrEqual(24)
    expect(stripLayout.bottomGap).toBeGreaterThanOrEqual(0)
    expect(stripLayout.bottomGap).toBeLessThanOrEqual(12)

    const captureDir = process.env.PROJECTAMO_CAPTURE_DIR
    if (captureDir) {
      await page.locator('.airport-panel').screenshot({
        path: `${captureDir}/${testInfo.project.name}-${process.env.PROJECTAMO_CAPTURE_LABEL || 'capture'}.png`,
      })
    }

    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByText('인천국제공항 · RKSI', { exact: true })).toBeHidden()

    await page.goto('/?airport=RJAA', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('도쿄 나리타 · RJAA', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: '공항 운항정보' })).toHaveCount(0)
  })
})
