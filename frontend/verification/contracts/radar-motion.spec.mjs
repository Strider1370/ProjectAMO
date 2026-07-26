import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const OBSERVED_AT_MS = Date.UTC(2026, 6, 26, 3, 0)
const BOUNDS = [[30, 120], [40, 130]]

// TimelineRail의 방향키 이동 단위는 10분이다 — ArrowLeft 한 번이면 이동 자료가 없는 1150으로 간다.
const TM = { back: '202607261150', mid: '202607261155', latest: '202607261200' }

const radarFrame = (tm) => ({ tm, path: `/data/radar/echo_korea_${tm}.png`, bounds: BOUNDS })

async function installMotionFixture(page) {
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO',
      tm: TM.latest,
      frames: [
        radarFrame(TM.back),
        radarFrame(TM.mid),
        {
          ...radarFrame(TM.latest),
          motion: {
            tm: TM.latest,
            observedAtMs: OBSERVED_AT_MS,
            comparedFromMs: OBSERVED_AT_MS - 5 * 60 * 1000,
            path: `/data/radar/motion_korea_${TM.latest}.geojson`,
          },
        },
      ],
    }),
  }))
  await page.route(`**/data/radar/motion_korea_${TM.latest}.geojson`, (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0, 37.4] }, properties: { bearingDeg: 90, speedKt: 30, matchScore: 120, neighbourAgreement: 0.9 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.4, 37.6] }, properties: { bearingDeg: 45, speedKt: 18, matchScore: 260, neighbourAgreement: 0.7 } },
      ],
    }),
  }))
}

// 화살촉 레이어의 소스 이름은 레이어 이름과 다르다 — 둘을 따로 넘긴다.
const layerState = (page, layerId, sourceId) => page.evaluate(([layer, source]) => {
  const map = window.__map
  if (!map?.getLayer(layer)) return null
  // symbol-placement는 심볼 레이어에만 있는 속성이다 — 선 레이어에 물으면 mapbox가 던진다.
  const isSymbol = map.getLayer(layer).type === 'symbol'
  return {
    visibility: map.getLayoutProperty(layer, 'visibility') ?? 'visible',
    placement: (isSymbol ? map.getLayoutProperty(layer, 'symbol-placement') : null) ?? null,
    features: map.getSource(source)?._data?.features?.length ?? null,
  }
}, [layerId, sourceId])

const shaftState = (page) => layerState(page, 'kma-radar-motion-shaft', 'kma-radar-motion-shaft')
const headState = (page) => layerState(page, 'kma-radar-motion-arrow', 'kma-radar-motion')

async function openMotion(page, testInfo) {
  // lastSeenVersion은 CURRENT_VERSION과 같아야 업데이트 패널이 사이드바를 덮지 않는다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const entry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  // 사이드바 버튼만 aria-label을 갖는다 — 릴리스 노트에도 '기상정보'가 들어가 이름만으로는 겹친다.
  await page.locator(`[aria-label="${entry}"]`).first().click()

  const radar = page.getByRole('button', { name: '레이더', exact: true })
  if (await radar.getAttribute('aria-pressed') !== 'true') await radar.click()
  await expect(radar).toHaveAttribute('aria-pressed', 'true')

  // 범례는 세 뷰포트 모두 하단 독에 있다 — 기상 패널을 닫고 '범례'를 눌러야 토글이 보인다.
  await page.locator(`[aria-label="${entry}"]`).first().click()
  await page.getByRole('button', { name: '범례', exact: true }).click()
  return page.getByRole('button', { name: '이동 화살표 표시' })
}

test.describe('레이더 에코 이동 화살표', () => {
  test.beforeEach(async ({ page }) => { await installMotionFixture(page) })

  test('토글을 켜면 화살대와 화살촉이 모두 뜨고 점이 들어간다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await expect(motion).toBeEnabled()
    await motion.click()
    await expect(motion).toHaveAttribute('aria-pressed', 'true')

    await expect.poll(() => shaftState(page)).toMatchObject({ visibility: 'visible', features: 2 })
    await expect.poll(() => headState(page)).toMatchObject({ visibility: 'visible', features: 2 })
  })

  test('화살촉에 symbol-placement가 설정되지 않는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await expect.poll(() => headState(page)).toMatchObject({ placement: null })
  })

  test('토글을 끄면 두 레이어가 함께 숨는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await expect(motion).toHaveAttribute('aria-pressed', 'true')
    await motion.click()
    await expect.poll(() => shaftState(page)).toMatchObject({ visibility: 'none' })
    await expect.poll(() => headState(page)).toMatchObject({ visibility: 'none' })
  })

  test('이동 자료가 없는 시각에는 토글이 비활성이다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    const slider = page.getByRole('slider', { name: /기상 자료 시각/ })
    await slider.focus()
    await slider.press('ArrowLeft')
    await expect(motion).toBeDisabled()
  })

  test('베이스맵을 바꿔도 레이어가 살아남는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await expect.poll(() => headState(page)).toMatchObject({ visibility: 'visible' })

    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click()
    await page.getByRole('menuitemradio', { name: /^지형/ }).click()

    await expect.poll(() => shaftState(page)).toMatchObject({ visibility: 'visible', features: 2 })
    await expect.poll(() => headState(page)).toMatchObject({ visibility: 'visible', features: 2 })
  })

  test('토글에 접근성 위반이 없다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    const results = await new AxeBuilder({ page }).include('.radar-motion-control').analyze()
    expect(results.violations).toEqual([])
  })
})
