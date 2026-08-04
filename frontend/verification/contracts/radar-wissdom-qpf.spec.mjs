import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const WEBP_STUB = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64')
const BOUNDS = [[30.12520229746768, 118.82639855789549], [43.56590987094148, 133.58114159940212]]
const TM = { observed: '202608041020', latest: '202608041025' }
const ANALYSIS_TIME_MS = Date.UTC(2026, 7, 4, 1, 25)
const QPF_10 = ANALYSIS_TIME_MS + 10 * 60 * 1000
const QPF_30 = ANALYSIS_TIME_MS + 30 * 60 * 1000

const radarFrame = (tm) => ({ tm, path: `/data/radar/echo_korea_${tm}.png`, bounds: BOUNDS })
const wissdomFrame = (heightM, tm) => ({
  tm,
  timeMs: Date.UTC(2026, 7, 4, 1, tm === TM.observed ? 20 : 25),
  heightM,
  bounds: BOUNDS,
  path: `/data/radar/wissdom/wissdom_${heightM}_${tm}.webp`,
  legendPath: `/data/radar/wissdom/wissdom_${heightM}_${tm}_legend.webp`,
})
const qpfFrame = (validTimeMs, leadMinutes) => ({
  tm: TM.latest,
  analysisTimeMs: ANALYSIS_TIME_MS,
  validTimeMs,
  leadMinutes,
  bounds: BOUNDS,
  path: `/data/radar/qpf/qpf_${TM.latest}_p${leadMinutes}.webp`,
  legendPath: `/data/radar/qpf/qpf_${TM.latest}_p${leadMinutes}_legend.webp`,
})

async function installFixture(page) {
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'RADAR_ECHO', tm: TM.latest, frames: [radarFrame(TM.observed), radarFrame(TM.latest)] }),
  }))
  await page.route('**/data/radar/wissdom/wissdom_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'WISSDOM',
      framesByHeight: {
        '1524': [wissdomFrame(1524, TM.observed), wissdomFrame(1524, TM.latest)],
        '3048': [wissdomFrame(3048, TM.observed)],
      },
    }),
  }))
  await page.route('**/data/radar/qpf/qpf_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ type: 'QPF', frames: [qpfFrame(QPF_10, 10), qpfFrame(QPF_30, 30)] }),
  }))
  await page.route('**/data/radar/echo_korea_*.png', (route) => route.fulfill({ contentType: 'image/webp', body: WEBP_STUB }))
  await page.route('**/data/radar/wissdom/*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: WEBP_STUB }))
  await page.route('**/data/radar/qpf/*.webp', (route) => route.fulfill({ contentType: 'image/webp', body: WEBP_STUB }))
}

async function openWeatherPanel(page, testInfo) {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const entry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  await page.locator(`[aria-label="${entry}"]`).first().click()
  return entry
}

const layerState = (page, layerId) => page.evaluate((id) => {
  const map = window.__map
  const layer = map?.getLayer(id)
  if (!layer) return null
  return {
    visibility: map.getLayoutProperty(id, 'visibility') ?? 'visible',
    source: layer.source,
    sourceCount: map.getStyle().sources ? Object.keys(map.getStyle().sources).filter((sourceId) => sourceId.startsWith(id)).length : 0,
  }
}, layerId)

async function selectTimeline(page, targetMs) {
  const slider = page.getByRole('slider', { name: /기상 자료 시각/ })
  const currentMs = Number(await slider.getAttribute('aria-valuenow'))
  const key = targetMs >= currentMs ? 'ArrowRight' : 'ArrowLeft'
  const presses = Math.round(Math.abs(targetMs - currentMs) / (10 * 60 * 1000))
  await slider.focus()
  for (let index = 0; index < presses; index += 1) await slider.press(key)
}

