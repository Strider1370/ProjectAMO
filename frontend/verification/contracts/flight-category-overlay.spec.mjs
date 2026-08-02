import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 앱 기동은 echo-top.spec.mjs와 같은 패턴 — 온보딩·릴리스노트 패널을 먼저 지워야
// 사이드바 버튼이 가려지지 않는다.
//
// 시정/운고/관측지점은 모두 useFlightCategory → useKimSnapshotMeta의 공유 폴러에서 나온다.
// (예전엔 구독 시 refresh()를 즉시 부르지 않아 첫 자료가 60초 뒤에야 왔다 — commit
// 550096c로 고쳐져 이제는 구독과 동시에 한 번 받아온다.) syncFlightCategoryLayers는
// 토글 상태와 무관하게 자료가 오면 바로 지도 소스를 채우므로(MapView.jsx:1526),
// 그 소스에 도형이 들어왔는지를 실제로 기다린다 — 시간을 흉내 내지 않는다.
async function openWeatherPanel(page, testInfo) {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const src = window.__map?.getSource?.('flight-category-vis-source')
    return !!src?._data?.features?.length
  })
  const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  await page.locator(`[aria-label="${weatherEntry}"]`).first().click()
}

function panelToggle(page, testInfo) {
  const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  return page.locator(`[aria-label="${weatherEntry}"]`).first()
}

// 범례 독은 기본이 접혀 있다(weatherLegendOpen 초깃값 false) — 스와치·지점수·
// aria-pressed 하위 옵션 버튼이 모두 DOM에는 있지만 열기 전에는 접근성 트리에 없다.
async function revealLegends(page, testInfo) {
  // 패널이 열려 있으면 지도와 범례 버튼을 덮는다 — 먼저 닫는다.
  await panelToggle(page, testInfo).click()
  await page.getByRole('button', { name: '범례', exact: true }).click()
}

// 지도 locator의 toHaveScreenshot({clip})은 무시되고 캔버스 전체가 찍힌다 — page 기준
// clip을 쓰되, 지도 캔버스는 사이드바만큼 페이지 왼쪽에서 밀려 있으므로
// canvas의 boundingBox() 오프셋을 더해야 실제로 지점 위가 잘린다.
async function screenshotStation(page, [lon, lat], name) {
  const canvas = page.locator('.mapboxgl-canvas').first()
  const box = await canvas.boundingBox()
  await page.evaluate(([lon, lat]) => window.__map.jumpTo({ center: [lon, lat], zoom: 15 }), [lon, lat])
  await page.waitForTimeout(300)
  const point = await page.evaluate(([lon, lat]) => window.__map.project([lon, lat]), [lon, lat])
  await expect(page).toHaveScreenshot(name, {
    clip: { x: box.x + point.x - 24, y: box.y + point.y - 24, width: 48, height: 48 },
  })
}

test.describe('flight-category-overlay', () => {
  test('시정을 켜면 면이 나오고 끄면 사라진다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await expect(canvas).toBeVisible()
    await panelToggle(page, testInfo).click()
    await expect(canvas).toHaveScreenshot('vis-on.png')

    await panelToggle(page, testInfo).click()
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    await expect(canvas).toHaveScreenshot('vis-off.png')
  })

  test('운고는 윤곽선으로 나오고 시정과 구분된다 (운고 단독)', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    // 운고 단독 상태 — 위 스와치 행 없이 하위 옵션 버튼만 있는 것이 정상이다(범례 없음이 아니다).
    await expect(canvas).toHaveScreenshot('ceil-only.png')
  })

  test('시정과 운고를 함께 켜면 채움과 윤곽선이 겹쳐 보인다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    await expect(canvas).toHaveScreenshot('vis-and-ceil.png')
  })

  test('자료없음 표시는 기본이 꺼짐이고 켜면 화면이 바뀐다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const missing = page.getByRole('button', { name: /자료없음 표시/ })
    await expect(missing).toHaveAttribute('aria-pressed', 'false')

    const canvas = page.locator('.mapboxgl-canvas').first()
    await expect(canvas).toHaveScreenshot('missing-off.png')

    await missing.click()
    await expect(missing).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas).toHaveScreenshot('missing-on.png')
  })

  test('관측지점은 기본이 켜짐이고 개수를 적는다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const stations = page.getByRole('button', { name: /관측지점/ })
    await expect(stations).toHaveAttribute('aria-pressed', 'true')
    // 산출물(backend/data/flight_category_overlay/latest.json)은 지점 10곳을 낸다.
    await expect(stations).toHaveText(/관측지점 \d+곳/)
    // 화면 스크린샷은 여기 안 찍는다 — 이 상태(시정 on·자료없음 off·관측지점 on)는
    // missing-off.png가 이미 찍는 화면과 같다. 같은 그림을 두 파일로 남기면
    // 유지비만 늘고 신호는 늘지 않는다.
  })

  test('지도를 누르면 말풍선이 뜨고 자료 없는 항목은 "자료 없음"으로 적힌다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await expect(canvas).toBeVisible()
    // 클릭은 시정 채움 레이어(FC_VIS_LAYER)에 bind돼 있다 — 좌표가 실제 폴리곤 위여야
    // 팝업이 뜬다. 산출물의 severe 밴드 폴리곤 내부 지점(126.5E, 37.3N)을 골라
    // window.__map(개발모드에서 MapView가 노출)으로 화면 좌표로 바꾼다.
    const point = await page.evaluate(() => window.__map.project([126.5, 37.3]))
    await canvas.click({ position: { x: Math.round(point.x), y: Math.round(point.y) } })

    const popup = page.locator('.mapboxgl-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByText('추세')).toBeVisible()
  })

  // 모델보다 낮은 관측 지점은 흰 테두리로 표시된다(flightCategoryLayers.js의
  // circle-stroke-color, commit fac85b5). 예전엔 빨강이었는데, severe(저운고) 지점의
  // 채움색도 빨강이라 같은 색끼리 겹쳐 테두리가 안 보이는 문제가 있었다 — 6곳 중 5곳이
  // severe라 대부분 지점에서 무의미했다. 흰색은 severe(빨강)·caution(주황) 채움 모두와
  // 대비된다. 한 곳만 찍으면 "우연히 그 색에서만 보인다"는 반박이 가능해서 두 밴드를
  // 각각 하나씩 찍는다.
  test('모델보다 낮은 관측 지점은 흰 테두리로 표시된다 — severe(빨강) 채움', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    // asos_108 서울 — 운고 1,312ft, severe(빨강) 밴드, model_ceiling_ft=null이라
    // 결측 임계값(2,953ft) 미만이면 바로 테두리 대상이 된다(stationMarkerStyle).
    await screenshotStation(page, [126.9658, 37.57142], 'station-ring-severe.png')
  })

  test('모델보다 낮은 관측 지점은 흰 테두리로 표시된다 — caution(주황) 채움', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    // asos_184 제주 — 운고 2,625ft, caution(주황) 밴드. 같은 테두리 판정이지만
    // 채움색이 달라 흰 테두리가 severe 지점보다도 더 뚜렷이 갈린다.
    await screenshotStation(page, [126.52969, 33.51411], 'station-ring-caution.png')
  })
})
