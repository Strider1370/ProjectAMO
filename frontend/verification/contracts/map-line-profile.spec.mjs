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
      axis: { totalDistanceNm: (coordinates.length - 1) * 6, samples: coordinates.map(([lon, lat], index) => ({ index, lon, lat, distanceNm: index * 6 })) },
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
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '지도 도구' })).toHaveCount(0)
  await page.getByRole('button', { name: '연직단면도', exact: true }).click()
  const panel = page.locator('.map-profile-panel')
  await expect(panel).toContainText('연직단면도 만들기')
  await expect(panel).toContainText('시작 전')
  await expect(panel.getByRole('button', { name: '점을 더 선택하세요' })).toBeDisabled()
  const altitudeInput = page.getByRole('spinbutton', { name: '설정 고도 (ft)' })
  await expect(altitudeInput).toHaveValue('10000')
  await altitudeInput.fill('12000')
  if (testInfo.project.name === 'desktop') {
    const buttonBox = await page.getByRole('button', { name: '항공정보', exact: true }).boundingBox()
    const panelBox = await panel.boundingBox()
    expect(panelBox.x).toBe(buttonBox.x)
    expect(panelBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height)
  }
  await page.waitForFunction(() => window.__map?.getSource('mt-measure'))
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => {
      for (const [lng, lat] of [[126.5, 37], [127, 37.2], [127.5, 37.1], [128, 37.3]]) {
        window.__map.fire('click', { lngLat: { lng, lat }, originalEvent: { detail: 1 } })
      }
    })
  } else {
    for (const position of [{ x: 320, y: 460 }, { x: 390, y: 520 }, { x: 470, y: 580 }, { x: 540, y: 620 }]) {
      await page.locator('.mapboxgl-canvas').click({ position })
    }
  }
  await expect(page.getByText('총 거리')).toBeVisible()
  await expect(panel).toContainText('그리는 중')
  await expect(panel.locator('.map-profile-progress-label')).toHaveText(['시작', 'WP1', 'WP2', 'WP3'])
  await expect(panel.locator('.map-profile-segments')).toHaveCount(0)
  await panel.getByRole('button', { name: '구간 거리 보기' }).click()
  await expect(panel.locator('.map-profile-segments > div')).toHaveCount(3)
  if (testInfo.project.name === 'mobile') {
    const panelBox = await panel.boundingBox()
    const actionBox = await panel.getByRole('button', { name: '이 경로로 단면도 열기' }).boundingBox()
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
  }
  const confirmedPath = await page.evaluate(() => {
    window.__map.fire('mousemove', { lngLat: { lng: 130, lat: 30 }, originalEvent: new MouseEvent('mousemove', { clientX: 900, clientY: 700 }) })
    return window.__map.getSource('mt-measure')._data.features.find((feature) => feature.geometry.type === 'LineString')?.geometry.coordinates
  })
  expect(confirmedPath).toHaveLength(4)
  await expect(page.getByRole('button', { name: '선 완료' })).toHaveCount(0)
  await page.getByRole('button', { name: '이 경로로 단면도 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '연직단면도' })
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox.y).toBeLessThan(page.viewportSize().height - 120)
  expect(dialogBox.y + dialogBox.height).toBeGreaterThan(0)
  await expect(dialog.locator('.vertical-profile-chart svg').first()).toBeVisible()
  const referenceLine = dialog.locator('.vertical-profile-reference-line')
  await expect(referenceLine).toHaveCount(1)
  expect(await referenceLine.evaluate((element) => getComputedStyle(element).stroke)).not.toBe('none')
  await expect(dialog).toContainText('설정 고도')
  await expect(dialog).toContainText('12,000 ft')
  expect(await dialog.locator('.vertical-profile-marker-label').allTextContents()).toEqual(['시작', 'WP1', 'WP2', '끝'])
  expect(await dialog.locator('.vertical-profile-axis-label').allTextContents()).not.toContain('50000')
  await expect(dialog).not.toContainText('선택 순항고도')
  expect(terrainRequests).toHaveLength(1)
  expect(terrainRequests[0].terrainOnly).toBe(true)
  expect(terrainRequests[0].plannedCruiseAltitudeFt).toBeUndefined()
  expect(terrainRequests[0].routeGeometry.coordinates).toHaveLength(4)
  expect(terrainRequests[0].routeMarkers.map((marker) => marker.label)).toEqual(['시작', 'WP1', 'WP2', '끝'])
  expect(weatherRequests).toHaveLength(1)
  await dialog.getByRole('button', { name: '다음 예보시간' }).click()
  await expect.poll(() => weatherRequests.length).toBe(2)
  expect(weatherRequests[1].hf).toBe(6)
})

test('map-line-profile: 아이패드에서 단면도 패널은 상단 버튼 아래에 열린다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-landscape', '아이패드 가로 배치 확인')
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  const button = page.getByRole('button', { name: '연직단면도', exact: true })
  await button.click()
  const panel = page.locator('.map-profile-panel')
  await expect(panel).toBeVisible()
  const buttonBox = await button.boundingBox()
  const panelBox = await panel.boundingBox()
  expect(panelBox.x).toBe((await page.getByRole('button', { name: '항공정보', exact: true }).boundingBox()).x)
  expect(panelBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height)
  await expect(panel.getByRole('spinbutton', { name: '설정 고도 (ft)' })).toBeVisible()
})
