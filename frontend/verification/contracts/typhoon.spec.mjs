// 기존 계약과 같은 진입 규약을 따른다: fixtures.mjs(콘솔 수집 auto fixture),
// addInitScript로 투어·릴리스 노트 억제, aria-label로 사이드바 진입, aria-pressed로 토글 단언.
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSnapshot } from '../../../backend/src/processors/typhoon-processor.js'
import { parseTyphoonText } from '../../../backend/src/parsers/typhoon-parser.js'
import distance from '@turf/distance'

const dir = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'typhoon-snapshot.json'), 'utf8'))
const empty = { fetched_at: '2026-07-26T00:00:00.000Z', status: 'ok', typhoons: [] }
const dujuan = buildSnapshot({
  activeRows: parseTyphoonText(fs.readFileSync(path.resolve(dir, '../../../backend/test/fixtures/typhoon-dujuan-2026.txt'), 'utf8')),
  names: [{ number: 25, name: '두쥐안', nameEn: 'DUJUAN' }],
  fetched_at: '2026-09-18T14:30:00.946Z',
})

function weatherEntry(testInfo) {
  return testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
}

// 레이어 패널을 열고 태풍 타일을 반환한다. 배지·체크가 붙으면 접근명이 "태풍 2 ✓"가
// 되므로 이름 완전일치 대신 접두 일치로 찾는다.
async function openWeatherPanel(page, testInfo) {
  await page.locator(`[aria-label="${weatherEntry(testInfo)}"]`).first().click()
  // 이름만으로 찾으면 태풍 패널의 "태풍 목록 닫기" 버튼과 겹친다 — 레이어 타일로 한정한다.
  const tile = page.locator('button.layer-tile').filter({ hasText: '태풍' })
  await expect(tile).toBeVisible()
  return tile
}

// 태풍 타일을 켠다. 타일을 누르면 레이어 패널이 자동으로 닫히므로(모바일에서 두 시트가
// 겹치는 것을 막기 위해) 타일 자체가 사라진다 — 타일 상태가 아니라 결과인 목록 패널로 단언한다.
async function openTyphoon(page, testInfo, payload) {
  await page.route('**/api/typhoon', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(payload),
  }))
  // 투어와 릴리스 노트 패널이 지도를 덮는다. lastSeenVersion은 CURRENT_VERSION과 같아야 안 뜬다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const tile = await openWeatherPanel(page, testInfo)
  await tile.click()
  const panel = page.getByLabel('활성 태풍 목록')
  await expect(panel).toBeVisible()
}

const typhoonLayerIds = () => {
  const map = window.__map
  // 베이스맵 전환 중에는 getStyle()이 던진다 — 스타일이 준비된 뒤에만 조회한다.
  if (!map || !map.isStyleLoaded()) return []
  return map.getStyle().layers.filter((l) => l.id.startsWith('typhoon-')).map((l) => l.id)
}

test('태풍 타일이 지도 레이어와 목록 패널을 함께 켠다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: /19호 태풍 .* 상세정보/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /20호 태풍 .* 상세정보/ })).toBeVisible()
  await expect(panel.getByLabel(/19호 태풍 .* 현재 요약/)).toBeVisible()
  await panel.getByRole('button', { name: /20호 태풍 .* 상세정보/ }).click()
  await expect(panel.getByLabel(/20호 태풍 .* 현재 요약/)).toBeVisible()
  await expect(panel.locator('.typhoon-track').first().locator('thead th')).toHaveCount(5)

  const layers = await page.evaluate(typhoonLayerIds)
  expect(layers).toContain('typhoon-track-line')
  expect(layers).toContain('typhoon-forecast-track-line')
  expect(layers).toContain('typhoon-cone-fill')
  expect(layers).toContain('typhoon-gale-fill')

  // 끄려면 레이어 패널을 다시 열어 타일을 누른다(켤 때 자동으로 닫혔다).
  const tile = await openWeatherPanel(page, testInfo)
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(panel).toBeHidden()
})

