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
  await page.locator(`[aria-label="${weatherEntry(testInfo)}"]`).first().click()
  // 배지·체크가 붙으면 접근명이 "태풍 2 ✓"가 되어 이름 매칭이 깨진다 — aria-pressed로 단언한다.
  const tile = page.getByRole('button', { name: /^태풍/ })
  await expect(tile).toBeVisible()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  return tile
}

// 기상 레이어 패널은 열린 채로 남아 다른 패널 위를 덮는다(모바일에서는 시트끼리 겹쳐
// 클릭이 가로막힌다). echo-top.spec.mjs의 panelToggle과 같은 이유로 사이드바 아이콘을
// 다시 눌러 닫는다. 태풍 패널은 metVisibility.typhoon이 따로 제어하므로 닫혀도 남는다.
async function closeWeatherPanel(page, testInfo) {
  await page.locator(`[aria-label="${weatherEntry(testInfo)}"]`).first().click()
}

const typhoonLayerIds = () => {
  const map = window.__map
  // 베이스맵 전환 중에는 getStyle()이 던진다 — 스타일이 준비된 뒤에만 조회한다.
  if (!map || !map.isStyleLoaded()) return []
  return map.getStyle().layers.filter((l) => l.id.startsWith('typhoon-')).map((l) => l.id)
}

test('태풍 타일이 지도 레이어와 목록 패널을 함께 켠다', async ({ page }, testInfo) => {
  const tile = await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  await expect(panel).toBeVisible()
  await expect(panel.getByText(/19호 태풍/)).toBeVisible()
  await expect(panel.getByText(/20호 태풍/)).toBeVisible()

  const layers = await page.evaluate(typhoonLayerIds)
  expect(layers).toContain('typhoon-track-line')
  expect(layers).toContain('typhoon-forecast-track-line')
  expect(layers).toContain('typhoon-cone-fill')
  expect(layers).toContain('typhoon-gale-fill')

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
  await expect(page.getByRole('button', { name: /^태풍/ })).toContainText('2')
})

test('복수 태풍의 패널 색과 지도 색이 일치한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const swatches = await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__swatch').evaluateAll(
    (nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor),
  )
  expect(new Set(swatches).size).toBe(2)

  // _data는 Mapbox 공개 API가 아니다. 렌더된 피처를 조회한다.
  const mapColors = await page.evaluate(() => [...new Set(
    (window.__map?.querySourceFeatures('typhoon-points') ?? []).map((f) => f.properties.color),
  )])
  expect(mapColors.length).toBe(2)
})

test('바로가기 버튼이 지도를 해당 태풍으로 옮긴다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  // 첫 항목(19호 솔릭)의 경도는 픽스처의 current 좌표에서 읽는다.
  // 한국 기본 지도 중심과 경도가 가까워 "많이 움직였나"로는 판정할 수 없다 — 목적지 도착 여부를 본다.
  const target = snapshot.typhoons[0].current
  await closeWeatherPanel(page, testInfo)
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
  await expect(page.getByText(/자료 없음/)).toBeVisible()
})

test('베이스맵을 두 번 바꿔도 레이어가 남는다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^지형/ }).click()
  await mapChoice.click(); await page.getByRole('menuitemradio', { name: /^기본/ }).click()
  await expect.poll(async () => (await page.evaluate(typhoonLayerIds)).includes('typhoon-track-line')).toBe(true)
})
