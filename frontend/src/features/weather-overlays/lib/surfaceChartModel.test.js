import assert from 'node:assert/strict'
import test from 'node:test'

import {
  listSurfaceChartTimes,
  pickSurfaceChartFrame,
  selectSurfaceChartBarbs,
  selectSurfaceChartRun,
  surfaceChartBarbIconId,
  surfaceChartFrameUrls,
  windDirectionFrom,
} from './surfaceChartModel.js'
import { effectiveWindSpeedFactor } from './windField.js'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 8, 22, 0)
const frame = (hf) => ({ hf, validTimeMs: T0 + hf * HOUR, precipStartMs: T0 + (hf - 3) * HOUR, path: `kim_surface_chart/runs/KIMG_NE57_2026092200/hf${String(hf).padStart(3, '0')}` })
const RUN_00 = { runId: 'KIMG_NE57_2026092200', tmfc: '2026092200', frames: [3, 6, 9, 12].map(frame) }
const RUN_18 = { runId: 'KIMG_NE57_2026092118', tmfc: '2026092118', frames: [] }
const LATEST = { runs: [RUN_00, RUN_18], files: { isobars: 'isobars.json', centers: 'centers.json', precip: 'precip3h.png', wind: 'wind.json' } }

test('the newest run is used unless a briefing pins another one', () => {
  assert.equal(selectSurfaceChartRun(LATEST), RUN_00)
  assert.equal(selectSurfaceChartRun(LATEST, { pinnedTmfc: '2026092118' }), RUN_18)
  assert.equal(selectSurfaceChartRun(LATEST, { pinnedTmfc: '2026092112' }), null, 'no substitute when the pinned run has expired')
})

test('timeline times are the valid times of the chosen run', () => {
  assert.deepEqual(listSurfaceChartTimes(RUN_00).map((time) => time.validTime), [
    '2026-09-22T03:00:00.000Z', '2026-09-22T06:00:00.000Z', '2026-09-22T09:00:00.000Z', '2026-09-22T12:00:00.000Z',
  ])
})

test('a frame is shown only within 1.5 hours of the selected time', () => {
  assert.equal(pickSurfaceChartFrame(RUN_00, T0 + 7 * HOUR).hf, 6)
  assert.equal(pickSurfaceChartFrame(RUN_00, T0 + 7.6 * HOUR).hf, 9)
  assert.equal(pickSurfaceChartFrame(RUN_00, T0 + 13.4 * HOUR).hf, 12)
  assert.equal(pickSurfaceChartFrame(RUN_00, T0 + 14 * HOUR), null)
  assert.equal(pickSurfaceChartFrame(RUN_00, T0), null)
})

test('a republished run gets new file addresses so cached files are not reused', () => {
  const urls = surfaceChartFrameUrls(LATEST, RUN_00.frames[0], { ...RUN_00, revision: 1790000000000 })
  assert.equal(urls.isobars, '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/isobars.json?v=1790000000000')
  assert.equal(urls.precip, '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/precip3h.png?v=1790000000000')
})

test('frame files resolve under /data', () => {
  assert.deepEqual(surfaceChartFrameUrls(LATEST, RUN_00.frames[0]), {
    isobars: '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/isobars.json',
    centers: '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/centers.json',
    precip: '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/precip3h.png',
    wind: '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/wind.json',
  })
})

test('wind direction is where the wind comes from', () => {
  assert.equal(windDirectionFrom(5, 0), 270)
  assert.equal(windDirectionFrom(0, -5), 0)
  assert.equal(windDirectionFrom(-5, 0), 90)
})

test('barb icons reuse the airport 5 kt images', () => {
  assert.equal(surfaceChartBarbIconId(3), 'airport-wind-005')
  assert.equal(surfaceChartBarbIconId(27), 'airport-wind-025')
  assert.equal(surfaceChartBarbIconId(120), 'airport-wind-060')
})

test('barbs are picked on a fixed pixel spacing and calm points are marked', () => {
  const grid = { lonMin: 120, lonMax: 130, latMin: 30, latMax: 40, nx: 41, ny: 41, dx: 0.25, dy: 0.25 }
  const u = new Array(41 * 41).fill(10)
  const v = new Array(41 * 41).fill(0)
  for (let i = 0; i < 41; i += 1) u[i] = 0 // 가장 남쪽 줄은 무풍
  const unproject = ([x, y]) => ({ lng: 120 + x / 48, lat: 40 - y / 48 }) // 1° = 48 px
  const barbs = selectSurfaceChartBarbs({ grid, u, v }, { width: 480, height: 480, unproject, spacingPx: 48 })
  assert.equal(barbs.features.length, 100)
  const windy = barbs.features.find((feature) => !feature.properties.calm)
  assert.equal(windy.properties.direction, 270)
  assert.equal(windy.properties.icon, 'airport-wind-020')
  assert.equal(barbs.features.filter((feature) => feature.properties.calm).length, 0)
  const edge = selectSurfaceChartBarbs({ grid, u, v }, { width: 480, height: 480, unproject: ([x]) => ({ lng: 120 + x / 48, lat: 30 }), spacingPx: 48 })
  assert.ok(edge.features.every((feature) => feature.properties.calm && feature.properties.icon === ''))
})

test('zoom speed reference speeds particles up only when zoomed out past it', () => {
  const map = (zoom) => ({ getZoom: () => zoom })
  assert.equal(effectiveWindSpeedFactor(map(3), { speedFactor: 0.45 }), 0.45)
  assert.equal(effectiveWindSpeedFactor(map(3), { speedFactor: 0.45, zoomSpeedReference: 6 }), 0.45 * 8)
  assert.equal(effectiveWindSpeedFactor(map(7), { speedFactor: 0.45, zoomSpeedReference: 6 }), 0.45)
})