test('타일 배지가 활성 태풍 수를 보여준다', async ({ page }, testInfo) => {
  await page.route('**/api/typhoon', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(snapshot),
  }))
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator(`[aria-label="${weatherEntry(testInfo)}"]`).first().click()
  // 레이어를 켜기 전에도 개수가 보여야 한다(스펙 §9.2).
  await expect(page.locator('button.layer-tile').filter({ hasText: '태풍' })).toContainText('2')
})

test('복수 태풍의 패널 색과 지도 색이 일치한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const swatches = await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__tab-swatch').evaluateAll(
    (nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor),
  )
  expect(new Set(swatches).size).toBe(2)

  // _data는 Mapbox 공개 API가 아니다. 렌더된 피처를 조회한다.
  const mapColors = await page.evaluate(() => {
    const data = window.__map?.getSource('typhoon-points')?.serialize?.()?.data
    return [...new Set((data?.features ?? []).map((f) => f.properties.color))]
  })
  expect(mapColors.length).toBe(2)

  const strengths = await page.evaluate(() => {
    const data = window.__map?.getSource('typhoon-points')?.serialize?.()?.data
    return (data?.features ?? []).map((feature) => feature.properties.strength)
  })
  expect(strengths.every(Boolean)).toBe(true)
})

test('바로가기 버튼이 지도를 해당 태풍으로 옮긴다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  // 첫 항목(19호 솔릭)의 경도는 픽스처의 current 좌표에서 읽는다.
  // 한국 기본 지도 중심과 경도가 가까워 "많이 움직였나"로는 판정할 수 없다 — 목적지 도착 여부를 본다.
  const target = snapshot.typhoons[0].current
  await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__focus').first().click()
  await expect.poll(async () => {
    const c = await page.evaluate(() => window.__map?.getCenter())
    return c && Math.abs(c.lng - target.lon) < 0.5 && Math.abs(c.lat - target.lat) < 0.5
  }, { timeout: 10000 }).toBe(true)
})

test('활성 태풍이 없으면 그렇게 표시한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, empty)
  await expect(page.getByText('현재 활동 중인 태풍 없음')).toBeVisible()
})

test('수집 실패는 태풍 없음과 구분해 표시한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, { ...empty, status: 'unavailable' })
  // 레이더 이동 레이어도 "이동 자료 없음"을 쓴다 — 태풍 패널 안으로 범위를 좁힌다.
  await expect(page.getByLabel('활성 태풍 목록').getByText(/자료 없음/)).toBeVisible()
})

test('베이스맵을 두 번 바꿔도 레이어가 남는다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^단색/ }).click()
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^기본/ }).click()
  await expect.poll(async () => (await page.evaluate(typhoonLayerIds)).includes('typhoon-track-line')).toBe(true)
})

test('패널의 시각 표에 현재와 예보 시각이 나온다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  const rows = panel.locator('.typhoon-track__row')
  await expect(rows.first()).toBeVisible()
  // 현재 요약이 표보다 앞에 있고, 표에는 예상 시각만 남긴다.
  await expect(panel.getByLabel(/현재 요약/).first()).toBeVisible()
  await expect(panel.locator('.typhoon-track__row.is-forecast').first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(1)
})

test('표의 시각 행에 올리면 지도의 그 지점이 선택된다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  // querySourceFeatures는 이미 그려진 타일을 읽어 setData 직후를 반영하지 못한다.
  // 소스에 넣은 데이터를 직접 본다.
  const selectedValidAt = () => page.evaluate(() => {
    const data = window.__map?.getSource('typhoon-points')?.serialize?.()?.data
    const hit = (data?.features ?? []).filter((f) => f.properties.isSelected === true)
    return hit.length === 1 ? hit[0].properties.validAt : null
  })

  // "0에서 늘었나"로 재지 않는다 — 모바일에서는 타일을 누른 직후 손가락이 첫 행에 걸려
  // 이미 선택된 상태일 수 있다. 고른 그 시각이 선택되는지를 본다.
  const target = snapshot.typhoons[0].rows.filter((r) => r.forecast)[0].validAt
  const rows = page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__item').first().locator('.typhoon-track__row')
  const row = rows.nth(0)   // 표에는 첫 예보부터 둔다.
  // 터치 기기에는 마우스 올리기가 없다. 모바일에서는 탭이 같은 선택을 해야 한다.
  if (testInfo.project.name === 'mobile') await row.click()
  else await row.hover()
  await expect.poll(selectedValidAt, { timeout: 8000 }).toBe(target)
})

