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
// 10:00 KST — more than one WISSDOM publication interval before the 10:25 radar frame.
const staleWissdomFrame = (heightM) => ({
  tm: '202608041000',
  timeMs: Date.UTC(2026, 7, 4, 1, 0),
  heightM,
  bounds: BOUNDS,
  path: `/data/radar/wissdom/wissdom_${heightM}_202608041000.webp`,
  legendPath: `/data/radar/wissdom/wissdom_${heightM}_202608041000_legend.webp`,
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

// The forecast/observation split is measured against "지금", so the clock must be fixed for the
// fixture's timestamps to mean anything. QPF +10 and +30 sit after this instant; the radar frames sit before.
const NOW_MS = ANALYSIS_TIME_MS + 5 * 60 * 1000

async function installFixture(page) {
  await page.route('**/api/demo-mode', (route) => route.fulfill({
    contentType: 'application/json',
    // on:false keeps the app on its normal data path; only the shared "지금" is pinned.
    body: JSON.stringify({ on: false, now: new Date(NOW_MS).toISOString() }),
  }))
  await page.route('**/data/radar/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/echo_meta.json')) return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'RADAR_ECHO', tm: TM.latest, frames: [radarFrame(TM.observed), radarFrame(TM.latest)] }),
    })
    if (pathname.endsWith('/wissdom/wissdom_meta.json')) return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'WISSDOM', framesByHeight: {
        // 1524 has an exact analysis; 3048 only the previous one (usable, five minutes back);
        // 2743 is a full interval too old for the rendered radar frame (not usable).
        '1524': [wissdomFrame(1524, TM.observed), wissdomFrame(1524, TM.latest)],
        '3048': [wissdomFrame(3048, TM.observed)],
        '2743': [staleWissdomFrame(2743)],
      } }),
    })
    if (pathname.endsWith('/qpf/qpf_meta.json')) return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ type: 'QPF', frames: [qpfFrame(QPF_10, 10), qpfFrame(QPF_30, 30)] }),
    })
    if (/\.(?:png|webp)$/.test(pathname)) return route.fulfill({ contentType: 'image/webp', body: WEBP_STUB })
    return route.fallback()
  })
}

async function ensureRadarOn(page) {
  // 레이더 is on by default; a blind click turns it off and the WISSDOM control disappears with it.
  const radar = page.getByRole('button', { name: '레이더', exact: true })
  if (await radar.getAttribute('aria-pressed') !== 'true') await radar.click()
  await expect(radar).toHaveAttribute('aria-pressed', 'true')
  return radar
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
  await slider.focus()
  for (let index = 0; index < 12; index += 1) {
    const currentMs = Number(await slider.getAttribute('aria-valuenow'))
    if (currentMs === targetMs) return
    await slider.press(targetMs > currentMs ? 'ArrowRight' : 'ArrowLeft')
  }
  expect(Number(await slider.getAttribute('aria-valuenow'))).toBe(targetMs)
}

test.describe('레이더 WISSDOM 및 MAPLE QPF', () => {
  test.beforeEach(async ({ page }) => { await installFixture(page) })

  test('WISSDOM backs onto the previous analysis and says so when none is usable', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await ensureRadarOn(page)
    const wissdom = page.getByRole('button', { name: '레이더 바람장 (WISSDOM)', exact: true })
    const missingNote = page.getByText('이 시각 WISSDOM 자료 없음')
    await wissdom.click()
    await expect(wissdom).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'visible' })
    await expect(missingNote).toHaveCount(0)

    const height = page.getByRole('slider', { name: 'WISSDOM 높이' })
    await height.focus()
    await height.press('ArrowRight')
    await expect(height).toHaveAttribute('aria-valuetext', '1,829 m')
    // 3,048 m carries only the 10:20 analysis; under the rendered 10:25 radar frame it still applies.
    for (let index = 0; index < 4; index += 1) await height.press('ArrowRight')
    await expect(height).toHaveAttribute('aria-valuetext', '3,048 m')
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'visible' })
    await expect(missingNote).toHaveCount(0)

    // 2,743 m is a full interval stale: the layer drops out and the reason is stated on screen.
    await height.press('ArrowLeft')
    await expect(height).toHaveAttribute('aria-valuetext', '2,743 m')
    await expect.poll(() => layerState(page, 'kma-wissdom-overlay')).toMatchObject({ visibility: 'none' })
    await expect(missingNote).toBeVisible()

    // The control stays operable while unavailable, so a pilot can always switch it back off.
    await expect(wissdom).toBeEnabled()
    await wissdom.click()
    await expect(wissdom).toHaveAttribute('aria-pressed', 'false')
    await expect(missingNote).toHaveCount(0)
  })

  test('QPF replaces observed layers and exposes its exact MAPLE status and legend', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await ensureRadarOn(page)
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
    await ensureRadarOn(page)
    await page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ }).click()
    await page.getByRole('button', { name: '바람', exact: true }).click()
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('wissdom')
    const wissdomHeight = page.getByRole('slider', { name: 'WISSDOM 높이' })
    await wissdomHeight.press('ArrowRight')
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('kim')
    const pressure = page.getByRole('slider', { name: 'KIM 등압면 고도' })
    const initialPressure = await pressure.getAttribute('aria-valuetext')
    // KIM opens on its lowest level (FL000 · 1000 hPa), the end of the rail — only ArrowLeft moves.
    await pressure.press('ArrowLeft')
    const changedPressure = await pressure.getAttribute('aria-valuetext')
    expect(changedPressure).not.toBe(initialPressure)
    await page.getByRole('combobox', { name: '세로 고도 레일 자료원' }).selectOption('wissdom')
    await expect(wissdomHeight).toHaveAttribute('aria-valuetext', '1,829 m')
  })

  test('playback and two basemap switches retain single current WISSDOM/QPF ownership', async ({ page }, testInfo) => {
    await openWeatherPanel(page, testInfo)
    await ensureRadarOn(page)
    await page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ }).click()
    await selectTimeline(page, QPF_30)
    const mapChoice = page.getByRole('button', { name: /지도 선택$/ })
    await mapChoice.click()
    await page.getByRole('menuitemradio', { name: /^단색/ }).click()
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
    await ensureRadarOn(page)
    const wissdom = page.getByRole('button', { name: /레이더 바람장 \(WISSDOM\)/ })
    await wissdom.click()
    await selectTimeline(page, QPF_30)
    const results = await new AxeBuilder({ page }).include('.layer-tile-group-title-action').include('.qpf-status-card').analyze()
    expect(results.violations).toEqual([])

    const fixtureBodies = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
    expect(JSON.stringify(fixtureBodies)).not.toMatch(/(?:authKey|KMA_[A-Z_]*KEY|serviceKey)/i)
  })
})
