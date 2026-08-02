import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import {
  FC_VIS_SOURCE, FC_VIS_LAYER, FC_CEIL_SOURCE, FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER,
  FC_STATION_SOURCE, FC_STATION_LAYER,
} from '../../src/features/weather-overlays/lib/flightCategoryLayers.js'

// ratio 0.02(=24,247px, monitoring-visual.spec.mjs와 같은 값)는 여기엔 너무 헐겁다 — 직접
// 재봤다: 정상 실행의 흔들림(안티에일리어싱)은 120~263px, 시정 면을 통째로 안 그리게 만들면
// (fill-opacity 0.35→0) 2,103px, 운고 채움+윤곽선을 둘 다 지우면(0.12→0, 2.5→0) 1,386px —
// 즉 신호가 잡음의 13배(운고)~16배(시정)밖에 안 된다. 절대 픽셀수로 700을 쓴다: 잡음
// 최댓값(263)의 2.7배 위, 가장 작은 신호(운고 1,386)의 절반 아래라 양쪽 다 여유가 남는다.
const SCREENSHOT_TOLERANCE = { maxDiffPixels: 700 }

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
// 48x48 자름은 픽셀 허용치로는 못 지킨다 — 몇 픽셀만 어긋나도 링이 있는지 없는지 자체가
// 바뀐다. 그래서 그림은 참고로 남기고, 판정은 window.__map에서 소스 속성과 paint 값을
// 직접 읽는 이 assert가 진다. 렌더링 흔들림에 흔들리지 않는다.
async function assertStationHasRing(page, [lon, lat]) {
  const { hasRing, strokeColor, strokeWidth } = await page.evaluate(([lon, lat, sourceId, layerId]) => {
    const src = window.__map.getSource(sourceId)
    const feature = src?._data?.features?.find((f) => {
      const [flon, flat] = f.geometry.coordinates
      return Math.abs(flon - lon) < 1e-3 && Math.abs(flat - lat) < 1e-3
    })
    return {
      hasRing: feature?.properties?.ring === true,
      strokeColor: window.__map.getPaintProperty(layerId, 'circle-stroke-color'),
      strokeWidth: window.__map.getPaintProperty(layerId, 'circle-stroke-width'),
    }
  }, [lon, lat, FC_STATION_SOURCE, FC_STATION_LAYER])

  expect(hasRing, '해당 관측지점 자료의 ring 속성이 true여야 한다').toBe(true)
  expect(strokeColor).toEqual(['case', ['boolean', ['get', 'ring'], false], '#ffffff', '#334155'])
  expect(strokeWidth).toEqual(['case', ['boolean', ['get', 'ring'], false], 3, 1.5])
}

// 픽셀 허용치(700)는 잡음은 삼키지만 신호(1,386px 이상)를 다 못 가리진 않는다는 걸 재서
// 확인했지만, 그 자체가 안전망은 아니다 — 그래서 화면과 별개로 소스에 도형이 들어왔는지,
// 레이어가 실제로 visible인지를 window.__map에서 직접 읽는다. 스크린샷이 못 잡는 경우에도
// 이 assert는 흔들리지 않는다.
async function assertLayerRendering(page, sourceId, layerIds, expectVisible) {
  const { hasFeatures, visibilities } = await page.evaluate(([sourceId, layerIds]) => {
    const src = window.__map.getSource(sourceId)
    return {
      hasFeatures: !!src?._data?.features?.length,
      visibilities: layerIds.map((id) => window.__map.getLayoutProperty(id, 'visibility')),
    }
  }, [sourceId, layerIds])

  if (expectVisible) {
    expect(hasFeatures, `${sourceId}에 도형 자료가 있어야 한다`).toBe(true)
    for (const v of visibilities) expect(v).toBe('visible')
  } else {
    for (const v of visibilities) expect(v).toBe('none')
  }
}