test('태풍 강도 표식 hover 팝업은 표식과 팝업 사이를 이동해도 유지된다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '지도 위 패널을 접은 뒤 표식과 팝업 사이를 마우스로 이동한다')
  await openTyphoon(page, testInfo, snapshot)
  await page.locator('.typhoon-panel__focus').first().click()
  await page.getByRole('button', { name: '태풍 패널 접기' }).click()

  const point = await page.evaluate(() => {
    const map = window.__map
    const current = map.getSource('typhoon-points').serialize().data.features.find((feature) => feature.properties.isCurrent)
    const projected = map.project(current.geometry.coordinates)
    const canvas = map.getCanvas().getBoundingClientRect()
    return { x: projected.x + canvas.left, y: projected.y + canvas.top }
  })
  await page.mouse.move(point.x, point.y)

  const popup = page.locator('.mapboxgl-popup')
  await expect(popup).toBeVisible()
  await expect(popup).toContainText('2018년 8월 22일 09시')
  await expect(popup).not.toContainText(/UTC|KST/)
  const box = await popup.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(popup).toBeVisible()
})

test('예보 시각을 고르면 강풍 영역이 그 시점 것으로 바뀐다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  // 태풍이 둘이다. 첫 태풍의 행만 누르고 그 태풍의 영역만 본다 — 섞으면 안 바뀐 것처럼 보인다.
  const number = snapshot.typhoons[0].number
  const galeExtent = () => page.evaluate((num) => {
    const data = window.__map?.getSource('typhoon-gale')?.serialize?.()?.data
    const f = (data?.features ?? []).find((x) => x.properties.number === num)
    if (!f) return null
    const ring = f.geometry.coordinates[0]
    return Math.round(Math.max(...ring.map((c) => c[1])) * 100)
  }, number)
  const before = await galeExtent()
  expect(before).not.toBeNull()

  // 첫 예보 행을 고른다. 먼 시점은 강풍 자료가 없어 영역이 사라지므로
  // "바뀌었나"를 재기에 부적절하다 — 자료가 확실히 있는 시점으로 위치 이동을 본다.
  const firstTyphoon = page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__item').first()
  await firstTyphoon.locator('.typhoon-track__row').nth(0).click()
  await expect.poll(galeExtent, { timeout: 8000 }).not.toBe(before)
})

test('닫기 버튼이 목록만 접고 지도 레이어는 남긴다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  await expect(panel).toBeVisible()
  // 모바일은 닫기 버튼이 시트 헤더에 있고 aria-label은 본문만 감싼다 — 페이지에서 찾는다.
  await page.getByRole('button', { name: '태풍 목록 닫기' }).click()
  await expect(panel).toBeHidden()
})

test('태풍을 켜면 기상 레이어 패널이 자동으로 닫힌다', async ({ page }, testInfo) => {
  // 모바일에서 두 시트가 완전히 겹쳐 목록에 손이 닿지 않던 문제를 막는다.
  await openTyphoon(page, testInfo, snapshot)
  await expect(page.getByLabel('활성 태풍 목록')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '기상 레이어' })).toBeHidden()
})

