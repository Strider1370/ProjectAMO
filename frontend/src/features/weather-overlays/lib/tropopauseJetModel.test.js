import test from 'node:test'
import assert from 'node:assert/strict'
import mapboxgl from 'mapbox-gl'
import { buildTropDisplayFl, buildTropEdges, buildTropJetRaster, buildTropopauseJetModel, describeTropopauseJetPoint, pickJetBarbs, pickTropopauseTime, pressureToFl, tropBandColor } from './tropopauseJetModel.js'
import { TROP_BANDS, TROP_CAP_FL } from '../../../shared/weather/tropopauseJetPresentation.js'

const grid = { nx: 21, ny: 11, lonMin: 120, lonMax: 130, latMin: 30, latMax: 35 }
const size = grid.nx * grid.ny
const field = (overrides = {}) => ({
  grid, time: { tmfc: '2026050100', hf: 0, validTime: '2026-05-01T00:00:00.000Z' }, revision: 'r1',
  trop: Array(size).fill(250), tropT: Array(size).fill(-50), tropAboveTop: Array(size).fill(0),
  vmax: Array(size).fill(60), pmax: Array(size).fill(250), jets: [], checks: {}, ...overrides,
})

test('FL is ISA pressure altitude', () => {
  assert.equal(Math.round(pressureToFl(1013.25)), 0)
  assert.equal(Math.round(pressureToFl(226.32)), 361)
  assert.equal(Math.round(pressureToFl(250)), 340)
  assert.ok(Number.isNaN(pressureToFl(null)))
})

test('the closest forecast time is chosen and nothing is chosen without times', () => {
  const times = [{ hf: 0, validTime: '2026-05-01T00:00:00Z' }, { hf: 3, validTime: '2026-05-01T03:00:00Z' }]
  assert.equal(pickTropopauseTime(times, Date.parse('2026-05-01T02:00:00Z')).hf, 3)
  assert.equal(pickTropopauseTime([], Date.now()), null)
})

test('display tropopause is capped at FL450, above-top counts as the cap and gaps fill from neighbours', () => {
  const trop = Array(size).fill(250)
  trop[5] = 100 // FL530 → capped
  trop[6] = null // undetermined → filled by smoothing
  const above = Array(size).fill(0)
  above[7] = 1
  const display = buildTropDisplayFl(field({ trop, tropAboveTop: above }), 0)
  assert.equal(display[5], TROP_CAP_FL)
  assert.equal(display[7], TROP_CAP_FL)
  assert.ok(Number.isNaN(display[6]))
  assert.ok(Number.isFinite(buildTropDisplayFl(field({ trop, tropAboveTop: above }), 1)[6]))
})

test('band colours follow the five FL steps and leave FL450 and above unfilled', () => {
  assert.equal(tropBandColor(290), TROP_BANDS[0].color)
  assert.equal(tropBandColor(345), TROP_BANDS[2].color)
  assert.equal(tropBandColor(449), TROP_BANDS[4].color)
  assert.equal(tropBandColor(450), null)
})

// Mapbox image coordinates cover the outer pixel edges. Compare raster transitions
// with independently projected contour positions, allowing half a pixel for sampling.
const rgbaAt = (raster, x, y) => Array.from(raster.data.slice((y * raster.width + x) * 4, (y * raster.width + x + 1) * 4))

test('all horizontal band boundaries align with Mapbox-projected contours, including the transparent cap', () => {
  const wideGrid = { nx: 205, ny: 169, lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 }
  const display = Float32Array.from({ length: wideGrid.nx * wideGrid.ny }, (_, k) => {
    const lat = wideGrid.latMin + Math.floor(k / wideGrid.nx) / (wideGrid.ny - 1) * (wideGrid.latMax - wideGrid.latMin)
    return Math.min(TROP_CAP_FL, 260 + (lat - wideGrid.latMin) * 20)
  })
  const edges = buildTropEdges({ grid: wideGrid }, display)
  const top = mapboxgl.MercatorCoordinate.fromLngLat([wideGrid.lonMin, wideGrid.latMax])
  const bottom = mapboxgl.MercatorCoordinate.fromLngLat([wideGrid.lonMin, wideGrid.latMin])
  for (const scale of [2, 4, 8]) {
    const raster = buildTropJetRaster({ grid: wideGrid }, display, scale)
    const transitions = []
    for (let y = 1; y < raster.height; y++) {
      if (rgbaAt(raster, 0, y).join() !== rgbaAt(raster, 0, y - 1).join()) transitions.push(y)
    }
    assert.equal(transitions.length, edges.length)
    edges.forEach((edge, i) => {
      assert.equal(edge.lines.length, 1)
      const [lon, lat] = edge.lines[0][0]
      const projected = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat])
      const expectedRow = (projected.y - top.y) / (bottom.y - top.y) * raster.height
      const actualRow = transitions[transitions.length - 1 - i]
      assert.ok(Math.abs(actualRow - expectedRow) <= 0.5, `FL${edge.level}, scale ${scale}: raster row ${actualRow}, contour row ${expectedRow}`)
    })
    assert.equal(rgbaAt(raster, 0, 0)[3], 0)
    assert.equal(rgbaAt(raster, 0, raster.height - 1)[3], 150)
  }
})

