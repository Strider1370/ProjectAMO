import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 운영 API에서 그대로 받아온 페이로드 — SFC_WIND(270도 30KT)와 SFC_VIS(5000M FG/BR) 두 건.
// 로컬 테스트모드 백엔드는 AIRMET이 비어 있어 이 두 기호를 재현할 수 없다.
const AIRMET = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/airmet-surface-phenomena.json', import.meta.url)),
  'utf8',
))

const centerOf = (code) => {
  const ring = AIRMET.items.find((i) => i.phenomenon_code === code).geometry.coordinates[0]
  const pts = ring.slice(0, -1)
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ]
}

async function openAirmet(page) {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.route('**/api/airmet*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(AIRMET),
  }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[aria-label="기상정보"]').first().click()

  // 타일에는 발효 건수 배지가 붙어 접근성 이름이 'AIRMET'만은 아니다. 상단 알림 알약과
  // 이름이 겹치므로 레이어 타일 그리드로 범위를 좁힌다.
  const airmet = page.locator('.layer-tile').filter({ hasText: 'AIRMET' }).first()
  if (await airmet.getAttribute('aria-pressed') !== 'true') await airmet.click()
  await expect(airmet).toHaveAttribute('aria-pressed', 'true')
}

// 합성 마커 이미지의 실제 픽셀을 읽는다. 스크린샷 눈대중이 아니라, 기호가 몇 픽셀로
// 그려졌는지를 직접 재야 "작아서 안 보인다"가 고쳐졌는지 확인된다.
const markerInk = (page, phenomenon) => page.evaluate((code) => {
  const map = window.__map
  const source = map.getSource('kma-airmet-advisories-labels')
  const feature = source._data.features.find((f) => f.properties.iconKey.endsWith(code))
  if (!feature) return null

  const image = map.style.getImage(feature.properties.markerKey)
  if (!image) return null

  const { width, height, data } = image.data
  let minX = width; let minY = height; let maxX = -1; let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return {
    windLabel: feature.properties.windLabel,
    chartLine1: feature.properties.chartLine1,
    inkWidth: maxX - minX + 1,
    inkHeight: maxY - minY + 1,
  }
}, phenomenon)

// 기호 합성 결과는 뷰포트와 무관하다 — 반응형 매트릭스를 돌릴 이유가 없어 desktop만 검증한다.
test.describe('AIRMET surface phenomena symbols', () => {
  test('surface wind carries its speed inside the symbol and surface visibility renders legibly', async ({ page }, testInfo) => {
    // 지도 타일 로드 + 아이콘 PNG 합성 + 두 지점 캡처까지 기본 30초로는 모자란다.
    test.setTimeout(120_000)
    await openAirmet(page)
    await expect.poll(() => page.evaluate(
      () => !!window.__map?.getLayer('kma-airmet-advisories-icon'),
    ), { timeout: 15_000 }).toBe(true)

    // 마커 이미지는 PNG 로드 후 비동기로 합성된다.
    await expect.poll(() => markerInk(page, 'SFC_WIND'), { timeout: 15_000 }).not.toBe(null)
    await expect.poll(() => markerInk(page, 'SFC_VIS'), { timeout: 15_000 }).not.toBe(null)

    const wind = await markerInk(page, 'SFC_WIND')
    const vis = await markerInk(page, 'SFC_VIS')

    // 풍속 30KT가 기호 안 숫자로 전달됐는가. motion.speed_kt는 0이라 여기 오면 안 된다.
    expect(wind.windLabel).toBe('30')
    expect(vis.windLabel).toBe('')
    expect(vis.chartLine1).toBe('VIS 5000M FG/BR')

    // 회귀 방지선: 고치기 전 SFC_VIS는 세로 7px였다. 두 기호의 크기 차이가 5배까지 벌어지면 안 된다.
    expect(vis.inkHeight).toBeGreaterThan(12)
    expect(vis.inkWidth).toBeGreaterThan(60)
    expect(wind.inkHeight).toBeGreaterThan(30)

    console.log('[airmet] SFC_WIND ink %dx%d, label %j', wind.inkWidth, wind.inkHeight, wind.windLabel)
    console.log('[airmet] SFC_VIS  ink %dx%d, label %j', vis.inkWidth, vis.inkHeight, vis.chartLine1)

    // 마커는 polylabel로 구한 도형 안쪽 지점에 놓인다 — 꼭짓점 평균으로 잡으면 화면 밖으로 벗어난다.
    for (const [code, label] of [['SFC_WIND', 'sfc-wind'], ['SFC_VIS', 'sfc-vis']]) {
      await page.evaluate((c) => {
        const source = window.__map.getSource('kma-airmet-advisories-labels')
        const feature = source._data.features.find((f) => f.properties.iconKey.endsWith(c))
        window.__map.jumpTo({ center: feature.geometry.coordinates, zoom: 7.5 })
      }, code)
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `../artifacts/airmet-check/${label}.png` })
      await testInfo.attach(`${label}-symbol`, { path: `../artifacts/airmet-check/${label}.png`, contentType: 'image/png' })
    }
  })
})
