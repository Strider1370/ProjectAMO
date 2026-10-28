import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { createBriefing } from '../briefing-flow.mjs'
import { installMonitoringFixture, buildTafPayload } from '../monitoring-fixture.mjs'

function withReportTimes(briefing) {
  for (const airport of briefing.sections.current.airports) {
    airport.observationTime = '2026-10-28T23:30:00Z'
    airport.tafWindow = { basis: airport.role === 'departure' ? 'ETD' : 'ETA', issued: '2026-10-28T23:00:00Z', time: briefing.meta.eta, at: { text: '27010KT 9999 BKN030' }, changes: [] }
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
    await createBriefing(page, { view: 'map', patchBriefing: withReportTimes })
    await page.getByRole('button', { name: '공항 카드 모두 펼치기', exact: true }).click()
    const card = page.locator('.mb-airport-card').first()
    const metar = card.getByRole('combobox', { name: /METAR 표시 시간대/ })
    const taf = card.getByRole('combobox', { name: /TAF 표시 시간대/ })
    await expect(metar).toHaveValue('KST')
    const before = await card.locator('dt').first().innerText()
    await metar.selectOption('UTC')
    expect(await card.locator('dt').first().innerText()).not.toBe(before)
    await expect(taf).toHaveValue('KST')
    const tafBefore = await card.locator('dt').nth(1).innerText()
    await taf.selectOption('UTC')
    expect(await card.locator('dt').nth(1).innerText()).not.toBe(tafBefore)
    await expect(page.locator('.mb-airport-card').nth(1).getByRole('combobox', { name: /METAR 표시 시간대/ })).toHaveValue('KST')
    expect(await page.evaluate(() => localStorage.getItem('time_zone'))).toBe('KST')
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const reportCard of await page.locator('.mb-airport-card').all()) {
      const rect = await reportCard.boundingBox()
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.y + rect.height).toBeLessThanOrEqual(page.viewportSize().height)
    }
    await page.screenshot({ path: testInfo.outputPath('map-report-timezone.png') })
  })
})