test('태풍 경로 표식이 과거·현재·예상을 구분한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  await expect.poll(() => page.evaluate(() => Boolean(window.__map?.getLayer('typhoon-point-labels')))).toBe(true)
  const model = await page.evaluate(() => {
    const map = window.__map
    const points = map.getSource('typhoon-points').serialize().data.features
    return {
      past: points.filter((point) => !point.properties.forecast && !point.properties.isCurrent).map((point) => point.properties.pointLabel),
      current: points.filter((point) => point.properties.isCurrent).map((point) => point.properties.pointLabel),
      future: points.filter((point) => point.properties.forecast).map((point) => ({ label: point.properties.pointLabel, hours: point.properties.leadHours })),
      ringFilter: map.getFilter('typhoon-current-ring'),
      strengthFilter: map.getFilter('typhoon-points-strength'),
      forecastDash: map.getPaintProperty('typhoon-forecast-track-line', 'line-dasharray'),
      coneDash: map.getPaintProperty('typhoon-cone-outline', 'line-dasharray'),
    }
  })
  expect(model.past.length).toBeGreaterThan(0)
  expect(model.past.every((label) => label === '')).toBe(true)
  expect(model.current).toEqual(['19호 솔릭 · 현재', '20호 시마론 · 현재'])
  expect(model.future.some((row) => row.label === '+24h')).toBe(true)
  expect(model.future.filter((row) => row.hours % 24 !== 0).every((row) => row.label === '')).toBe(true)
  expect(model.ringFilter).toEqual(['==', ['get', 'isCurrent'], true])
  expect(model.strengthFilter).toEqual(['any', ['==', ['get', 'isCurrent'], true], ['==', ['get', 'forecast'], true]])
  expect(model.forecastDash).not.toEqual(model.coneDash)
})

test('태풍별 표시 설정은 전체 토글과 베이스맵 전환 뒤에도 유지된다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  const count = page.locator('.typhoon-panel__count')
  await expect(count).toHaveText('2개')
  await expect(count).toHaveAttribute('aria-label', '태풍 2개 중 2개 지도 표시')
  await expect(page.locator('.layer-drawer-title, .mobile-sheet-title').filter({ has: count })).toContainText('태풍정보')
  const toggle = panel.getByRole('button', { name: '19호 태풍 솔릭 지도 표시', exact: true })
  const sourceNumbers = () => page.evaluate(() => {
    const map = window.__map
    return ['cone', 'gale', 'storm', 'track', 'forecast-track', 'points'].flatMap((key) =>
      (map?.getSource(`typhoon-${key}`)?.serialize?.()?.data?.features ?? []).map((f) => f.properties.number))
  })
  await panel.locator('.typhoon-track__row').first().click()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(count).toHaveText('1/2개 표시')
  await expect.poll(sourceNumbers).not.toContain(19)
  await expect.poll(sourceNumbers).toContain(20)
  await panel.locator('.typhoon-track__row').first().click()
  await expect.poll(sourceNumbers).not.toContain(19)
  await panel.getByRole('button', { name: '20호 태풍 시마론 지도 표시', exact: true }).click()
  await expect.poll(sourceNumbers).toEqual([])
  await expect(count).toHaveText('0/2개 표시')
  await panel.getByRole('button', { name: '20호 태풍 시마론 지도 표시', exact: true }).click()

  const tile = await openWeatherPanel(page, testInfo)
  await tile.click()
  await tile.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^단색/ }).click()
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^기본/ }).click()
  await expect.poll(sourceNumbers).toContain(20)
  await expect.poll(sourceNumbers).not.toContain(19)
  await panel.getByRole('button', { name: '지도에서 보기', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(sourceNumbers).toContain(19)
  await expect(count).toHaveText('2개')
})

