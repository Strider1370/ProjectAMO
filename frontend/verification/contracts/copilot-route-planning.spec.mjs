import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test, expect } from '../fixtures.mjs'
import { createFileRoutePlanningProvider } from '../../../backend/src/briefing/route-planning-provider.js'
import { planRoute } from '../../../shared/route-planning/planRoute.js'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const baseline = JSON.parse(await readFile(new URL('../../../shared/fixtures/route-planning-baseline.json', import.meta.url)))
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

test.describe('copilot-route-planning', () => {
  test('browser and server planning match all frozen pre-extraction domestic routes', async ({ page }) => {
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const provider = await createFileRoutePlanningProvider()
    for (const { input, expected } of baseline.cases) {
      const browser = await page.evaluate(async (input) => {
        const { planBrowserRoute } = await import('/src/features/route-briefing/lib/routePlanning.js')
        return planBrowserRoute(input)
      }, input)
      const server = await planRoute(input, provider)
      // Snapshot identity is environment-specific; the complete calculation isn't.
      expect({ ...browser, snapshotId: null }).toEqual({ ...server, snapshotId: null })
      expect(hash(browser.editor)).toBe(expected.editorHash)
      expect(hash(browser.routeGeometry)).toBe(expected.geometryHash)
      expect(hash(browser.routeModel)).toBe(expected.modelHash)
      expect(hash(browser.profileRequest)).toBe(expected.profileHash)
      expect(browser.eta).toBe(expected.eta)
    }
  })

  test('existing auto-generate UI applies the same procedure geometry and model as the server', async ({ page }, testInfo) => {
    const { input, expected } = baseline.cases[0]
    const server = await planRoute(input, await createFileRoutePlanningProvider())
    const requests = await installRouteBriefingFixtures(page)
    await page.route('**/api/metar', (route) => route.fulfill({ json: input.metarData }))
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    const weatherReady = page.waitForResponse((response) => response.url().endsWith('/api/metar') && response.ok())
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await weatherReady
    const isMobile = testInfo.project.name === 'mobile'
    await page.getByRole('button', { name: isMobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    if (isMobile) await page.getByRole('button', { name: /^절차·시간 입력 더보기/ }).click()
    await enterRouteTokens(page, ['RKSS', 'RKPC'])
    await page.getByRole('button', { name: '자동 생성', exact: true }).click()
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
    await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
    await expect(page.locator('.rtf-pill.is-fix').filter({ hasText: /^BULTI$/ })).toBeVisible()
    await expect(page.locator('.rtf-pill.is-fix').filter({ hasText: /^DOTOL$/ })).toBeVisible()
    await expect.poll(() => [...requests.single.keys()].some((key) => {
      const body = JSON.parse(key)
      return hash(body.routeGeometry) === expected.geometryHash && hash(body.routeModel) === expected.modelHash
    })).toBe(true)
    const applied = [...requests.single.keys()].map(JSON.parse).find((body) => hash(body.routeGeometry) === expected.geometryHash)
    expect(applied.routeModel).toEqual(server.routeModel)
    // UI uses the user's current ETD. Its generated elapsed time must still use
    // the exact same distance/TAS estimate as the fixed server input.
    expect(Date.parse(applied.eta) - Date.parse(applied.etd)).toBe(Date.parse(server.eta) - Date.parse(server.etd))
  })
})
