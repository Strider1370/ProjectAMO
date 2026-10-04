import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, MONITORING_FIXTURE_NOW, buildSnapshotMeta } from '../monitoring-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { AIRPORT_CIRCLE_LAYER, AIRPORT_STATION_CENTER_LAYER } from '../../src/features/map/lib/baseMapLayers.js'
import { AIRPORT_WARNING_RING_LAYER, AIRPORT_WARNING_PULSE_LAYER, AIRPORT_WARNING_HALO_LAYER } from '../../src/features/map/lib/airportWarningLayers.js'
import { airportStateRingRadius, AIRPORT_WARNING_RING_WIDTH } from '../../src/features/map/lib/airportMarkerSizing.js'

const now = MONITORING_FIXTURE_NOW.getTime()
const iso = (seconds) => new Date(now + seconds * 1000).toISOString()
const warning = { airports: {
  RKSI: { warnings: [
    { wrng_type_key: 'STRONG_WIND', valid_start: iso(-3600), valid_end: iso(3600) },
    { wrng_type_key: 'WIND_SHEAR', valid_start: iso(-3600), valid_end: iso(3600) },
  ] },
  RKSS: { warnings: [] },
  RKTU: { warnings: [{ wrng_type_key: 'HEAVY_RAIN', valid_end: iso(-1) }] },
} }

async function setup(page, data = warning) {
  await page.clock.install({ time: MONITORING_FIXTURE_NOW })
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await installMonitoringFixture(page, { warning: data })
  // 외부 타일 없이 실제 Mapbox 렌더러/스타일 수명주기를 검증한다.
  await page.route(/https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\//, (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      version: 8, glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      sources: { land: { type: 'geojson', data: '/Geo/sido.json' } },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#bfd3e1' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#edf0e8', 'fill-outline-color': '#879aa4' } },
      ],
    }),
  }))
  await page.route('**/api/demo-mode', (route) => route.fulfill({ json: { on: false, now: iso(0) } }))
}
async function ringIcaos(page) {
  return page.evaluate((id) => {
    const map = window.__map
    if (!map?.getLayer(id) || !map.isStyleLoaded()) return null
    return [...new Set(map.queryRenderedFeatures({ layers: [id] }).map((feature) => feature.properties.icao))].sort()
  }, AIRPORT_WARNING_RING_LAYER)
}

test.describe('airport-warning', () => {
  test('C pulse keeps station/selection symbols and survives zoom and two basemap switches', async ({ page, consoleMessages }, testInfo) => {
    await setup(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
    const opacity = () => page.evaluate((id) => window.__map.getPaintProperty(id, 'circle-opacity'), AIRPORT_WARNING_PULSE_LAYER)
    const firstOpacity = await opacity()
    await expect.poll(opacity).not.toBe(firstOpacity)
    for (const zoom of [6, 9]) {
      await page.evaluate((zoom) => window.__map.jumpTo({ center: [126.4407, 37.4602], zoom }), zoom)
      await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
      expect(await page.evaluate((id) => window.__map.getPaintProperty(id, 'circle-radius'), AIRPORT_WARNING_RING_LAYER)).toEqual(airportStateRingRadius(true))
    }
    const clickAt = await page.evaluate(() => {
      const point = window.__map.project([126.4407, 37.4602])
      const bounds = window.__map.getContainer().getBoundingClientRect()
      return { x: point.x + bounds.x, y: point.y + bounds.y }
    })
    await page.mouse.click(clickAt.x, clickAt.y)
    await expect(page.locator('.airport-panel-title')).toContainText('RKSI')
    // 렌더러가 사용하는 공항 ID와 선택 표출 속성을 확인한다.
    await expect.poll(() => page.evaluate((layer) => {
      const airport = window.__map.queryRenderedFeatures({ layers: [layer] }).find((feature) => feature.properties.icao === 'RKSI')
      return { id: airport?.id, selected: airport?.properties?.selected }
    }, AIRPORT_CIRCLE_LAYER)).toEqual({ id: 'RKSI', selected: true })
    expect(await page.evaluate((id) => Boolean(window.__map.getLayer(id)), AIRPORT_WARNING_HALO_LAYER)).toBe(false)
    expect(await page.evaluate((id) => window.__map.getPaintProperty(id, 'circle-radius'), AIRPORT_CIRCLE_LAYER)).toEqual(airportStateRingRadius())
    expect(await page.evaluate((id) => window.__map.getPaintProperty(id, 'circle-stroke-width'), AIRPORT_WARNING_RING_LAYER)).toBe(AIRPORT_WARNING_RING_WIDTH)
    await page.screenshot({ path: testInfo.outputPath('airport-rings-compact-selected.png') })
    await page.locator('.airport-panel-close').click()
    if (testInfo.project.name !== 'mobile') {
      for (const name of [/^위성/, /^기본/]) {
        await page.getByRole('button', { name: /지도 선택$/ }).click()
        await page.getByRole('menuitemradio', { name }).click()
        await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
      }
    } else {
      for (const background of ['#e6edf2', '#14263d']) {
        await page.evaluate((background) => window.__map.setStyle({ version: 8, glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }] }, { diff: false }), background)
        await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
      }
    }
    const order = await page.evaluate((ids) => {
      const layers = window.__map.getStyle().layers.map((layer) => layer.id)
      return ids.map((id) => layers.indexOf(id))
    }, [AIRPORT_WARNING_PULSE_LAYER, AIRPORT_WARNING_RING_LAYER, AIRPORT_CIRCLE_LAYER, AIRPORT_STATION_CENTER_LAYER])
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(consoleMessages.filter((message) => message.type === 'pageerror')).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('airport-warning-C.png') })
  })

  test('validity boundaries and cleared collection remove rings and the airport warning badge', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'UTC/polling lifecycle is common across viewports.')
    await setup(page, { airports: {
      RKSI: { warnings: [{ valid_end: iso(60) }] },
      RKSS: { warnings: [{ valid_start: iso(30), valid_end: iso(120) }] },
    } })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
    await page.clock.fastForward(35000)
    await expect.poll(() => ringIcaos(page)).toEqual(['RKSI', 'RKSS'])
    await page.clock.fastForward(30000)
    await expect.poll(() => ringIcaos(page)).toEqual(['RKSS'])
    await page.route('**/api/warning', (route) => route.fulfill({ json: { airports: {} } }))
    await page.route('**/api/snapshot-meta', (route) => route.fulfill({ json: buildSnapshotMeta({ warning: { hash: 'warning-cleared' } }) }))
    await page.clock.fastForward(60000)
    await expect.poll(() => ringIcaos(page)).toEqual([])
    await expect(page.getByRole('button', { name: /^공항경보/ })).toHaveCount(0)
  })

  test('monitoring uses the same ring with a static reduced-motion presentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Monitoring map is on the desktop/iPad operations surface.')
    await setup(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/monitoring', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => ringIcaos(page)).toEqual(['RKSI'])
    const opacity = () => page.evaluate((id) => window.__map.getPaintProperty(id, 'circle-opacity'), AIRPORT_WARNING_PULSE_LAYER)
    expect(await opacity()).toBe(0)
    await page.waitForTimeout(400)
    expect(await opacity()).toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(opacity).toBeGreaterThan(0)
  })
})
