import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import {
  FC_VIS_SOURCE, FC_VIS_LAYER, FC_CEIL_SOURCE, FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER,
  FC_STATION_SOURCE, FC_STATION_LAYER,
} from '../../src/features/weather-overlays/lib/flightCategoryLayers.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const OVERLAY_FIXTURE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'flight-category-overlay.json'), 'utf8'))
const POINT_FIXTURE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'flight-category-overlay-point.json'), 'utf8'))

// 전체화면 비교는 걷어냈다. 기준 이미지 6장이 시험 순서에 기대고 있었다 — 단독 실행하면
// 매번 ~3,600픽셀 어긋나고, 전체 실행에서는 앞 시험이 타일을 미리 받아둔 덕에 우연히
// 통과했다. 타일 로딩과 idle까지 기다려도 남았다. 애초에 이 비교들은 값을 못 하고
// 있었다: 부분 회귀는 700픽셀 아래로 숨고, 층이 통째로 사라지는 경우는 아래
// assertLayerRendering이 이미 결정적으로 잡는다. 흔들리는 시험은 결국 무시당하고,
// 무시당하는 시험은 없는 것만 못하다.
// 화면 증거는 지점 확대 2장(station-ring-*)으로 남는다 — 48x48이라 안정적이고,
// 흰 테두리를 지우면 실제로 실패하는 것이 확인돼 있다.

// 이 계약은 원래 이미 떠 있는 실서비스 backend(port 3001)에 CONTRACT_REUSE_SERVER=1로
// 붙어 있었다. 그런데 그 서버는 실제 KMA 자료를 계속 폴링한다(testMode:false) — 시정·
// 운고·관측지점이 매 주기 바뀐다. 그날의 실측에 맞춰 못 박은 좌표·시각·픽셀 값은
// 다음 폴링에서 어긋난다: 관측소가 다른 밴드로 옮겨가고, 스크린샷 기준 이미지이 다른
// 시정/운고 격자와 비교되고, 층별 시각이 그날의 실제 값과 달라진다.
// echo-top.spec.mjs가 이미 쓰는 방식대로 두 API 문 앞에서 응답을 가로챈다(page.route) —
// 이 뒤로는 화면이 실제 backend가 무엇을 들고 있든 완전히 같은 자료를 본다.
async function installFixture(page) {
  await page.route('**/api/weather/flight-category-overlay', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(OVERLAY_FIXTURE),
  }))
  // 클릭 좌표와 무관하게 같은 값을 준다 — echo-top-point와 같은 방식. 지도 어디를
  // 눌러도 팝업 내용이 결정적이다(실제 sampleQueryGrid를 흉내 낼 필요가 없다).
  await page.route('**/api/weather/flight-category-overlay/point*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(POINT_FIXTURE),
  }))
}

