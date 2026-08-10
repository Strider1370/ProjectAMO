import { test, expect } from '../fixtures.mjs'
import {
  GROUND_SIGNAGE_NOW,
  buildGroundSignageForecast,
  buildGroundSignageWarning,
  installGroundSignageFixture,
} from '../monitoring-ground-signage-fixture.mjs'

const FULL_HD = { width: 1920, height: 1080 }
// Measured by the pre-change managed capture. These deliberately pin the chrome that signage must not move.
const PRE_CHANGE_CHROME = {
  header: { x: 20, y: 16, width: 1014.53125, height: 46 },
  rightTop: { x: 1054.53125, y: 16, width: 845.46875, height: 46 },
  map: { x: 1054.53125, y: 74, width: 845.46875, height: 961.953125 },
}

const box = async (locator) => locator.boundingBox()
const fontSize = async (locator) => locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
const closeTo = (actual, expected, tolerance = 1) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)

async function openGround(page) {
  await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
  await page.locator('.dashboard-root').waitFor({ state: 'attached' })
}

async function pauseProgress(page) {
  await page.locator('[data-forecast-progress]').evaluate((element) => {
    const animation = element.getAnimations().find((candidate) => candidate.effect?.getTiming().duration === 12_000)
    if (!animation) throw new Error('forecast progress animation is missing')
    animation.pause()
  })
}