test('longitude band boundaries align across the full image extent without stretching the last grid cell', () => {
  const display = Float32Array.from({ length: size }, (_, k) => Math.min(TROP_CAP_FL, 270 + k % grid.nx / (grid.nx - 1) * 200))
  const raster = buildTropJetRaster({ grid }, display)
  const edges = buildTropEdges({ grid }, display)
  const transitions = []
  for (let x = 1; x < raster.width; x++) {
    if (rgbaAt(raster, x, 0).join() !== rgbaAt(raster, x - 1, 0).join()) transitions.push(x)
  }
  assert.equal(transitions.length, edges.length)
  edges.forEach((edge, i) => {
    const lon = edge.lines[0][0][0]
    const expectedColumn = (lon - grid.lonMin) / (grid.lonMax - grid.lonMin) * raster.width
    assert.ok(Math.abs(transitions[i] - expectedColumn) <= 0.5, `FL${edge.level}: raster column ${transitions[i]}, contour column ${expectedColumn}`)
  })
})

test('barbs follow the SIGWX rule: core, then ±20 kt or ±3,000 ft changes at least 400 km apart', () => {
  const vmax = Array(size).fill(100)
  const pmax = Array(size).fill(250)
  for (let j = 0; j < grid.ny; j++) for (let i = 15; i < grid.nx; i++) vmax[j * grid.nx + i] = 130 // eastern part faster
  const coordinates = Array.from({ length: 41 }, (_, k) => [120 + k * 0.25, 32.5])
  const jet = { coordinates, core: { lon: 120.5, lat: 32.5, speedKt: 105, pressureHpa: 250, layer80KtHpa: [350, 180] } }
  const barbs = pickJetBarbs(field({ vmax, pmax }), jet)
  assert.equal(barbs[0].core, true)
  assert.equal(barbs[0].layerLabel, `${Math.round(pressureToFl(350) / 10) * 10}/${Math.round(pressureToFl(180) / 10) * 10}`)
  const later = barbs.filter(b => !b.core)
  assert.equal(later.length, 1)
  assert.equal(later[0].speedKt, 130)
  assert.ok(later[0].coordinates[0] >= 127.25) // nearest grid column (0.5°) already holds 130 kt
})

test('the model draws only checked axes and the point report keeps raw values', () => {
  const jets = [{ coordinates: [[121, 32], [128, 33]], axisShown: true, minor: false, core: { lon: 124, lat: 32.5, speedKt: 120, pressureHpa: 250, layer80KtHpa: null } },
    { coordinates: [[121, 34], [128, 34]], axisShown: false, minor: false, core: { lon: 124, lat: 34, speedKt: 110, pressureHpa: 250, layer80KtHpa: null } }]
  const model = buildTropopauseJetModel(field({ jets }))
  assert.equal(model.jets.length, 1)
  assert.equal(model.raster.width, grid.nx * 4)
  const above = Array(size).fill(0); above[0] = 1
  assert.deepEqual(describeTropopauseJetPoint(field({ tropAboveTop: above }), 120, 30).tropopause, { aboveTop: true })
  const point = describeTropopauseJetPoint(field(), 125, 32.5)
  assert.equal(point.tropopause.flightLevel, 340)
  assert.deepEqual(point.maxWind, { speedKt: 60, flightLevel: 340 })
  assert.equal(describeTropopauseJetPoint(field(), 140, 32.5), null)
})
