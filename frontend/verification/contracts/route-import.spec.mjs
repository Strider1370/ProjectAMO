import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'

const multiRouteFile = fileURLToPath(new URL('../../test/fixtures/route-import/rksi-rkpk-multi.gpx', import.meta.url))

test.describe('route-import', () => {
  test('imports the selected route from a multi-route GPX file', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '브리핑', exact: true }).click()
      await page.getByRole('button', { name: 'VFR', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
      await page.getByRole('tab', { name: 'VFR', exact: true }).click()
    }

    await page.getByTestId('route-import-file').setInputFiles(multiRouteFile)

    const plannedRoute = page.getByRole('button', { name: '계획 경로 · 계획 경로 · 3점', exact: true })
    await expect(plannedRoute).toBeVisible()
    await expect(page.getByRole('button', { name: '실제 비행 궤적 · 실제 궤적 · 3점', exact: true })).toBeVisible()

    await plannedRoute.click()
    await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /도착.*RKPK/ })).toBeVisible()
    const routeDraft = testInfo.project.name === 'mobile'
      ? page.getByRole('textbox', { name: /VFR 초안 경로/ })
      : page.getByRole('textbox', { name: '예: RKSI DCT GONAX DCT RKPK' })
    await expect(routeDraft).toHaveValue(/RKSI.*RKPK/)
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
  })
})