test.describe('ground-signage', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'ground signage has one fixed 1920x1080 contract')
    await page.setViewportSize(FULL_HD)
    await page.clock.install({ time: GROUND_SIGNAGE_NOW })
    await installGroundSignageFixture(page)
  })

  test('ground-signage keeps the fixed header and map while sizing the three left rows', async ({ page }) => {
    await openGround(page)

    expect(await box(page.locator('.left-panel-header'))).toEqual(PRE_CHANGE_CHROME.header)
    expect(await box(page.locator('.right-panel-top'))).toEqual(PRE_CHANGE_CHROME.rightTop)
    expect(await box(page.locator('.map-panel-wrap'))).toEqual(PRE_CHANGE_CHROME.map)

    const alert = page.getByRole('region', { name: '공항경보' })
    const current = page.getByRole('region', { name: '현재 날씨' })
    const forecast = page.getByRole('region', { name: '지상 예보' })
    expect(await box(alert)).toEqual({ x: 0, y: 74, width: 1055, height: 130 })
    expect(await box(current)).toEqual({ x: 0, y: 216, width: 1055, height: 300 })
    expect(await box(forecast)).toEqual({ x: 0, y: 528, width: 1055, height: 507 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.body.scrollHeight <= window.innerHeight)).toBe(true)
  })

  test('ground-signage enlarges alert/current values and shows six labelled metric icons', async ({ page }) => {
    await openGround(page)
    const alert = page.getByRole('region', { name: '공항경보' })
    const current = page.getByRole('region', { name: '현재 날씨' })
    closeTo(await fontSize(alert.locator('[data-warning-label]').first()), 30)
    closeTo(await fontSize(alert.locator('[data-warning-time]').first()), 20)
    closeTo(await fontSize(current.locator('[data-current-temperature]')), 64)
    closeTo(await fontSize(current.locator('[data-current-feels]')), 20)
    closeTo(await fontSize(current.locator('[data-current-condition]')), 24)
    closeTo(await fontSize(current.locator('[data-current-metric-value]').first()), 26)
    closeTo(await fontSize(current.locator('[data-current-metric-label]').first()), 17)
    await expect(current.locator('[data-current-metric-icon][aria-hidden="true"]')).toHaveCount(6)
    await expect(current.locator('[data-current-metric-label]')).toHaveCount(6)
    await expect(current.getByText('습도', { exact: true })).toBeVisible()
    await expect(current.getByText('자외선', { exact: true })).toBeVisible()
  })

  test('ground-signage hourly rows share eight column centres', async ({ page }) => {
    await openGround(page)
    const hourly = page.getByRole('region', { name: '지상 예보' }).locator('[data-forecast-view="hourly"]')
    const columns = hourly.locator('[data-hourly-column]')
    await expect(columns).toHaveCount(8)
    const layout = await hourly.evaluate((element) => [...element.querySelectorAll('[data-hourly-column]')].map((column) => {
      const center = (node) => {
        const rect = node.getBoundingClientRect()
        return rect.left + rect.width / 2
      }
      const dot = column.querySelector('[data-hourly-dot]')
      const label = column.querySelector('[data-hourly-temperature]')
      const precip = column.querySelector('[data-hourly-precipitation]')
      const track = column.querySelector('[data-hourly-precip-track]')
      return {
        column: center(column),
        time: center(column.querySelector('[data-hourly-time]')),
        icon: center(column.querySelector('[data-hourly-icon]')),
        dot: center(dot),
        temperature: center(label),
        precipitation: center(precip),
        dotOffset: label.getBoundingClientRect().top - dot.getBoundingClientRect().top,
        trackBottom: track.getBoundingClientRect().bottom,
        svgBottom: element.querySelector('svg').getBoundingClientRect().bottom,
      }
    }))
    for (const item of layout) {
      for (const key of ['time', 'icon', 'dot', 'temperature', 'precipitation']) closeTo(item[key], item.column)
      expect(item.trackBottom).toBeLessThanOrEqual(item.svgBottom)
    }
    expect(new Set(layout.map((item) => Math.round(item.dotOffset))).size).toBe(1)
    closeTo(await fontSize(hourly.locator('[data-hourly-time]').first()), 20)
    closeTo(await fontSize(hourly.locator('[data-hourly-precipitation]').first()), 20)
    closeTo(await fontSize(hourly.locator('[data-hourly-temperature]').first()), 32)
    closeTo(await hourly.locator('[data-hourly-icon]').first().evaluate((element) => element.getBoundingClientRect().width), 64)
  })

  test('ground-signage alternates to a six-column weekly table', async ({ page }) => {
    await openGround(page)
    const forecast = page.getByRole('region', { name: '지상 예보' })
    const hourly = forecast.locator('[data-forecast-view="hourly"]')
    const weekly = forecast.locator('[data-forecast-view="weekly"]')
    const mapBefore = await box(page.locator('.map-panel-wrap'))
    const alertBefore = await box(page.getByRole('region', { name: '공항경보' }))
    const currentBefore = await box(page.getByRole('region', { name: '현재 날씨' }))
    await expect(forecast.locator('[data-forecast-title="hourly"]')).toHaveAttribute('aria-current', 'true')
    await expect(forecast.locator('[data-forecast-title="weekly"]')).toHaveAttribute('aria-current', 'false')
    closeTo(await fontSize(forecast.locator('[data-forecast-title="hourly"]')), 24)
    closeTo(await fontSize(forecast.locator('[data-forecast-title="weekly"]')), 22)
    closeTo(await fontSize(forecast.locator('[data-forecast-metadata]')), 17)
    closeTo(await forecast.locator('[data-forecast-progress]').evaluate((element) => element.getBoundingClientRect().height), 4)
    await expect(forecast.locator('[data-forecast-metadata]')).toHaveText('동네예보 14시 · 중기예보 06시')
    await expect(forecast.locator('[data-forecast-metadata]')).not.toContainText(/short|mid_land|mid_ta|tmFc|base_time|발표|단기예보/)

    await pauseProgress(page)
    const progress = forecast.locator('[data-forecast-progress]')
    for (const [time, min, max] of [[0, 0, 1], [6000, 49, 51], [11900, 98, 100]]) {
      await progress.evaluate((element, currentTime) => {
        const animation = element.getAnimations().find((candidate) => candidate.effect?.getTiming().duration === 12_000)
        animation.currentTime = currentTime
      }, time)
      const percent = await progress.evaluate((element) => Number.parseFloat(getComputedStyle(element).width) / element.parentElement.getBoundingClientRect().width * 100)
      expect(percent).toBeGreaterThanOrEqual(min)
      expect(percent).toBeLessThanOrEqual(max)
    }

    await page.clock.runFor(12_000)
    await expect(forecast.locator('[data-forecast-title="weekly"]')).toHaveAttribute('aria-current', 'true')
    const fadeTiming = await forecast.locator('.ground-forecast-layer').first().evaluate((element) => element.getAnimations().find((animation) => animation.effect?.getKeyframes?.().some((frame) => Object.hasOwn(frame, 'opacity')))?.effect?.getTiming().duration)
    expect(fadeTiming).toBe(350)
    await forecast.locator('.ground-forecast-layer').evaluateAll((layers) => layers.forEach((layer) => layer.getAnimations().filter((animation) => animation.effect?.getKeyframes?.().some((frame) => Object.hasOwn(frame, 'opacity'))).forEach((animation) => animation.finish())))
    expect(await box(page.locator('.map-panel-wrap'))).toEqual(mapBefore)
    expect(await box(page.getByRole('region', { name: '공항경보' }))).toEqual(alertBefore)
    expect(await box(page.getByRole('region', { name: '현재 날씨' }))).toEqual(currentBefore)
    await page.clock.runFor(12_000)
    await expect(forecast.locator('[data-forecast-title="hourly"]')).toHaveAttribute('aria-current', 'true')
    for (let boundary = 1; boundary <= 10; boundary += 1) {
      await page.clock.runFor(12_000)
      await expect(forecast.locator(`[data-forecast-title="${boundary % 2 ? 'weekly' : 'hourly'}"]`)).toHaveAttribute('aria-current', 'true')
    }
    await page.clock.runFor(12_000)
    await expect(forecast.locator('[data-forecast-title="weekly"]')).toHaveAttribute('aria-current', 'true')
    await expect(hourly).toHaveAttribute('aria-hidden', 'true')
    await expect(hourly).toHaveAttribute('inert', '')
    await expect(weekly).toHaveAttribute('aria-hidden', 'false')
    await expect(hourly.locator('svg title')).toHaveText(/시간별/)
    await expect(hourly.locator('svg desc')).toHaveText(/기온|강수/)

    const table = weekly.getByRole('table', { name: '주간 예보' })
    await expect(table.locator('[data-weekly-column]')).toHaveCount(6)
    const tableLayout = await table.evaluate((element) => {
      const columns = [...element.querySelectorAll('[data-weekly-column]')].map((column) => column.getBoundingClientRect())
      const rows = [...element.querySelectorAll('[data-weekly-row]')].map((row) => row.getBoundingClientRect())
      const header = element.querySelector('[data-weekly-header]').getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      return { widths: columns.map((column) => column.width), rowTops: rows.map((row) => row.top), inset: [columns[0].left - rect.left, rect.right - columns.at(-1).right, rect.bottom - rows.at(-1).bottom], headerGap: rows[0].top - header.bottom }
    })
    expect(Math.max(...tableLayout.widths) - Math.min(...tableLayout.widths)).toBeLessThanOrEqual(1)
    expect(new Set(tableLayout.rowTops.map(Math.round)).size).toBe(4)
    for (const inset of tableLayout.inset) closeTo(inset, 28)
    closeTo(tableLayout.headerGap, 26)
    closeTo(await weekly.locator('[data-weekly-icon]').first().evaluate((element) => element.getBoundingClientRect().width), 68)
    closeTo(await fontSize(weekly.locator('[data-weekly-weekday]').first()), 24)
    closeTo(await fontSize(weekly.locator('[data-weekly-date]').first()), 18)
    closeTo(await fontSize(weekly.locator('[data-weekly-precipitation]').first()), 20)
    closeTo(await fontSize(weekly.locator('[data-weekly-minmax]').first()), 30)
  })

  test('ground-signage preserves empty and partial frames', async ({ page }) => {
    await installGroundSignageFixture(page, {
      forecast: buildGroundSignageForecast({ hourlyCount: 3, futureDays: 2, tmFc: null }),
      warning: buildGroundSignageWarning({ active: false }),
    })
    await openGround(page)
    const forecast = page.getByRole('region', { name: '지상 예보' })
    expect(await box(page.getByRole('region', { name: '공항경보' }))).toEqual({ x: 0, y: 74, width: 1055, height: 130 })
    expect(await box(page.getByRole('region', { name: '현재 날씨' }))).toEqual({ x: 0, y: 216, width: 1055, height: 300 })
    expect(await box(forecast)).toEqual({ x: 0, y: 528, width: 1055, height: 507 })
    await expect(forecast.locator('[data-hourly-column]')).toHaveCount(8)
    await page.clock.runFor(12_000)
    await expect(forecast.locator('[data-weekly-column]')).toHaveCount(6)
    await expect(forecast.locator('[data-forecast-metadata]')).toHaveText('동네예보 14시 · 중기예보 -')
    await expect(forecast.getByText('-', { exact: true }).first()).toBeVisible()
  })

  test('ground-signage honours reduced motion without stopping rotation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openGround(page)
    const forecast = page.getByRole('region', { name: '지상 예보' })
    const transition = await forecast.locator('.ground-forecast-layer').first().evaluate((element) => getComputedStyle(element).transitionDuration)
    expect(transition).toBe('0s')
    const progress = forecast.locator('[data-forecast-progress]')
    expect(await progress.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))).toBeLessThan(1)
    closeTo(await progress.evaluate((element) => element.getBoundingClientRect().width), await progress.evaluate((element) => element.parentElement.getBoundingClientRect().width))
    await page.clock.runFor(12_000)
    await expect(forecast.locator('[data-forecast-title="weekly"]')).toHaveAttribute('aria-current', 'true')
  })
})
