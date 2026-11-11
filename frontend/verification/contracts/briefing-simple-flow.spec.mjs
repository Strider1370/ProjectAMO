import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

test.describe('briefing-simple-flow', () => {
  test('briefing preparation animates while the request is pending and respects reduced motion', async ({ page }, testInfo) => {
    await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    let release
    let firstRequest = true
    const waitForRelease = new Promise(resolve => { release = resolve })
    await page.route('**/api/route-briefing', async route => {
      if (route.request().method() === 'POST' && firstRequest) {
        firstRequest = false
        await waitForRelease
        return route.fulfill({ status: 503, json: { error: 'fixture failure' } })
      }
      await route.fallback()
    })
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: testInfo.project.name === 'mobile' ? '브리핑' : '비행 전 브리핑', exact: true }).click()
      for (const [label, code] of [['출발 공항', 'RKSS'], ['목적 공항', 'RKPK']]) {
        await page.locator('.apf').filter({ hasText: label }).first().locator('.apf-row').click()
        await page.locator('.apf-pop .apf-chip').filter({ hasText: code }).click()
      }
      await page.getByRole('button', { name: '다음', exact: true }).click()
      await enterRouteTokens(page, ['SEL'])
      await page.getByRole('button', { name: '다음', exact: true }).click()
      await page.getByRole('button', { name: '브리핑 보기', exact: true }).click()
      const summary = page.getByLabel('비행계획 요약')
      await expect(summary).toHaveAttribute('aria-busy', 'true')
      const backgrounds = await summary.evaluate(el => [el, el.querySelector('.rb-plan-airports'), el.querySelector('.rb-plan-cells button')].map(node => getComputedStyle(node).backgroundColor))
      expect(new Set(backgrounds).size).toBe(1)
      await expect(page.getByRole('button', { name: '브리핑 생성 중...' })).toBeDisabled()
      await expect(page.getByRole('status').filter({ hasText: '브리핑을 준비하고 있습니다' })).toBeAttached()
      const plane = summary.locator('.rb-plan-plane')
      await expect(plane).toHaveCSS('animation-name', 'rb-plan-flight-across')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(plane).toHaveCSS('animation-name', 'none')
      release()
      await expect(summary).toHaveAttribute('aria-busy', 'false')
      await expect(page.getByRole('button', { name: '브리핑 보기', exact: true })).toBeEnabled()
      await expect(page.getByText('fixture failure')).toBeVisible()
      await page.getByRole('button', { name: '브리핑 보기', exact: true }).click()
      await expect(summary).toHaveCount(0)
    } finally { release() }
  })

  test('airport names: show domestic and overseas names in the summary', async ({ page }, testInfo) => {
    await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: testInfo.project.name === 'mobile' ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    const summary = page.getByRole('button', { name: '공항 설정 수정' })
    const choose = async (label, region, code) => {
      await page.locator('.apf').filter({ hasText: label }).first().locator('.apf-row').click()
      await page.locator('.apf-pop .apf-region').getByText(region, { exact: true }).click()
      await page.locator('.apf-pop .apf-chip').filter({ hasText: code }).click()
    }
    await choose('출발 공항', '대한민국', 'RKSS')
    await expect(summary).toContainText('김포')
    await choose('목적 공항', '일본', 'RJTT')
    await expect(summary).toContainText('RJTT')
    await expect(summary).toContainText('도쿄 하네다')
    await choose('출발 공항', '일본', 'RJAA')
    await expect(summary).toContainText('RJAA')
    await expect(summary).toContainText('도쿄 나리타')
  })

  for (const rule of ['IFR', 'VFR']) test(`${rule}: select airports, edit route, and open briefing directly`, async ({ page }, testInfo) => {
    await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: testInfo.project.name === 'mobile' ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    await page.getByRole('tab', { name: rule, exact: true }).click()
    const airport = async (label, code) => {
      await page.locator('.apf').filter({ hasText: label }).first().locator('.apf-row').click()
      const popover = page.locator('.apf-pop')
      await expect(popover).toBeVisible()
      const bounds = await popover.evaluate(el => {
        const rect = el.getBoundingClientRect()
        return { parent: el.parentElement.tagName, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, onTop: el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 10)) }
      })
      expect(bounds.parent).toBe('BODY')
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.width)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
      expect(bounds.onTop).toBe(true)
      if (bounds.height >= 456) {
        const regionList = popover.locator('.apf-regions')
        const regionsFit = await regionList.evaluate(el => el.scrollHeight <= el.clientHeight)
        expect(regionsFit).toBe(true)
      }
      await page.locator('.apf-pop .apf-chip').filter({ hasText: code }).click()
    }
    await airport('출발 공항', 'RKSS')
    await expect(page.getByRole('button', { name: '공항 설정 수정' })).toContainText('RKSS')
    await airport('목적 공항', 'RKPK')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await enterRouteTokens(page, rule === 'IFR' ? ['SEL'] : ['DCT'])
    await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled({ timeout: 20000 })
    await page.getByRole('button', { name: '다음', exact: true }).click()
    const altitude = page.getByRole('spinbutton', { name: '순항고도 (ft)' })
    await expect(page.getByRole('spinbutton', { name: '순항속도 (TAS, kt)' })).toHaveCount(1)
    await expect(page.locator('summary').filter({ hasText: '예상 도착시각' })).toHaveCount(0)
    await altitude.fill('9000')
    await page.getByRole('button', { name: '공항 설정 수정' }).click()
    await page.getByRole('button', { name: '수정 완료' }).click()
    await expect(altitude).toHaveValue('9000')
    let request
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/route-briefing')) request = r.postDataJSON() })
    await page.getByRole('button', { name: '브리핑 보기', exact: true }).click()
    await expect.poll(() => request?.plannedCruiseAltitudeFt).toBe(9000)
    await expect(page.getByRole('button', { name: '경로비교로' })).toHaveCount(0)
  })
})