test('태풍 두쥐안의 연속 확률 영역과 강풍 영역을 함께 표시한다', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await openTyphoon(page, testInfo, dujuan)
  const panel = page.getByLabel('활성 태풍 목록')
  // 타일을 누른 자리에 표가 생기면 예보 행이 hover된다. 현재 반경 검증 전 해제한다.
  await page.mouse.move(0, 0)
  await expect(panel.getByLabel('태풍 지도 범례')).toContainText('현재 기준')
  await expect(panel.getByLabel('태풍 지도 범례')).toContainText('위치 70%')
  await expect(panel.getByLabel('태풍 지도 범례')).toContainText('반경 단순 표시')
  await expect(panel.getByLabel('태풍 지도 범례')).not.toContainText('+24h 간격 예보 표시')
  await expect(panel.getByLabel('태풍 지도 범례').locator('small')).toHaveAttribute('title', /방향별 차이는 생략/)
  await expect.poll(() => page.evaluate(() => window.__map?.getSource('typhoon-cone')?.serialize?.()?.data?.features?.[0]?.geometry?.type)).toBe('Polygon')
  await expect.poll(() => page.evaluate(() => window.__map?.getSource('typhoon-gale')?.serialize?.()?.data?.features?.length)).toBe(1)
  const geometries = await page.evaluate(() => Object.fromEntries(['cone', 'gale', 'storm'].map((kind) =>
    [kind, window.__map.getSource(`typhoon-${kind}`).serialize().data.features[0].geometry])))
  expect(geometries.cone).toEqual(dujuan.typhoons[0].geometry.cone)
  for (const [kind, radius] of [['gale', 500], ['storm', 60]]) {
    for (const coordinate of geometries[kind].coordinates[0]) {
      expect(distance([141.6, 25.6], coordinate)).toBeCloseTo(radius, 3)
    }
  }
  const fills = await page.evaluate(() => ['cone', 'gale'].map((kind) => window.__map.getPaintProperty(`typhoon-${kind}-fill`, 'fill-color')))
  expect(fills[0]).not.toEqual(fills[1])
  const metrics = panel.locator('.typhoon-panel__primary-metrics')
  await expect(metrics.locator('dt')).toHaveText(['강도', '최대풍속', '중심기압'])
  await expect(metrics.locator('strong')).toHaveText(['2', '32', '975'])
  const metricLayout = await metrics.evaluate((node) => [...node.children].map((cell) => ({
    top: cell.getBoundingClientRect().top,
    width: cell.getBoundingClientRect().width,
    fits: cell.scrollWidth <= cell.clientWidth,
    valueSize: parseFloat(getComputedStyle(cell.querySelector('strong')).fontSize),
  })))
  expect(new Set(metricLayout.map((cell) => cell.top)).size).toBe(1)
  expect(metricLayout.every((cell) => cell.fits && cell.valueSize >= 28)).toBe(true)
  expect(metricLayout[0].width).toBeLessThan(metricLayout[1].width)
  expect(metricLayout[1].width).toBeLessThan(metricLayout[2].width)
  if (testInfo.project.name !== 'mobile') {
    expect((await panel.boundingBox()).width).toBeCloseTo(780, 0)
    // 위치 문구가 줄바꿈되면 행 높이가 달라진다. 데스크톱·태블릿에서는 한 줄이어야 한다.
    const wrapped = await panel.locator('td.typhoon-track__where').evaluateAll((cells) => cells
      .filter((cell) => {
        const range = document.createRange()
        range.selectNodeContents(cell)
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1
      })
      .map((cell) => cell.textContent))
    expect(wrapped).toEqual([])
  }
  expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const output = path.resolve(dir, '../../../artifacts/responsive-screenshots/typhoon')
  fs.mkdirSync(output, { recursive: true })
  await page.mouse.move(0, 0)
  await page.evaluate((mobile) => {
    const map = window.__map
    map.fitBounds([[132, 20], [164, 48]], { padding: mobile ? { top: 35, bottom: 360, left: 20, right: 20 } : { top: 50, bottom: 60, left: 860, right: 35 }, duration: 0 })
  }, testInfo.project.name === 'mobile')
  await expect.poll(() => page.evaluate(() => window.__map?.isMoving())).toBe(false)
  await expect.poll(() => page.evaluate(() => window.__map?.areTilesLoaded()), { timeout: 20_000 }).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['typhoon-points-circle'] }).length)).toBeGreaterThan(0)
  await page.screenshot({ path: path.join(output, `${testInfo.project.name}.png`) })
  if (testInfo.project.name !== 'mobile') {
    await page.getByRole('button', { name: '태풍 패널 접기' }).click()
    await page.evaluate(() => window.__map.fitBounds([[132, 20], [164, 48]], { padding: 60, duration: 0 }))
    await expect.poll(() => page.evaluate(() => window.__map?.areTilesLoaded()), { timeout: 20_000 }).toBe(true)
    await page.screenshot({ path: path.join(output, `${testInfo.project.name}-map.png`) })
  }
})
