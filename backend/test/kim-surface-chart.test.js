import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'

import {
  PRECIP_3H_RAMP,
  SURFACE_CHART_RULES,
  buildIsobars,
  buildPrecipImage,
  buildPressureField,
  buildSurfaceChartFrame,
  buildWindField,
  detectPressureCenters,
  greatCircleDeg,
  precipColor,
  toChartGrid,
} from '../src/lib/kim-surface-chart.js'

const STEP = 1 / 12
const SURFACE_CHART_RULES_FOR_TEST = { ...SURFACE_CHART_RULES, isobarMinLoopDeg: 1.5 }
const VIEW = { lonMin: 120, lonMax: 140, latMin: 30, latMax: 45 }
// 표시 영역보다 사방 6° 넓은 수집 영역
const GRID = { lonMin: 114, latMin: 24, nx: 32 * 12 + 1, ny: 27 * 12 + 1, step: STEP }

// 기본 1012 hPa 위에 가우시안 모양의 저기압/고기압(Pa)을 얹은 해면기압장
function pressureGrid(systems = [], base = 101_200) {
  const values = new Float64Array(GRID.nx * GRID.ny)
  for (let j = 0; j < GRID.ny; j += 1) for (let i = 0; i < GRID.nx; i += 1) {
    const lon = GRID.lonMin + i * STEP
    const lat = GRID.latMin + j * STEP
    let value = base
    for (const { lon: cx, lat: cy, deltaPa, radiusDeg } of systems) {
      const d = greatCircleDeg(lon, lat, cx, cy)
      value += deltaPa * Math.exp(-(d * d) / (2 * radiusDeg * radiusDeg))
    }
    values[j * GRID.nx + i] = value
  }
  return { ...GRID, values }
}

function constantGrid(value) {
  return { ...GRID, values: new Float64Array(GRID.nx * GRID.ny).fill(value) }
}

test('a deep closed low inside the view becomes one L with its raw central pressure', () => {
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: -2_400, radiusDeg: 2.5 }])
  const field = buildPressureField(psl)
  const centers = detectPressureCenters(field, psl, VIEW)
  assert.equal(centers.length, 1)
  assert.equal(centers[0].kind, 'L')
  assert.ok(Math.abs(centers[0].lon - 130) <= 0.5 && Math.abs(centers[0].lat - 38) <= 0.5)
  assert.equal(centers[0].pressureHpa, 988)
})

test('a closed high is reported as H', () => {
  const psl = pressureGrid([{ lon: 126, lat: 36, deltaPa: 1_000, radiusDeg: 3 }])
  const centers = detectPressureCenters(buildPressureField(psl), psl, VIEW)
  assert.deepEqual(centers.map((center) => center.kind), ['H'])
  assert.equal(centers[0].pressureHpa, 1022)
})

test('a shallow bump with no drawn closed isobar is not a center', () => {
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: -60, radiusDeg: 2 }])
  assert.deepEqual(detectPressureCenters(buildPressureField(psl), psl, VIEW), [])
})

test('a low centred in the collection margin is not shown in the view', () => {
  const psl = pressureGrid([{ lon: 117, lat: 38, deltaPa: -2_000, radiusDeg: 2 }])
  assert.deepEqual(detectPressureCenters(buildPressureField(psl), psl, VIEW), [])
})

test('a pressure gradient that runs off the collection edge creates no edge centers', () => {
  const psl = constantGrid(0)
  for (let j = 0; j < GRID.ny; j += 1) for (let i = 0; i < GRID.nx; i += 1) psl.values[j * GRID.nx + i] = 100_000 + i * 20
  assert.deepEqual(detectPressureCenters(buildPressureField(psl), psl, VIEW), [])
})

test('a broad high whose drawn isobar closes is H even though it is shallow near the middle', () => {
  // 6° 떨어져도 0.7 hPa만 낮은 넓은 고기압. 그린 1014 hPa 등압선이 닫히므로 H다.
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: 350, radiusDeg: 9 }])
  const centers = detectPressureCenters(buildPressureField(psl), psl, VIEW)
  assert.deepEqual(centers.map((center) => center.kind), ['H'])
  assert.ok(Math.abs(centers[0].lon - 130) <= 0.5 && Math.abs(centers[0].lat - 38) <= 0.5)
})

test('an extreme with no drawn closed isobar gets no symbol', () => {
  // 1012.5 hPa 위에 1.5 hPa 솟은 고기압: 평활 뒤 1014 hPa에 닿지 않아 닫힌 등압선이 그려지지 않는다.
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: 150, radiusDeg: 3 }], 101_250)
  assert.deepEqual(detectPressureCenters(buildPressureField(psl), psl, VIEW), [])
})

test('the symbol sits at the extreme of the drawn field and reports the raw central pressure', () => {
  // 넓은 저기압 가장자리 쪽에 작은 깊은 핵이 있다. 평활한 장의 극값은 핵에서 벗어나고, 원자료 극값은 핵이다.
  const psl = pressureGrid([{ lon: 128, lat: 38, deltaPa: -1_200, radiusDeg: 4 }, { lon: 129, lat: 38.6, deltaPa: -300, radiusDeg: 0.4 }])
  const field = buildPressureField(psl)
  const [center] = detectPressureCenters(field, psl, VIEW)
  let best = { value: Infinity }
  field.values.forEach((value, index) => { if (value < best.value) best = { value, index } })
  const lon = field.lonMin + (best.index % field.nx) * field.step
  const lat = field.latMin + Math.floor(best.index / field.nx) * field.step
  assert.equal(center.kind, 'L')
  assert.ok(Math.abs(center.lon - lon) < 0.01 && Math.abs(center.lat - lat) < 0.01)
  let raw = Infinity
  for (const value of psl.values) raw = Math.min(raw, value / 100)
  assert.equal(center.pressureHpa, Math.round(raw))
})

