import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function open(page) {
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function showLayoutLegend(page) {
  // The isolated map fixture has no active weather data, so the real dock is empty.
  // Add a control to exercise its layout without depending on an upstream frame.
  await page.locator('.map-bottom-control-dock').evaluate((dock) => {
    const control = document.createElement('button')
    control.type = 'button'
    control.textContent = '범례'
    dock.append(control)
  })
}

test('map-navigation-tools: 지도에는 정보·단면도만 두고 내 지도에서 간편 측정한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 사이드바 및 지도 측정 흐름')
  await open(page)
  const labels = await page.locator('.sidebar-menu-list > .sidebar-icon-button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  expect(labels).toEqual(['검색', '비행 전 브리핑', '내 지도', '기관 라운지', 'NOTAM', 'ADS-B', '상황판'])
  const controls = page.locator('.mobile-map-layer-btns > button')
  for (const name of ['항공정보', '기상정보', '연직단면도']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  const controlBoxes = await controls.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))
  expect(controlBoxes.every((box) => box.width === 54)).toBe(true)
  expect(controlBoxes[0].y).toBe(controlBoxes[1].y)
  expect(controlBoxes[1].y).toBe(controlBoxes[2].y)
  expect(controlBoxes[0].right).toBeLessThan(controlBoxes[1].left)
  expect(controlBoxes[1].right).toBeLessThan(controlBoxes[2].left)
  await expect(page.getByRole('button', { name: '지도 도구' })).toHaveCount(0)
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
  const activeControlBox = await controls.first().boundingBox()
  expect(activeControlBox.x).toBe(controlBoxes[0].x)
  await expect.poll(async () => (await page.locator('.my-map-panel').boundingBox()).y)
    .toBeGreaterThan(activeControlBox.y + activeControlBox.height)
  await page.getByRole('tab', { name: '간편 측정' }).click()
  await page.getByRole('tab', { name: '거리' }).click()
  await page.waitForFunction(() => window.__map?.getSource('mt-measure'))
  for (const position of [{ x: 1000, y: 380 }, { x: 1080, y: 440 }]) await page.locator('.mapboxgl-canvas').click({ position })
  await expect(page.getByText('총 거리')).toBeVisible()
  await page.getByRole('button', { name: '측정 완료' }).click()
  await page.getByRole('button', { name: '선으로 저장' }).click()
  await expect(page.getByRole('tab', { name: '저장 지도' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '연직단면도 보기' })).toBeVisible()
  await expect(page.getByText('측정 선', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/진북 \d+° · 자북 \d+°/).first()).toBeVisible()
})

test('map-navigation-tools: 아이패드에서는 가로 버튼 아래에 패널이 열린다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-landscape', '아이패드 가로 배치 확인')
  await open(page)
  const controls = page.locator('.mobile-map-layer-btns > button')
  await expect(controls).toHaveCount(3)
  const boxes = await controls.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))
  expect(boxes.every((box) => box.width === 54)).toBe(true)
  expect(boxes[0].y).toBe(boxes[1].y)
  expect(boxes[1].y).toBe(boxes[2].y)
  expect(boxes[0].right).toBeLessThan(boxes[1].left)
  expect(boxes[1].right).toBeLessThan(boxes[2].left)
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  const weatherPanel = page.locator('.layer-drawer').first()
  await expect(weatherPanel).toBeVisible()
  await expect.poll(async () => (await weatherPanel.boundingBox()).y).toBeGreaterThan(boxes[0].bottom)
  expect((await controls.first().boundingBox()).x).toBe(boxes[0].x)
})

test('map-navigation-tools: 범례는 좌측 하단에 두고 정보 패널 높이를 제한한다', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'ipad-landscape'].includes(testInfo.project.name), '데스크톱·아이패드 배치 확인')
  await open(page)
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  await showLayoutLegend(page)
  await page.locator('.map-view-wrapper').evaluate((wrapper) => wrapper.style.setProperty('--legend-popover-height', '118px'))
  const panel = page.locator('.layer-drawer').first()
  const panelBox = await panel.boundingBox()
  const dockBox = await page.locator('.map-bottom-control-dock').boundingBox()
  expect(Math.abs(dockBox.x - panelBox.x)).toBeLessThan(12)
  expect(panelBox.y + panelBox.height).toBeLessThan(dockBox.y - 118)
})