async function screenshotStation(page, [lon, lat], name) {
  const canvas = page.locator('.mapboxgl-canvas').first()
  const box = await canvas.boundingBox()
  await page.evaluate(([lon, lat]) => window.__map.jumpTo({ center: [lon, lat], zoom: 15 }), [lon, lat])
  // 고정 대기 대신 실제로 타일이 다 실렸는지를 기다린다 — 느린 호스트에서는 300ms 뒤에도
  // 타일이 안 실려 크롭이 빈 화면을 찍을 수 있다.
  await page.waitForFunction(() => window.__map.areTilesLoaded())
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
    await assertLayerRendering(page, FC_VIS_SOURCE, [FC_VIS_LAYER], true)
    await expect(canvas).toHaveScreenshot('vis-on.png', SCREENSHOT_TOLERANCE)

    await panelToggle(page, testInfo).click()
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_VIS_SOURCE, [FC_VIS_LAYER], false)
    await expect(canvas).toHaveScreenshot('vis-off.png', SCREENSHOT_TOLERANCE)
  })

  test('운고는 윤곽선으로 나오고 시정과 구분된다 (운고 단독)', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_CEIL_SOURCE, [FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER], true)
    // 운고 단독 상태 — 위 스와치 행 없이 하위 옵션 버튼만 있는 것이 정상이다(범례 없음이 아니다).
    await expect(canvas).toHaveScreenshot('ceil-only.png', SCREENSHOT_TOLERANCE)
  })

  test('시정과 운고를 함께 켜면 채움과 윤곽선이 겹쳐 보인다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_VIS_SOURCE, [FC_VIS_LAYER], true)
    await assertLayerRendering(page, FC_CEIL_SOURCE, [FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER], true)
    await expect(canvas).toHaveScreenshot('vis-and-ceil.png', SCREENSHOT_TOLERANCE)
  })

  test('자료없음 표시는 기본이 꺼짐이고 켜면 화면이 바뀐다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const missing = page.getByRole('button', { name: /자료없음 표시/ })
    await expect(missing).toHaveAttribute('aria-pressed', 'false')

    const canvas = page.locator('.mapboxgl-canvas').first()
    await expect(canvas).toHaveScreenshot('missing-off.png', SCREENSHOT_TOLERANCE)

    await missing.click()
    await expect(missing).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas).toHaveScreenshot('missing-on.png', SCREENSHOT_TOLERANCE)
  })

  test('관측지점은 기본이 켜짐이고 개수를 적는다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const stations = page.getByRole('button', { name: /관측지점/ })
    await expect(stations).toHaveAttribute('aria-pressed', 'true')
    // 산출물(backend/data/flight_category_overlay/latest.json)은 지점 10곳을 낸다.
    await expect(stations).toHaveText(/관측지점 \d+곳/)
    // 버튼 문구만으론 층이 실제로 켜졌는지 못 잡는다 — flightCategoryLayers.js:81의
    // 게이트(showStations && (showVisibility || showCeiling))가 항상 false로 깨져도
    // 버튼은 그대로 aria-pressed=true·"관측지점 N곳"을 보여준다. 소스·레이어를 직접 본다.
    await assertLayerRendering(page, FC_STATION_SOURCE, [FC_STATION_LAYER], true)
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
    // "추세"만 보이는 걸론 모든 행이 자료 없음으로 뭉개지거나 지점 줄이 통째로 빠지거나
    // 지점명이 이중 이스케이프돼도 통과한다. 산출물의 이 지점(126.5E, 37.3N)은
    // /api/weather/flight-category-overlay/point로 직접 확인한 값이다: 시정 3,800 m,
    // 최근접 지점 인천국제공항(결측 아님 — band(4265ft)='high'). 거리는 실제로는 클릭
    // 좌표를 픽셀로 반올림한 지점을 쓰므로(project→round→click) 18.5 km 근방에서
    // 흔들린다 — 정확한 소수점을 못 박지 않고 자리수 패턴으로만 지점 줄 자체를 확인한다.
    await expect(popup.getByText('3,800 m')).toBeVisible()
    await expect(popup.getByText(/인천국제공항 \d+\.\d km/)).toBeVisible()
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
    await assertStationHasRing(page, [126.9658, 37.57142])
    await screenshotStation(page, [126.9658, 37.57142], 'station-ring-severe.png')
  })

  test('모델보다 낮은 관측 지점은 흰 테두리로 표시된다 — caution(주황) 채움', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    // asos_184 제주 — 운고 2,625ft, caution(주황) 밴드. 같은 테두리 판정이지만
    // 채움색이 달라 흰 테두리가 severe 지점보다도 더 뚜렷이 갈린다.
    await assertStationHasRing(page, [126.52969, 33.51411])
    await screenshotStation(page, [126.52969, 33.51411], 'station-ring-caution.png')
  })

  // 이 branch의 핵심 안전 주장: 시정·운고·관측지점은 갱신 주기가 서로 다르므로(20분/하루
  // 네 번/매시) 각자 자기 발표 시각을 보여줘야 한다. MapView.jsx가 fcStamps.visibility/
  // .ceiling/.stations를 엉뚱한 층에 배선해도(예: 시정↔운고 스와핑) 단위 테스트·빌드·
  // 지금까지의 이 contract 어느 것도 잡지 못한다 — 조종사가 20분 전 시정을 6시간 묵은
  // 운고로 착각하게 되는 경로다(spec §5.1). 값은 산출물을 직접 읽어 고정했다
  // (backend/data/flight_category_overlay/latest.json: computed_at 2026-08-02T00:58:21Z
  // → KST 09:58, sources.kim.run 2026080106 → KST 15:00). 두 값이 다르다는 것과 각자
  // 자기 출처와 같다는 것을 모두 확인해야 스와핑도 "둘 다 같은 값으로 뭉개짐"도 잡는다.
  test('층별 시각 표시줄이 시정·운고 각자의 발표 시각을 보여준다 (배선 검증)', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await page.getByRole('button', { name: '운고', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const bar = page.locator('.layer-timestamp-bar')
    const header = bar.locator('.layer-timestamp-header span').first()
    const issueCell = bar.locator('.layer-timestamp-cell').first()

    await expect(header).toHaveText('시정')
    await expect(issueCell).toContainText('09:58')

    await bar.getByRole('button', { name: '다음 기상 레이어' }).click()
    await expect(header).toHaveText('운고')
    await expect(issueCell).toContainText('15:00')
  })
})
