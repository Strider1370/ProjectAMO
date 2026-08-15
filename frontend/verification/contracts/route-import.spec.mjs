import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const multiRouteFile = fileURLToPath(new URL('../../test/fixtures/route-import/rksi-rkpk-multi.gpx', import.meta.url))

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
})
