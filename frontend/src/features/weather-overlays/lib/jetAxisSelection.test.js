import test from 'node:test'
import assert from 'node:assert/strict'
import { selectJetAxes } from './jetAxisSelection.js'
import { buildTropDisplayFl, buildTropEdges, buildTropJetRaster } from './tropopauseJetModel.js'
import { TROP_BANDS as CANDIDATE_BANDS, TROP_EDGE_LEVELS as CANDIDATE_LEVELS } from '../../../shared/weather/tropopauseJetPresentation.js'

const grid = { nx: 81, ny: 21, lonMin: 100, lonMax: 140, latMin: 20, latMax: 40 }
const field = jets => ({ grid, jets, vmax: Array(81 * 21).fill(130), pmax: Array(81 * 21).fill(250) })
const axis = (start, end, lat, speed = 130, count = 20) => ({ axisShown: true, p95OffsetKm: 10, minor: false,
  coordinates: Array.from({ length: count }, (_, i) => [start + (end - start) * i / (count - 1), lat]),
  core: { lon: (start + end) / 2, lat, speedKt: speed, pressureHpa: 250 },
})

test('short checked fragments do not become full jet axes, but independent strong cores remain available', () => {
  const input = field([axis(110, 125, 30), axis(115, 115.3, 34, 140, 2), axis(120, 120.3, 38, 95, 2)])
  const before = JSON.stringify(input)
  const result = selectJetAxes(input)
  assert.equal(result.jets.length, 1)
  assert.equal(result.cores.length, 1)
  assert.equal(result.cores[0].speedKt, 140)
  assert.equal(result.stats.hidden, 2)
  assert.equal(JSON.stringify(input), before, 'selection never rewrites production grids or axes')
})

test('parallel duplicate axes at the same level are collapsed, distinct levels are kept', () => {
  const input = field([axis(110, 125, 30), axis(112, 124, 30.2)])
  assert.equal(selectJetAxes(input).jets.length, 1)
  // A nearby line at another flight level must not be absorbed into the first.
  for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) input.pmax[y * grid.nx + x] = y >= 11 ? 180 : 250
  input.jets[1] = axis(112, 124, 31)
  assert.equal(selectJetAxes(input).jets.length, 2)
})

test('a 300–500km independent jet needs a strong core, while a long >=80kt jet is preserved', () => {
  assert.equal(selectJetAxes(field([axis(110, 114, 30, 130)])).jets.length, 1)
  assert.equal(selectJetAxes(field([axis(110, 114, 30, 100)])).jets.length, 0)
  assert.equal(selectJetAxes(field([axis(110, 125, 30, 85)])).jets.length, 1)
})

test('only aligned, height-coherent ends with continuous >=80kt support may be joined', () => {
  const input = field([axis(110, 117, 30), axis(117.5, 125, 30)])
  assert.equal(selectJetAxes(input).stats.joined, 1)
  for (let y = 0; y < grid.ny; y++) input.vmax[y * grid.nx + 35] = 60
  assert.equal(selectJetAxes(input).stats.joined, 0, 'do not bridge a weak-wind gap')
  const reverse = axis(125, 117.5, 30)
  assert.equal(selectJetAxes(field([input.jets[0], reverse])).stats.joined, 0, 'do not reverse wind direction to force a merge')
})

test('the 5000ft bands and contours share boundaries, without rounding the raw values', () => {
  assert.deepEqual(CANDIDATE_LEVELS, [250, 300, 350, 400, 450])
  const g = { nx: 21, ny: 11, lonMin: 120, lonMax: 130, latMin: 30, latMax: 35 }
  const display = Float32Array.from({ length: 231 }, (_, k) => Math.min(450, 200 + k % 21 * 15))
  const raster = buildTropJetRaster({ grid: g }, display, 2, CANDIDATE_BANDS)
  const edges = buildTropEdges({ grid: g }, display, CANDIDATE_LEVELS)
  const transitions = []
  for (let x = 1; x < raster.width; x++) {
    const color = i => [...raster.data.slice(i * 4, i * 4 + 4)].join()
    if (color(x) !== color(x - 1)) transitions.push(x)
  }
  assert.equal(transitions.length, edges.length)
  edges.forEach((edge, i) => assert.ok(Math.abs(transitions[i] - (edge.lines[0][0][0] - 120) / 10 * raster.width) <= 0.5))
  const raw = { grid: g, trop: Array(231).fill(250), tropAboveTop: Array(231).fill(0) }
  const before = JSON.stringify(raw)
  buildTropDisplayFl(raw)
  assert.equal(JSON.stringify(raw), before)
})
