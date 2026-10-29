import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { createBriefing } from '../briefing-flow.mjs'
import { installMonitoringFixture, buildTafPayload } from '../monitoring-fixture.mjs'

function withReportTimes(briefing) {
  for (const airport of briefing.sections.current.airports) {
    airport.observationTime = '2026-10-28T23:30:00Z'
    airport.metar = { ...airport.metar, observation: { ...airport.metar?.observation,
      visibility: { value: 5000 }, display: { wind: '26009KT', weather: '-RA BR', clouds: 'FEW010 BKN030 OVC080', temperature: '18/16' } } }
    airport.tafWindow = { basis: airport.role === 'departure' ? 'ETD' : 'ETA', issued: '2026-10-28T23:00:00Z', time: briefing.meta.eta,
      at: { text: '29015G25KT 6000 -RA FEW010 BKN030 OVC080' },
      changes: [{ type: 'TEMPO', start: briefing.meta.etd, end: briefing.meta.eta, text: '29015G25KT 3500 -RA BR' }] }
  }
  briefing.sections.destination.sourceTaf = buildTafPayload({ now: new Date() }).airports.RKSI
  return briefing
}

// Overrides belong only to the report view; stored preferences and other clocks stay unchanged.
test.describe('report-timezone', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(version => {
      if (!localStorage.getItem('time_zone')) localStorage.setItem('time_zone', 'KST')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
  })

  test('airport reports convert independently and reset when reopened', async ({ page }, testInfo) => {
    await installMonitoringFixture(page, { now: new Date() })
    await page.route('**/api/metar', route => route.fulfill({ json: { airports: { RKSI: {
      header: { observation_time: '2026-10-28T23:30:00Z', raw_text: 'METAR RKSI 282330Z 27010KT 9999 BKN030 18/09 Q1012' },
      observation: { wind: { speed: 10 }, visibility: { value: 9999 }, clouds: [], weather: [], temperature: { air: 18, dewpoint: 9 } },
    } } } }))
    await page.goto('/?airport=RKSI')
    const panel = page.locator('.airport-panel')
    const metar = panel.getByRole('combobox', { name: 'METAR 표시 시간대', exact: true })
    const taf = panel.getByRole('combobox', { name: 'TAF 표시 시간대', exact: true })
    await expect(metar).toHaveValue('KST')
    const before = await panel.locator('#sec-metar .ap-sec-meta').innerText()
    expect(before).toContain('2026-10-29 08:30')
    const raw = await panel.locator('#sec-metar code').allTextContents()
    await metar.selectOption('UTC')
    await expect(panel.locator('#sec-metar')).toHaveAttribute('open', '')
    expect(await panel.locator('#sec-metar .ap-sec-meta').innerText()).not.toBe(before)
    await expect(panel.locator('#sec-metar .ap-sec-meta')).toContainText('2026-10-28 23:30')
    await expect(taf).toHaveValue('KST')
    expect(await panel.locator('#sec-metar code').allTextContents()).toEqual(raw)
    await taf.selectOption('UTC')
    if (testInfo.project.name !== 'desktop') await expect(panel.locator('#sec-taf th').first()).toHaveText('시간 (UTC)')
    expect(await page.evaluate(() => localStorage.getItem('time_zone'))).toBe('KST')
    await panel.screenshot({ path: testInfo.outputPath('airport-report-timezone.png') })
    await panel.getByRole('button', { name: '닫기', exact: true }).click()
    await page.goto('/?airport=RKSI')
    await expect(metar).toHaveValue('KST')
    await expect(taf).toHaveValue('KST')
    await page.evaluate(() => localStorage.setItem('time_zone', 'UTC'))
    await page.reload()
    await expect(metar).toHaveValue('UTC')
    await expect(taf).toHaveValue('UTC')
    await metar.selectOption('KST')
    await expect(taf).toHaveValue('UTC')
    expect(await page.evaluate(() => localStorage.getItem('time_zone'))).toBe('UTC')
  })

  test('document METAR and TAF convert without changing ETD or raw reports', async ({ page }, testInfo) => {
    await createBriefing(page, { patchBriefing: withReportTimes })
    const doc = page.locator('.briefing-view, .bv-mobile')
    const metar = doc.getByRole('combobox', { name: '브리핑 METAR 표시 시간대' })
    const taf = doc.getByRole('combobox', { name: '브리핑 TAF 표시 시간대' })
    await expect(metar).toHaveValue('KST')
    const current = doc.locator('[data-bvid="current"]')
    const before = await current.innerText()
    expect(before).toContain('10-29 08:30')
    const rawBefore = await current.locator('code').allTextContents()
    const flightBefore = await doc.locator('.bv-header').allTextContents()
    await metar.selectOption('UTC')
    expect(await current.innerText()).not.toBe(before)
    await expect(current).toContainText('10-28 23:30')
    expect(await current.locator('code').allTextContents()).toEqual(rawBefore)
    expect(await doc.locator('.bv-header').allTextContents()).toEqual(flightBefore)
    await expect(taf).toHaveValue('KST')
    await taf.selectOption('UTC')
    await expect(doc.locator('.ap-taf th').first()).toHaveText('시간 (UTC)')
    expect(await page.evaluate(() => localStorage.getItem('time_zone'))).toBe('KST')
    await doc.locator('[data-bvid="destination"]').screenshot({ path: testInfo.outputPath('document-taf-timezone.png') })
  })

  test('map airport cards have independent report clocks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '지도형 브리핑은 태블릿 가로 이상')
    let forecastTime
    await page.route('**/api/airports/*/history?*', route => {
      const type = new URL(route.request().url()).searchParams.get('type')
      const items = (type === 'metar' ? ['23:00', '22:30', '22:00', '21:30'] : ['17:00', '11:00']).map((time, index) => ({
        key: `${type}-${time}`, time: `2026-10-28T${time}:00Z`, kind: type === 'metar' ? (index === 1 ? 'SPECI' : 'METAR') : 'TAF',
        report: type === 'metar'
          ? { observation: { visibility: { value: 8000 }, clouds: [{ amount: 'SCT', base: 4000 }], display: { wind: '18005KT', clouds: 'SCT040', temperature: '17/15' } } }
          : { header: { valid_start: new Date(Date.parse(forecastTime) - 12 * 3600000).toISOString(), valid_end: new Date(Date.parse(forecastTime) + 12 * 3600000).toISOString() },
            timeline: [{ time: forecastTime, display: { wind: '18005KT', visibility: '8000', weather: 'NSW', clouds: 'SCT040' } }] },
      }))
      return route.fulfill({ json: { items } })
    })
    await createBriefing(page, { view: 'map', patchBriefing: briefing => { forecastTime = briefing.meta.eta; return withReportTimes(briefing) } })
    await page.getByRole('button', { name: '공항 카드 모두 펼치기', exact: true }).click()
    const card = page.locator('.mb-airport-card').first()
    const metar = card.getByRole('group', { name: /METAR 표시 시간대/ })
    const taf = card.getByRole('group', { name: /TAF 표시 시간대/ })
    const metarHistory = card.getByRole('group', { name: 'METAR 관측 회차', exact: true })
    const tafHistory = card.getByRole('group', { name: 'TAF 발표 회차', exact: true })
    await expect(metarHistory.getByRole('button')).toHaveCount(5)
    await expect(tafHistory.getByRole('button')).toHaveCount(3)
    await metarHistory.getByRole('button', { name: /SPECI/ }).click()
    await expect(card.locator('dd').first()).toContainText('18005KT')
    await expect(card.locator('dd').nth(1)).toContainText('29015G25KT')
    expect(await card.locator('.mb-ac-tac').first().evaluate(element => getComputedStyle(element).fontFamily)).toContain('monospace')
    expect((await metar.boundingBox()).height).toBeLessThanOrEqual(32)
    await expect(metarHistory.getByRole('button', { name: /SPECI/ })).toHaveAttribute('aria-pressed', 'true')
    await metarHistory.getByRole('button', { name: /최신/ }).click()
    await expect(card.locator('dd').first()).toContainText('26009KT')
    expect(await card.locator('.mb-ac-tac').first().textContent()).toBe('26009KT 5000 -RA BR FEW010 BKN030 OVC080 18/16')
    await tafHistory.getByRole('button').last().click()
    await expect(card.locator('dd').nth(1)).toContainText('18005KT')
    await tafHistory.getByRole('button', { name: /최신/ }).click()
    await expect(card.locator('dd').nth(1)).toContainText('29015G25KT')
    await expect(metar.getByRole('button', { name: 'KST', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const before = await card.locator('dt').first().innerText()
    await metar.getByRole('button', { name: 'UTC', exact: true }).click()
    expect(await card.locator('dt').first().innerText()).not.toBe(before)
    await expect(taf.getByRole('button', { name: 'KST', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const tafBefore = await card.locator('dt').nth(1).innerText()
    await taf.getByRole('button', { name: 'UTC', exact: true }).click()
    expect(await card.locator('dt').nth(1).innerText()).not.toBe(tafBefore)
    await expect(page.locator('.mb-airport-card').nth(1).getByRole('group', { name: /METAR 표시 시간대/ }).getByRole('button', { name: 'KST', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('time_zone'))).toBe('KST')
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const reportCard of await page.locator('.mb-airport-card').all()) {
      // Metadata stays together above the full-width report body.
      const rows = await reportCard.locator('.mb-ac-rows').evaluate(el => {
        const labels = [...el.querySelectorAll('dt')]
        return labels.map(label => ({
          fits: label.scrollWidth <= label.clientWidth,
          metadataFits: [...label.querySelectorAll('small')].every(meta => meta.getBoundingClientRect().right <= label.getBoundingClientRect().right + 1),
          aboveBody: label.getBoundingClientRect().bottom <= label.nextElementSibling.getBoundingClientRect().top + 1,
          metadataOneLine: [...label.querySelectorAll('small')].every(meta => meta.getBoundingClientRect().height <= 16),
        }))
      })
      expect(rows).toEqual([{ fits: true, metadataFits: true, aboveBody: true, metadataOneLine: true }, { fits: true, metadataFits: true, aboveBody: true, metadataOneLine: true }])
      const rect = await reportCard.boundingBox()
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.y + rect.height).toBeLessThanOrEqual(page.viewportSize().height)
      const dockTop = await page.locator('.mb-dock, .mb-dock-tab').evaluateAll(elements => Math.min(...elements
        .map(element => element.getBoundingClientRect()).filter(box => box.height > 0).map(box => box.top)))
      expect(rect.y + rect.height).toBeLessThanOrEqual(dockTop + 1)
    }
    await page.locator('.mb-airport-card').nth(1).screenshot({ path: testInfo.outputPath('airport-card-after.png') })
    await page.screenshot({ path: testInfo.outputPath('map-report-timezone.png') })
  })
})