// 앱 기동은 echo-top.spec.mjs와 같은 패턴 — 온보딩·릴리스노트 패널을 먼저 지워야
// 사이드바 버튼이 가려지지 않는다.
async function openWeatherPanel(page, testInfo) {
  await installFixture(page)
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

/** 소스에서 좌표로 지점을 찾아 fill 값을 읽는다 — 링과 같은 원칙(직접 읽기, 그림에 안 맡김). */
async function stationFill(page, [lon, lat]) {
  return page.evaluate(([lon, lat, sourceId]) => {
    const src = window.__map.getSource(sourceId)
    const feature = src?._data?.features?.find((f) => {
      const [flon, flat] = f.geometry.coordinates
      return Math.abs(flon - lon) < 1e-3 && Math.abs(flat - lat) < 1e-3
    })
    return feature?.properties?.fill ?? null
  }, [lon, lat, FC_STATION_SOURCE])
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

    await panelToggle(page, testInfo).click()
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_VIS_SOURCE, [FC_VIS_LAYER], false)
  })

  test('운고는 윤곽선으로 나오고 시정과 구분된다 (운고 단독)', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_CEIL_SOURCE, [FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER], true)
    // 운고 단독 상태 — 위 스와치 행 없이 하위 옵션 버튼만 있는 것이 정상이다(범례 없음이 아니다).
  })

  test('시정과 운고를 함께 켜면 채움과 윤곽선이 겹쳐 보인다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await page.getByRole('button', { name: '운고', exact: true }).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await panelToggle(page, testInfo).click()
    await assertLayerRendering(page, FC_VIS_SOURCE, [FC_VIS_LAYER], true)
    await assertLayerRendering(page, FC_CEIL_SOURCE, [FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER], true)
  })

  test('자료없음 표시는 기본이 꺼짐이고 켜면 화면이 바뀐다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const missing = page.getByRole('button', { name: /자료없음 표시/ })
    await expect(missing).toHaveAttribute('aria-pressed', 'false')

    const canvas = page.locator('.mapboxgl-canvas').first()

    await missing.click()
    await expect(missing).toHaveAttribute('aria-pressed', 'true')
  })

  test('관측지점은 기본이 켜짐이고 개수를 적는다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const stations = page.getByRole('button', { name: /관측지점/ })
    await expect(stations).toHaveAttribute('aria-pressed', 'true')
    // 개수는 sources.stations.asos + amos의 합이다(legendStamps.js) — 고정 자료의
    // fixture 값(asos:3, amos:1)과 같다.
    await expect(stations).toHaveText('관측지점 4곳')
    // 버튼 문구만으론 층이 실제로 켜졌는지 못 잡는다 — flightCategoryLayers.js:81의
    // 게이트(showStations && (showVisibility || showCeiling))가 항상 false로 깨져도
    // 버튼은 그대로 aria-pressed=true·"관측지점 N곳"을 보여준다. 소스·레이어를 직접 본다.
    await assertLayerRendering(page, FC_STATION_SOURCE, [FC_STATION_LAYER], true)
    // 화면 스크린샷은 여기 안 찍는다 — 이 상태(시정 on·자료없음 off·관측지점 on)는
    // missing-off.png가 이미 찍는 화면과 같다. 같은 그림을 두 파일로 남기면
    // 유지비만 늘고 신호는 늘지 않는다.
  })

  // 결측(자료를 못 낸) 지점은 아예 그리지 않는다 — 그리면 고장난 관측소가 "OK"로
  // 읽힌다(spec §2 "결측은 여전히 안 그린다"). fixture의 fx_missing은 stations[]에는
  // 있지만 sky_clear도 아니고 ceiling_ft도 결측이라 toStationFeatures가 걸러낸다.
  test('결측 지점(fx_missing)은 소스에 도형으로 들어오지 않는다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const found = await page.evaluate(([lon, lat, sourceId]) => {
      const src = window.__map.getSource(sourceId)
      return !!src?._data?.features?.find((f) => {
        const [flon, flat] = f.geometry.coordinates
        return Math.abs(flon - lon) < 1e-3 && Math.abs(flat - lat) < 1e-3
      })
    }, [128.9, 37.6, FC_STATION_SOURCE])

    expect(found, 'fx_missing 지점은 결측이므로 소스에 없어야 한다').toBe(false)
  })

  test('지도를 누르면 말풍선이 뜨고 자료 없는 항목은 "자료 없음"으로 적힌다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    await expect(canvas).toBeVisible()
    // fixture의 'below' 밴드 폴리곤 중심(127.5, 37.3) — 어느 관측지점과도 겹치지 않아
    // 이 클릭은 반드시 면 팝업(FC_VIS_LAYER)이 잡는다.
    const point = await page.evaluate(() => window.__map.project([127.5, 37.3]))
    await canvas.click({ position: { x: Math.round(point.x), y: Math.round(point.y) } })

    const popup = page.locator('.mapboxgl-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByText('4,200 m')).toBeVisible()
    // 운고(격자 결측)와 추세(결측) 둘 다 "자료 없음"으로 적힌다 — 두 줄이 나온다.
    await expect(popup.getByText('자료 없음')).toHaveCount(2)
    // 근접 관측지점 줄 — 이 지점은 흰 테두리 대상(ring:true)이라 강조돼 있어야 한다.
    const nearestLine = popup.getByText(/픽스주황링 \d+\.\d km/)
    await expect(nearestLine).toBeVisible()
    await expect(nearestLine).toHaveCSS('color', 'rgb(220, 38, 38)')
  })

  // 모델보다 낮은 관측 지점은 흰 테두리로 표시된다(flightCategoryLayers.js의
  // circle-stroke-color, commit fac85b5). 예전엔 빨강이었는데, severe(저운고) 지점의
  // 채움색도 빨강이라 같은 색끼리 겹쳐 테두리가 안 보이는 문제가 있었다 — 흰색은
  // severe(빨강)·caution(주황) 채움 모두와 대비된다. 한 곳만 찍으면 "우연히 그 색에서만
  // 보인다"는 반박이 가능해서 두 밴드를 각각 하나씩 찍는다.
  test('모델보다 낮은 관측 지점은 흰 테두리로 표시된다 — severe(빨강) 채움', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    // fx_severe_ring — 운고 800ft(severe), model_ceiling_ft=null이면 결측 임계값 미만
    // 조건 없이 바로 테두리 대상이 된다(stationMarkerStyle의 modelBand==='missing' 분기).
    await assertStationHasRing(page, [126.5, 37.3])
    expect(await stationFill(page, [126.5, 37.3])).toBe('severe')
    await screenshotStation(page, [126.5, 37.3], 'station-ring-severe.png')
  })

  test('모델보다 낮은 관측 지점은 흰 테두리로 표시된다 — caution(주황) 채움', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()
    // fx_caution_ring — 운고 2,000ft(caution), model_ceiling_ft 3,500ft(high)로 차이가
    // 200ft를 넘어 테두리 대상이 된다(stationMarkerStyle의 lowerByBand 분기).
    await assertStationHasRing(page, [126.9, 37.6])
    expect(await stationFill(page, [126.9, 37.6])).toBe('caution')
    await screenshotStation(page, [126.9, 37.6], 'station-ring-caution.png')
  })

  // sky_clear/900 m 초과 관측은 초록(fill='good')으로 그려진다(flightCategoryStations.js
  // FILL_BY_BAND.high). 화면 색만 보면 안티에일리어싱과 구분이 안 되므로 소스 자료를
  // 직접 읽는다 — assertLayerRendering과 같은 원칙(window.__map에서 직접 확인).
  test('초록(fill=good) 관측지점이 실제로 소스에 들어온다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    expect(await stationFill(page, [127.9, 37.6]), "fx_good은 fill='good'이어야 한다").toBe('good')

    // 자료의 fill 속성만 보면 색을 바꿔도 안 잡힌다(실제로 #16a34a를 #dc2626으로 바꿔
    // 돌려봤더니 그대로 통과했다). 실제로 칠해지는 색까지 읽는다 — 링 시험과 같은 원칙.
    const circleColor = await page.evaluate(
      (layerId) => window.__map.getPaintProperty(layerId, 'circle-color'), FC_STATION_LAYER)
    expect(circleColor).toEqual(['match', ['get', 'fill'],
      'severe', '#dc2626', 'caution', '#f97316', 'good', '#16a34a', 'rgba(0,0,0,0)'])
  })

  // 점 팝업은 formatStationLines가 낸다 — 이름·출처, 운고(또는 구름 없음), 그 지점이
  // 실측한 시정(격자값이 아니다, spec §3.1), 관측 시각. fixture의 첫 지점(fx_severe_ring)을
  // 소스에서 그대로 읽어 좌표를 픽셀로 바꾼다 — 값을 다시 손으로 안 적는다.
  test('점을 누르면 그 관측소의 말풍선이 뜨고 이름·운고·시정이 보인다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    const station = await page.evaluate((sourceId) => {
      const src = window.__map.getSource(sourceId)
      const f = src?._data?.features?.[0]
      return f ? { name: f.properties.name, coords: f.geometry.coordinates } : null
    }, FC_STATION_SOURCE)
    expect(station, '관측지점 자료가 있어야 한다').toBeTruthy()

    const point = await page.evaluate((coords) => window.__map.project(coords), station.coords)
    await canvas.click({ position: { x: Math.round(point.x), y: Math.round(point.y) } })

    const popup = page.locator('.mapboxgl-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByText(station.name, { exact: false })).toBeVisible()
    // 테두리 지점은 값("약 800 ft")과 주석("모델 구름 없음")이 둘 다 걸린다 —
    // 주석의 '구름 없음'까지 같은 정규식에 맞아서다. 첫 번째가 운고 값 칸이다.
    await expect(popup.getByText(/구름 없음|약 [\d,]+ ft/).first()).toBeVisible()
    await expect(popup.getByText(/[\d,]+ m|자료 없음/).first()).toBeVisible()
  })

  // Task 4가 면 클릭 핸들러에 넣은 bail(queryRenderedFeatures on FC_STATION_LAYER)이
  // 실제로 동작하는지 확인한다 — 면 팝업(formatPointLines)은 항상 '추세' 줄을 낸다.
  // 점 팝업(formatStationLines)엔 그 줄이 없다. fx_severe_ring은 severe 시정 폴리곤
  // 안쪽에 자리하도록 fixture를 짰다 — 이 클릭이 면 층에도 실제로 걸리는 채로
  // 점 팝업이 이기는지를 증명한다(면 층 위에 아무것도 없으면 "안 겹쳐서 당연히
  // 점 팝업"이라는 반박이 가능해진다).
  test('관측지점 위를 누르면 점 팝업이 뜨고 면 팝업(추세 줄)은 뜨지 않는다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const canvas = page.locator('.mapboxgl-canvas').first()
    const point = await page.evaluate(() => window.__map.project([126.5, 37.3]))
    await canvas.click({ position: { x: Math.round(point.x), y: Math.round(point.y) } })

    const popup = page.locator('.mapboxgl-popup')
    await expect(popup).toBeVisible()
    await expect(popup.getByText('픽스빨강링', { exact: false })).toBeVisible()
    await expect(popup.getByText('추세')).not.toBeVisible()
  })

  // WeatherLegends.jsx의 station key — Task 5 Part A. 게이트는 지점 층이 실제로 켜지는
  // 조건과 같다(showFlightCategoryStations && (시정 또는 운고)). 시정만 켜고 확인한다.
  test('범례에 관측지점 키(빨강·주황·초록·흰 테두리)가 나온다', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await revealLegends(page, testInfo)

    const key = page.locator('.hlegend').filter({ has: page.locator('.hlegend-title', { hasText: '관측지점' }) })
    await expect(key).toBeVisible()
    await expect(key.getByText('450 m 미만')).toBeVisible()
    await expect(key.getByText('450~900 m')).toBeVisible()
    await expect(key.getByText('900 m 초과')).toBeVisible()
    await expect(key.locator('.hlegend-note')).toContainText('흰 테두리')
  })

  // 이 branch의 핵심 안전 주장: 시정·운고·관측지점은 갱신 주기가 서로 다르므로(20분/하루
  // 네 번/매시) 각자 자기 발표 시각을 보여줘야 한다. MapView.jsx가 fcStamps.visibility/
  // .ceiling/.stations를 엉뚱한 층에 배선해도(예: 시정↔운고 스와핑) 단위 테스트·빌드·
  // 지금까지의 이 contract 어느 것도 잡지 못한다 — 조종사가 20분 전 시정을 6시간 묵은
  // 운고로 착각하게 되는 경로다(spec §5.1). 값은 fixture에서 고정했다: computed_at
  // 2026-08-02T08:58:00Z → KST 17:58, sources.kim.run 2026080106 → KST 15:00. 두 값이
  // 다르다는 것과 각자 자기 출처와 같다는 것을 모두 확인해야 스와핑도 "둘 다 같은
  // 값으로 뭉개짐"도 잡는다.
  test('층별 시각 표시줄이 시정·운고 각자의 발표 시각을 보여준다 (배선 검증)', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '시정', exact: true }).click()
    await page.getByRole('button', { name: '운고', exact: true }).click()
    await panelToggle(page, testInfo).click()

    const bar = page.locator('.layer-timestamp-bar')
    const header = bar.locator('.layer-timestamp-header span').first()
    const issueCell = bar.locator('.layer-timestamp-cell').first()

    await expect(header).toHaveText('시정')
    await expect(issueCell).toContainText('17:58')

    await bar.getByRole('button', { name: '다음 기상 레이어' }).click()
    await expect(header).toHaveText('운고')
    await expect(issueCell).toContainText('15:00')
  })
})
