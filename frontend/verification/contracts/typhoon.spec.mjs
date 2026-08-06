// 기존 계약과 같은 진입 규약을 따른다: fixtures.mjs(콘솔 수집 auto fixture),
// addInitScript로 투어·릴리스 노트 억제, aria-label로 사이드바 진입, aria-pressed로 토글 단언.
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'typhoon-snapshot.json'), 'utf8'))
const empty = { fetched_at: '2026-07-26T00:00:00.000Z', status: 'ok', typhoons: [] }

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
  await expect(panel.getByRole('tab', { name: /19호 태풍/ })).toBeVisible()
  await expect(panel.getByRole('tab', { name: /20호 태풍/ })).toBeVisible()
  await expect(panel.getByLabel(/19호 태풍 .* 현재 요약/)).toBeVisible()
  await panel.getByRole('tab', { name: /20호 태풍/ }).click()
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
  const swatches = await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__swatch').evaluateAll(
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
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^지형/ }).click()
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
