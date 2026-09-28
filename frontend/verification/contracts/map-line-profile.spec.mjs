import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

test('map-line-profile: 지도에서 그린 선으로 비행경로 없이 연직단면도를 연다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'ipad-landscape', '터치 지도 입력은 모바일 계약에서 확인')
  const terrainRequests = []
  const weatherRequests = []
  await page.route('**/api/vertical-profile', async (route) => {
    const payload = route.request().postDataJSON()
    terrainRequests.push(payload)
    const coordinates = payload.routeGeometry.coordinates
    await route.fulfill({ json: {
      axis: { totalDistanceNm: 12, samples: coordinates.map(([lon, lat], index) => ({ index, lon, lat, distanceNm: index * 6 })) },
      terrain: { unit: 'm', values: coordinates.map((_, index) => ({ index, elevationM: 100 + index * 20 })) },
      markers: payload.routeMarkers.map((marker, index) => ({ ...marker, distanceNm: index * 6 })),
      flightPlan: null,
      candidateProfiles: [],
    } })
  })
  await page.route('**/api/briefing/cross-section', async (route) => {
    const payload = route.request().postDataJSON()
    weatherRequests.push(payload)
    const hf = payload.hf ?? 0
    await route.fulfill({ json: {
      run: { tmfc: '2026092700', hf, validTime: hf === 0 ? '2026-09-27T00:00:00Z' : '2026-09-27T06:00:00Z' },
      availableTimes: [
        { tmfc: '2026092700', hf: 0, validTime: '2026-09-27T00:00:00Z' },
        { tmfc: '2026092700', hf: 6, validTime: '2026-09-27T06:00:00Z' },
      ],
      levels: [],
    } })
  })
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '지도 도구' })).toHaveCount(0)
  await page.getByRole('button', { name: '연직단면도', exact: true }).click()
  if (testInfo.project.name === 'desktop') {
    const buttonBox = await page.getByRole('button', { name: '항공정보', exact: true }).boundingBox()
    const panelBox = await page.locator('.map-profile-panel').boundingBox()
    expect(panelBox.x).toBe(buttonBox.x)
    expect(panelBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height)
  }
  await page.waitForFunction(() => window.__map?.getSource('mt-measure'))
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => {
      for (const [lng, lat] of [[126.5, 37], [127, 37.2], [127.5, 37.1]]) {
        window.__map.fire('click', { lngLat: { lng, lat }, originalEvent: { detail: 1 } })
      }
    })
  } else {
    for (const position of [{ x: 320, y: 460 }, { x: 390, y: 520 }, { x: 470, y: 580 }]) {
      await page.locator('.mapboxgl-canvas').click({ position })
    }
  }
  await expect(page.getByText('총 거리')).toBeVisible()
  await page.getByRole('button', { name: '선 완료' }).click()
  await page.getByRole('button', { name: '연직단면도 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '연직단면도' })
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox.y).toBeLessThan(page.viewportSize().height - 120)
  expect(dialogBox.y + dialogBox.height).toBeGreaterThan(0)
  await expect(dialog.locator('.vertical-profile-chart svg').first()).toBeVisible()
  await expect(dialog).not.toContainText('선택 순항고도')
  expect(terrainRequests).toHaveLength(1)
  expect(terrainRequests[0].terrainOnly).toBe(true)
  expect(terrainRequests[0].plannedCruiseAltitudeFt).toBeUndefined()
  expect(terrainRequests[0].routeGeometry.coordinates).toHaveLength(3)
  expect(weatherRequests).toHaveLength(1)
  await dialog.getByRole('button', { name: '다음 예보시간' }).click()
  await expect.poll(() => weatherRequests.length).toBe(2)
  expect(weatherRequests[1].hf).toBe(6)
})
