import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

test.describe('briefing-simple-flow', () => {
  test('manual route entry keeps focus during recalculation and applies selected procedures', async ({ page }, testInfo) => {
    await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    let release
    const pending = new Promise(resolve => { release = resolve })
    let hold = true
    let exposureRequests = 0
    await page.route('**/api/briefing/route-exposure', async route => {
      exposureRequests += 1
      if (hold) await pending
      await route.fallback()
    })
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: testInfo.project.name === 'mobile' ? '브리핑' : '비행 전 브리핑', exact: true }).click()
      for (const [label, code] of [['출발 공항', 'RKSS'], ['목적 공항', 'RKPC']]) {
        await page.locator('.apf').filter({ hasText: label }).first().locator('.apf-row').click()
        await page.locator('.apf-pop .apf-chip').filter({ hasText: code }).click()
      }
      await page.getByRole('button', { name: '다음', exact: true }).click()
      const input = page.locator('.rtf-input')
      await input.fill('SEL')
      await input.press('Enter')
      await expect(input).toBeFocused()
      await expect(input).toBeEnabled()
      await input.fill('GONAX')
      await input.press('Enter')
      await expect(input).toBeFocused()
      await expect.poll(() => exposureRequests).toBeGreaterThan(0)
      await input.fill('BEDES')
      await input.press('Enter')
      await expect(input).toBeFocused()
      hold = false
      release()
      await expect(page.locator('.rtf-status-right')).toContainText('NM', { timeout: 20000 })
      await expect(page.locator('.rtf-pill').filter({ hasText: 'BEDES' })).toHaveCount(1)
      if (testInfo.project.name === 'mobile') return
      await page.getByText('출발·도착 절차 설정', { exact: true }).click()
      for (const index of [0, 1]) {
        const box = page.locator('.rb-plan-details').getByRole('combobox').nth(index)
        await expect(async () => {
          await box.click()
          const option = page.getByRole('option').nth(1)
          if (!await option.isVisible()) { await page.keyboard.press('Escape'); throw new Error('waiting for procedures') }
          await option.click()
        }).toPass({ timeout: 15000 })
      }
      await expect(page.getByLabel('자동 연결된 대표 접근절차')).toContainText('RWY')
      await expect.poll(() => page.evaluate(() => {
        const source = window.__map?.getSource('procedure-preview')?.serialize?.()?.data
        return (source?.features || []).filter(f => f.geometry.type === 'LineString' && ['sid-line', 'star-line'].includes(f.properties.role)).map(f => f.properties.role).sort()
      })).toEqual(['sid-line', 'star-line'])
      await expect.poll(() => page.evaluate(() => {
        const map = window.__map
        const proc = map?.getSource('procedure-preview')?.serialize?.()?.data?.features || []
        const applied = map?.getSource('briefing-route-applied')?.serialize?.()?.data?.features || []
        const line = applied.find(f => f.properties?.role === 'route-preview-line')?.geometry.coordinates || []
        const sequence = role => proc.find(f => f.properties?.role === role)?.geometry.coordinates || []
        const contained = coords => coords.length > 1 && coords.every((point, i) => {
          const start = line.findIndex(p => p[0] === coords[0][0] && p[1] === coords[0][1])
          return start >= 0 && line[start + i]?.[0] === point[0] && line[start + i]?.[1] === point[1]
        })
        const pending = map?.getSource('briefing-route-pending')?.serialize?.()?.data?.features || []
        return { sid: contained(sequence('sid-line')), star: contained(sequence('star-line')), iap: contained(sequence('iap-line')), pending: pending.filter(f => f.geometry.type === 'LineString').length, sidColor: map?.getPaintProperty('procedure-sid-line', 'line-color'), starColor: map?.getPaintProperty('procedure-star-line', 'line-color') }
      })).toEqual({ sid: true, star: true, iap: true, pending: 0, sidColor: '#2563eb', starColor: '#7c3aed' })
      // 선택된 절차가 적용 경로에 반영되기 전에는 다음 단계로 진행할 수 없다.
      await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled({ timeout: 20000 })
    } finally { hold = false; release() }
  })
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
    await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version); localStorage.setItem('projectamo.briefingView', 'document') }, CURRENT_VERSION)
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
    if (testInfo.project.name !== 'mobile') await expect(page.locator('[data-map-briefing="true"]')).toBeVisible()
    await expect(page.getByRole('button', { name: '경로비교로' })).toHaveCount(0)
  })
})