test.describe('레이더 WISSDOM 및 MAPLE QPF', () => {
  test.beforeEach(async ({ page }) => { await installFixture(page) })

  test('WISSDOM exact frame availability follows the selected observed time and height', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    const radar = page.getByRole('button', { name: '레이더', exact: true })
    await radar.click()
    const wissdom = page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\) · 1,524 m/ })
    await expect(wissdom).toBeEnabled()
    await wissdom.click()
    await expect(wissdom).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'visible' })

    const height = page.getByRole('slider', { name: 'WISSDOM 높이' })
    await height.focus()
    await height.press('ArrowRight')
    await expect(height).toHaveAttribute('aria-valuetext', '1,829 m')
    // Jump to the fixture's 3,048 m level; only 10:20 has an exact frame there.
    for (let index = 0; index < 4; index += 1) await height.press('ArrowRight')
    await expect(height).toHaveAttribute('aria-valuetext', '3,048 m')
    await expect(page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\) · 3,048 m/ })).toBeDisabled()
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'none' })

    await selectTimeline(page, Date.UTC(2026, 7, 4, 1, 20))
    await expect(page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\) · 3,048 m/ })).toBeEnabled()
  })

  test('QPF replaces observed layers and exposes its exact MAPLE status and legend', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '레이더', exact: true }).click()
    await page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ }).click()
    await selectTimeline(page, QPF_30)

    await expect.poll(() => layerState(page, 'kma-radar-overlay')).toMatchObject({ visibility: 'none' })
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'none' })
    await expect.poll(() => layerState(page, 'kma-qpf-overlay')).toMatchObject({ visibility: 'visible' })
    const status = page.getByLabel('초단기 강수예측 상태')
    await expect(status).toContainText('MAPLE')
    await expect(status).toContainText('+30분')
    await expect(status).toContainText('mm/h')

    await page.locator(`[aria-label="${testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'}"]`).first().click()
    await page.getByRole('button', { name: '범례', exact: true }).click()
    await expect(page.getByLabel('MAPLE 초단기 강수예측 범례')).toBeVisible()
    await expect(page.getByAltText('MAPLE 초단기 강수예측 범례')).toHaveAttribute('src', /qpf_202608041025_p30_legend\.webp/)

    await selectTimeline(page, Date.UTC(2026, 7, 4, 1, 25))
    await expect.poll(() => layerState(page, 'kma-qpf-overlay')).toMatchObject({ visibility: 'none' })
    await expect(status).toHaveCount(0)
    await expect.poll(() => layerState(page, 'kma-radar-overlay')).toMatchObject({ visibility: 'visible' })
  })

  test('WISSDOM height and KIM pressure remain independent', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '레이더', exact: true }).click()
    await page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ }).click()
    await page.getByRole('button', { name: '바람', exact: true }).click()
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('wissdom')
    const wissdomHeight = page.getByRole('slider', { name: 'WISSDOM 높이' })
    await wissdomHeight.press('ArrowRight')
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('kim')
    const pressure = page.getByRole('slider', { name: 'KIM 등압면 고도' })
    const initialPressure = await pressure.getAttribute('aria-valuetext')
    await pressure.press('ArrowRight')
    const changedPressure = await pressure.getAttribute('aria-valuetext')
    expect(changedPressure).not.toBe(initialPressure)
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('wissdom')
    await expect(wissdomHeight).toHaveAttribute('aria-valuetext', '1,829 m')
  })

  test('playback and two basemap switches retain single current WISSDOM/QPF ownership', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '레이더', exact: true }).click()
    await page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ }).click()
    await selectTimeline(page, QPF_30)
    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click()
    await page.getByRole('menuitemradio', { name: /^지형/ }).click()
    await mapChoice.click()
    await page.getByRole('menuitemradio', { name: /^위성/ }).click()
    await expect.poll(() => layerState(page, 'kma-qpf-overlay')).toMatchObject({ visibility: 'visible', sourceCount: 1 })

    await selectTimeline(page, Date.UTC(2026, 7, 4, 1, 25))
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'visible', sourceCount: 1 })
    await selectTimeline(page, QPF_30)
    await page.getByRole('button', { name: '재생', exact: true }).click()
    await expect.poll(() => layerState(page, 'kma-radar-overlay')).toMatchObject({ visibility: 'visible' })
    await page.getByRole('button', { name: '재생 일시정지', exact: true }).click()
    // Evidence only: the saved capture records the user-reviewed coast/major-airport HSR-bounds calibration;
    // it intentionally makes no 100 m positional-accuracy claim.
    await page.screenshot({ path: testInfo.outputPath('hsr-bounds-calibration.png') })
  })

  test('WISSDOM control and QPF status card are axe-clean and fixtures expose no KMA key', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await page.getByRole('button', { name: '레이더', exact: true }).click()
    const wissdom = page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ })
    await wissdom.click()
    await selectTimeline(page, QPF_30)
    const results = await new AxeBuilder({ page }).include('.layer-tile-group-title-action').include('.qpf-status-card').analyze()
    expect(results.violations).toEqual([])

    const fixtureBodies = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
    expect(JSON.stringify(fixtureBodies)).not.toMatch(/(?:authKey|KMA_[A-Z_]*KEY|serviceKey)/i)
  })
})