test('isobars stay inside the view and mark every 4 hPa line as major', () => {
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: -2_400, radiusDeg: 2.5 }])
  const isobars = buildIsobars(buildPressureField(psl), VIEW)
  assert.ok(isobars.features.length > 0)
  for (const feature of isobars.features) {
    assert.equal(feature.properties.p % 2, 0)
    assert.equal(feature.properties.major, feature.properties.p % 4 === 0)
    for (const [lon, lat] of feature.geometry.coordinates) {
      assert.ok(lon >= VIEW.lonMin - 1e-6 && lon <= VIEW.lonMax + 1e-6 && lat >= VIEW.latMin - 1e-6 && lat <= VIEW.latMax + 1e-6)
    }
  }
})

test('precip colors start at 0.5 mm and follow the ramp', () => {
  assert.equal(precipColor(0.4), null)
  assert.deepEqual(precipColor(0.5), PRECIP_3H_RAMP[0][1])
  assert.deepEqual(precipColor(9.9), [124, 112, 200])
  assert.deepEqual(precipColor(10), [94, 81, 167])
  assert.deepEqual(precipColor(200), [248, 0, 0])
})

test('precip image uses the 3 hour difference and never paints negative amounts', async () => {
  const now = constantGrid(5)
  const prev = constantGrid(9)
  const image = await buildPrecipImage(now, prev, VIEW)
  assert.equal(image.maxMm, 0)
  const { data, info } = await sharp(image.png).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 1400)
  assert.equal(info.height, 1000)
  assert.ok(data.every((value, index) => index % 4 !== 3 || value === 0))
})

test('precip image fades out at the view edge', async () => {
  const image = await buildPrecipImage(constantGrid(20), constantGrid(0), VIEW)
  const { data, info } = await sharp(image.png).raw().toBuffer({ resolveWithObject: true })
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3]
  assert.equal(image.maxMm, 20)
  assert.ok(alpha(0, 500) < 20)
  assert.equal(alpha(700, 500), 255)
})

test('wind field is a 0.25 degree grid over the view in the existing wind field shape', () => {
  const wind = buildWindField(constantGrid(3), constantGrid(-4), VIEW)
  assert.deepEqual(wind.grid, { lonMin: 120, lonMax: 140, latMin: 30, latMax: 45, nx: 81, ny: 61, dx: 0.25, dy: 0.25 })
  assert.equal(wind.u.length, 81 * 61)
  assert.equal(wind.u[0], 3)
  assert.equal(wind.v.at(-1), -4)
})

test('grid parsing rejects a wrong shape and too many missing values', () => {
  assert.throws(() => toChartGrid({ nx: 3, ny: 3, values: new Array(9).fill(1) }, { grid: GRID, name: 'psl' }), /grid_shape/)
  const values = new Array(GRID.nx * GRID.ny).fill(101_000)
  for (let k = 0; k < values.length * 0.02; k += 1) values[k] = -99999
  assert.throws(() => toChartGrid({ nx: GRID.nx, ny: GRID.ny, values }, { grid: GRID, name: 'psl' }), /missing/)
})

test('a frame rejects sea level pressure outside the physical range', async () => {
  await assert.rejects(() => buildSurfaceChartFrame({
    psl: constantGrid(50_000), precNow: constantGrid(0), precPrev: null, u: constantGrid(0), v: constantGrid(0), view: VIEW,
  }), /psl_range/)
})

test('isobar smoothing rounds grid corners and keeps closed lines closed', async () => {
  const { smoothLine } = await import('../src/lib/kim-surface-chart.js')
  const square = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
  const smooth = smoothLine(square, 2)
  assert.deepEqual(smooth[0], smooth.at(-1))
  assert.ok(smooth.length > square.length * 3)
  const corners = new Set(['0,0', '2,0', '2,2', '0,2'])
  assert.ok(smooth.every(([x, y]) => !corners.has(`${x},${y}`)), 'grid corners are cut away')
  assert.ok(smooth.every(([x, y]) => x >= 0 && x <= 2 && y >= 0 && y <= 2), 'the line stays within the original outline')
  const open = smoothLine([[0, 0], [1, 1], [2, 0]], 1)
  assert.deepEqual(open[0], [0, 0])
  assert.deepEqual(open.at(-1), [2, 0])
})

test('tiny closed isobar loops are dropped', () => {
  const psl = pressureGrid([{ lon: 130, lat: 38, deltaPa: -150, radiusDeg: 0.4 }])
  const isobars = buildIsobars(buildPressureField(psl, { ...SURFACE_CHART_RULES_FOR_TEST, gaussianSigmaCells: 1 }), VIEW, { rules: SURFACE_CHART_RULES_FOR_TEST })
  assert.ok(isobars.features.every((feature) => feature.properties.p !== 1010))
})
