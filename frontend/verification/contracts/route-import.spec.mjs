import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const multiRouteFile = fileURLToPath(new URL('../../test/fixtures/route-import/rksi-rkpk-multi.gpx', import.meta.url))
const importedWaypointFile = fileURLToPath(new URL('../../test/fixtures/route-import/rkss-rkpc-imported-waypoint.fpl', import.meta.url))

function fplWithProcedureSequences() {
  const points = [
    'RKSS', 'QD040', 'QD050', 'QD080', 'QD090', 'QD110', 'QD150', 'QD160', 'BULTI', 'MEKIL', 'NULDI',
    'DOTOL', 'CHUJA', 'PC726', 'BIROM', 'MANBA', 'PC621', 'PC622', 'PC623', 'PC624', 'PC625', 'PC626', 'DAKPI', 'PC628', 'PIMIK', 'YUMIN', 'VTF:', 'FF07', 'RW07', 'RKPC',
  ]
  const waypoint = (id) => `<waypoint><identifier>${id}</identifier><type>${id.startsWith('RK') ? 'AIRPORT' : 'INT'}</type><lat>35.000000</lat><lon>126.000000</lon></waypoint>`
  const routePoint = (id) => `<route-point><waypoint-identifier>${id}</waypoint-identifier><waypoint-type>${id.startsWith('RK') ? 'AIRPORT' : 'INT'}</waypoint-type></route-point>`
  return `<?xml version="1.0" encoding="UTF-8"?><flight-plan><waypoint-table>${points.map(waypoint).join('')}</waypoint-table><route>${points.map(routePoint).join('')}</route></flight-plan>`
}

test.describe('route-import', () => {
  test('imports the selected route from a multi-route GPX file', async ({ page }, testInfo) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
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
    // 경로는 이제 글자 칸의 값이 아니라 알약 목록이다. 불러온 경로가 양 끝 공항을 담고
    // 있는지를 알약으로 확인한다.
    await expect(page.locator('.rtf-pill').first()).toHaveText('RKSI')
    await expect(page.locator('.rtf-pill').last()).toHaveText('RKPK')
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
  })

  test('keeps an FPL waypoint absent from local navdata as a mapped coordinate', async ({ page }, testInfo) => {
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '브리핑', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    }

    await page.getByTestId('route-import-file').setInputFiles(importedWaypointFile)

    const qd040 = page.locator('.rtf-pill').filter({ hasText: 'QD040' })
    await expect(qd040).toHaveCount(1)
    await expect(qd040).not.toHaveClass(/is-error/)
    await expect(page.locator('.rtf-pill').filter({ hasText: 'Y711' })).toHaveCount(1)
    const briefingStep = testInfo.project.name === 'mobile'
      ? page.getByRole('button', { name: '브리핑 준비', exact: true })
      : page.getByRole('tab', { name: '브리핑 준비', exact: true })
    await expect(briefingStep).toBeEnabled()
    await expect.poll(() => page.evaluate(() => {
      const map = window.__map
      const data = map?.getSource('briefing-route-applied')?.serialize()?.data
      return data?.features?.find((feature) => feature.properties?.role === 'route-preview-line')?.geometry?.coordinates?.length ?? 0
    })).toBe(5)
  })

  test('replaces exact FPL procedure fix sequences with SID and STAR tokens', async ({ page }, testInfo) => {
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '브리핑', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    }

    await page.getByTestId('route-import-file').setInputFiles({
      name: 'rkss-rkpc-procedures.fpl',
      mimeType: 'application/xml',
      buffer: Buffer.from(fplWithProcedureSequences()),
    })

    await expect(page.locator('.rtf-pill').filter({ hasText: 'BULTI2Q' })).toHaveCount(1)
    await expect(page.locator('.rtf-pill').filter({ hasText: 'DOTOL2P' })).toHaveCount(1)
    await expect(page.locator('.rtf-pill').filter({ hasText: 'QD040' })).toHaveCount(0)
    await expect(page.locator('.rtf-pill').filter({ hasText: 'CHUJA' })).toHaveCount(0)
    const tokenTexts = await page.locator('.rtf-pill').allTextContents()
    expect(tokenTexts.indexOf('DOTOL2P')).toBeLessThan(tokenTexts.indexOf('VTF:'))
    await expect(page.getByText('DCT FIX를 찾을 수 없습니다.', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()
    await expect.poll(() => page.evaluate(() => {
      const data = window.__map?.getSource('briefing-route-applied')?.serialize()?.data
      const coordinates = data?.features?.find((feature) => feature.properties?.role === 'route-preview-line')?.geometry?.coordinates ?? []
      const dotol = coordinates.findIndex(([lon, lat]) => Math.abs(lon - 126.6101667) < 1e-4 && Math.abs(lat - 34.2542778) < 1e-4)
      return coordinates[dotol + 1]?.map((value) => Number(value.toFixed(6))) ?? null
    })).toEqual([126.583389, 33.996472])
  })
})