test('map-navigation-tools: 지도 모드는 줌 조작 아래에 놓이고 메뉴는 위로 열린다', async ({ page }) => {
  await open(page)
  const mode = page.locator('.basemap-switcher-toggle')
  const navigation = page.locator('.mapboxgl-ctrl-bottom-right > .mapboxgl-ctrl:has(.mapboxgl-ctrl-zoom-in)')
  await expect(mode).toBeVisible()
  await expect(navigation).toBeVisible()
  const modeBox = await mode.boundingBox()
  const navigationBox = await navigation.boundingBox()
  expect(modeBox.y - (navigationBox.y + navigationBox.height)).toBeGreaterThanOrEqual(6)
  expect(modeBox.y - (navigationBox.y + navigationBox.height)).toBeLessThanOrEqual(14)
  expect(Math.abs(modeBox.x + modeBox.width - navigationBox.x - navigationBox.width)).toBeLessThan(2)
  await mode.click()
  const menu = page.getByRole('menu', { name: '지도 선택' })
  await expect(menu).toBeVisible()
  expect((await menu.boundingBox()).y + (await menu.boundingBox()).height).toBeLessThan(modeBox.y)
})

test('map-navigation-tools: 좁은 화면에서는 패널을 스크롤하고 범례 자리를 남긴다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '좁은 데스크톱 배치 확인')
  await page.setViewportSize({ width: 900, height: 900 })
  await open(page)
  await page.getByRole('button', { name: '사이드바 펼치기' }).click()
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  await showLayoutLegend(page)
  const panel = page.locator('.layer-drawer').first()
  const mapBox = await page.locator('.map-view-wrapper').boundingBox()
  await expect.poll(async () => (await panel.boundingBox()).y + (await panel.boundingBox()).height)
    .toBeLessThan(mapBox.y + mapBox.height - 180)
  const dockBox = await page.locator('.map-bottom-control-dock').boundingBox()
  expect(dockBox.x).toBeLessThan((await panel.boundingBox()).x + 100)
  const body = panel.locator('.layer-drawer-body')
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
})

test('map-navigation-tools: 내 지도 면 도구에서 좌표로 꼭짓점을 추가한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '내 지도 작성 데스크톱 흐름')
  await open(page)
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
  await page.getByRole('button', { name: '새 지도 그리기' }).click()
  await page.getByRole('button', { name: '면', exact: true }).click()
  for (const [lat, lng] of [[37, 126], [37, 126.1], [37.1, 126.1]]) {
    await page.getByRole('textbox', { name: '위도' }).fill(String(lat))
    await page.getByRole('textbox', { name: '경도' }).fill(String(lng))
    await page.getByRole('button', { name: '점 추가' }).click()
  }
  await expect(page.getByText('면 · 3개 점 입력됨')).toBeVisible()
  await page.getByRole('button', { name: '도형 완료' }).click()
  await expect(page.getByRole('region', { name: '항목 속성 수정' })).toBeVisible()
})

test('map-navigation-tools: 모바일 지도 버튼 세 개와 더보기 ADS-B', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '모바일 배치 확인')
  await open(page)
  const controls = page.locator('.mobile-map-layer-btns > button')
  await expect(controls).toHaveCount(3)
  expect(await controls.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))).toEqual(['항공정보 레이어', '기상정보 레이어', '연직단면도'])
  const boxes = await controls.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))
  expect(boxes[0].x).toBe(boxes[1].x)
  expect(boxes[1].x).toBe(boxes[2].x)
  expect(boxes[0].bottom).toBeLessThan(boxes[1].top)
  expect(boxes[1].bottom).toBeLessThan(boxes[2].top)
  await page.getByRole('button', { name: '더보기', exact: true }).click()
  await expect(page.getByRole('button', { name: '내 지도' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ADS-B' })).toBeVisible()
})
