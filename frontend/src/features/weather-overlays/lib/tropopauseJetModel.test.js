import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTropDisplayFl, buildTropopauseJetModel, describeTropopauseJetPoint, pickJetBarbs, pickTropopauseTime, pressureToFl, tropBandColor } from './tropopauseJetModel.js'
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
