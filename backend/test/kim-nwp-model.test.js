import assert from 'node:assert/strict'
import test from 'node:test'

import {
  KIM_NWP_FORECAST_HOURS,
  KIM_NWP_ICING_LEVEL_IDS,
  KIM_NWP_LEVELS,
  KIM_NWP_MOISTURE_LEVEL_IDS,
  buildKimCloudPotentialFieldFromGrid,
  buildKimIcingFieldFromGrid,
  buildKimTemperatureFieldFromGrid,
  buildKimNwpGrid,
  buildKimNwpIndexEntry,
  buildKimNwpIndex,
  buildKimSurfaceWindFieldFromWindGrid,
  calcFreezingBonus,
  calcIcingMemberships,
  calcLiquidRatio,
  calcPhasePenalty,
  calcSfipBaseScore,
  filterKimNwpIndexForVariables,
  icingGradeFor,
  icingHardGate,
  isKimNwpIcingLevel,
} from '../src/processors/kim-nwp-model.js'

const BOUNDS = { lonMin: 119, latMin: 30, lonMax: 119.083333, latMax: 30.083333, dx: 0.083333, dy: 0.083333 }
const levelById = (id) => KIM_NWP_LEVELS.find((level) => level.id === id)
const indexEntries = (grids, pathForGrid) => grids.map((grid) => buildKimNwpIndexEntry(grid, pathForGrid(grid)))

function component(variable, values, level = 0) {
  return { variable, unit: 'm/s', level, nx: 2, ny: 2, bounds: BOUNDS, values }
}

function tempComponent(values, unit = 'K') {
  return { variable: 'T', unit, level: 925, nx: 2, ny: 2, bounds: BOUNDS, values }
}

test('KIM wind levels and forecast hours match this phase scope', () => {
  assert.deepEqual(KIM_NWP_LEVELS.map((level) => level.id), ['1000hPa', '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa', '650hPa', '600hPa', '550hPa', '500hPa', '450hPa', '400hPa', '350hPa', '300hPa', '250hPa', '200hPa', '150hPa'])
  assert.deepEqual(KIM_NWP_MOISTURE_LEVEL_IDS, ['1000hPa', '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa', '650hPa', '600hPa', '550hPa', '500hPa', '450hPa', '400hPa', '350hPa', '300hPa', '250hPa', '200hPa', '150hPa'])
  assert.deepEqual(KIM_NWP_FORECAST_HOURS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('icing levels span 1000-300hPa (matches temp section) but exclude 10m and the always-gated top', () => {
  assert.deepEqual(KIM_NWP_ICING_LEVEL_IDS, ['1000hPa', '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa', '650hPa', '600hPa', '550hPa', '500hPa', '450hPa', '400hPa', '350hPa', '300hPa'])
  assert.equal(isKimNwpIcingLevel({ id: '300hPa' }), true)
  assert.equal(isKimNwpIcingLevel({ id: '10m' }), false)
  assert.equal(isKimNwpIcingLevel({ id: '600hPa' }), true)
  // 250/200/150hPa은 항상 -35C 아래라 하드게이트로 class 0 → 수집하지 않는다.
  for (const id of ['250hPa', '200hPa', '150hPa']) assert.equal(isKimNwpIcingLevel({ id }), false, `${id} must stay uncollected`)
})

test('moisture levels extended to 150hPa (matches wind/temp cruise-altitude ceiling)', () => {
  assert.deepEqual(KIM_NWP_MOISTURE_LEVEL_IDS, KIM_NWP_LEVELS.filter((l) => l.kind === 'pressure').map((l) => l.id))
})

test('expanded pressure level set tops at 150hPa for wind/temp', () => {
  const ids = KIM_NWP_LEVELS.map((l) => l.id)
  for (const id of ['1000hPa', '925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa', '250hPa', '200hPa', '150hPa']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
  assert.ok(!ids.includes('100hPa'), '100hPa must be excluded')
})

test('moisture and icing level sets extended to 300hPa', () => {
  for (const id of ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa']) {
    assert.ok(KIM_NWP_MOISTURE_LEVEL_IDS.includes(id), `moisture missing ${id}`)
    assert.ok(KIM_NWP_ICING_LEVEL_IDS.includes(id), `icing missing ${id}`)
  }
})

test('buildKimNwpGrid stores u and v for one time and level', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[2],
    components: [
      component('u', [1, 2, 3, 4], 925),
      component('v', [0, 0, 1, 1], 925),
    ],
    fetchedAt: '2026-05-19T00:15:00.000Z',
  })

  assert.equal(grid.type, 'kim_nwp_grid')
  assert.equal(grid.validTime, '2026-05-19T03:00:00.000Z')
  assert.deepEqual(Object.keys(grid.variables), ['u', 'v'])
  assert.equal(grid.variables.u.encoding, 'int16-scaled-json-v1')
})

test('buildKimNwpGrid stores a temp-only variable grid', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[2],
    components: [tempComponent([279.39, Number.NaN, 280.12, 281.55])],
    fetchedAt: '2026-05-19T00:15:00.000Z',
  })

  assert.deepEqual(Object.keys(grid.variables), ['T'])
  assert.equal(grid.variables.T.unit, 'K')
  assert.equal(grid.variables.T.values[0], 27939)
  assert.equal(grid.variables.T.values[1], -32768)
})

test('existing variables keep 0.01 scale', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[2],
    components: [tempComponent([273.15, 274.15, 275.15, 276.15])],
  })

  assert.equal(grid.variables.T.scale, 0.01)
  assert.equal(grid.variables.T.values[0], Math.round(273.15 / 0.01))
})

test('hydrometeor variables use per-variable fine scale and clip int16', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[3],
    components: [
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 1e-4, 5e-3, Number.NaN] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [-0.3, 0, 0.2, 0.5] },
    ],
  })

  assert.equal(grid.variables.tqc.scale, 2e-7)
  assert.equal(grid.variables.tqc.values[0], 0)
  assert.equal(grid.variables.tqc.values[1], Math.round(1e-4 / 2e-7))
  assert.equal(grid.variables.tqc.values[3], -32768)
  assert.ok(grid.variables.tqc.values[2] <= 32767)
  assert.equal(grid.variables.w.scale, 0.001)
  assert.equal(grid.variables.w.values[0], Math.round(-0.3 / 0.001))
})

test('buildKimSurfaceWindFieldFromWindGrid derives renderer field', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[0],
    components: [
      component('u', [3, 0, 0, 8]),
      component('v', [4, 0, 12, 15]),
      { variable: 'hgt', unit: 'm', level: 1000, nx: 2, ny: 2, bounds: BOUNDS, values: [130, 140, 150, 160] },
    ],
  })

  const field = buildKimSurfaceWindFieldFromWindGrid(grid)

  assert.equal(field.type, 'kim_surface_wind')
  assert.equal(field.level.id, '1000hPa')
  assert.equal(field.stats.maxSpeed, 17)
  assert.deepEqual(field.u, grid.variables.u.values)
  assert.deepEqual(field.v, grid.variables.v.values)
  assert.deepEqual(field.geopotentialHeight, grid.variables.hgt.values)
  assert.deepEqual(field.geopotentialHeightEncoding, {
    encoding: 'int16-scaled-json-v1',
    scale: 1,
    offset: 0,
    missing: -32768,
    unit: 'm',
  })
})

test('buildKimSurfaceWindFieldFromWindGrid still rejects grids without u/v pairs', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[2],
    components: [tempComponent([279.39, 280.11, 281.22, 282.33])],
  })

  assert.throws(() => buildKimSurfaceWindFieldFromWindGrid(grid), /u\/v/i)
})

test('buildKimTemperatureFieldFromGrid returns Kelvin T only and excludes NaN from stats', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[2],
    components: [
      component('u', [1, 1, 1, 1], 925),
      component('v', [0, 0, 0, 0], 925),
      tempComponent([279.39, Number.NaN, 280.12, 281.55]),
    ],
    fetchedAt: '2026-05-19T00:15:00.000Z',
  })

  const field = buildKimTemperatureFieldFromGrid(grid)

  assert.equal(field.type, 'kim_nwp_temperature')
  assert.deepEqual(field.units, { T: 'K' })
  assert.deepEqual(field.T, grid.variables.T.values)
  assert.equal(Object.hasOwn(field, 'u'), false)
  assert.equal(Object.hasOwn(field, 'v'), false)
  assert.deepEqual(field.stats, { minT: 279.39, maxT: 281.55, meanT: 280.353 })
})

test('buildKimCloudPotentialFieldFromGrid derives spread and graded moisture potential from T and rh', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[3],
    components: [
      tempComponent([293.15, 293.15, 293.15, Number.NaN]),
      { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 60, 100, 80] },
    ],
  })

  const field = buildKimCloudPotentialFieldFromGrid(grid)

  assert.equal(field.type, 'kim_nwp_cloud_potential')
  assert.deepEqual(field.units, { spread: 'C', cloudPotential: '%' })
  assert.equal(field.thresholdC, 4)
  assert.equal(field.cloudPotential[0] > 0 && field.cloudPotential[0] < 10000, true)
  assert.equal(field.cloudPotential[1], 0)
  assert.equal(field.cloudPotential[2], 10000)
  assert.equal(field.cloudPotential[3], -32768)
})

test('hard gate zeroes score outside T/RH_liq window', () => {
  assert.equal(icingHardGate({ tempC: 5, rhLiq: 90 }), false)
  assert.equal(icingHardGate({ tempC: -40, rhLiq: 90 }), false)
  assert.equal(icingHardGate({ tempC: -10, rhLiq: 50 }), false)
  assert.equal(icingHardGate({ tempC: -10, rhLiq: 80 }), true)
})

test('liquid ratio and phase penalty follow phase-aware icing rules', () => {
  assert.ok(Math.abs(calcLiquidRatio({ tqc: 1e-4, tqr: 0, tqi: 0, tqs: 0 }) - 1) < 1e-6)
  assert.equal(calcPhasePenalty(1), 0)
  assert.equal(calcPhasePenalty(0), 1)
})

test('icing membership control points and freezing bonus are testable regressions', () => {
  const memberships = calcIcingMemberships({
    tempC: -8,
    rhLiq: 98,
    w: 0.5,
    tqc: 5e-4,
    liquidRatio: 0.9,
    cld: 0.8,
  })

  assert.deepEqual(memberships, { mT: 1, mRh: 1, mW: 1, mCl: 1, mLq: 1, mCc: 1 })
  assert.equal(calcFreezingBonus({ tempC: -4, rhLiq: 90, tqr: 2e-4 }), 1)
  assert.equal(calcFreezingBonus({ tempC: -9, rhLiq: 90, tqr: 2e-4 }), 0)
})

test('SFIP-base reference score uses T, RH_liq, w, and tqc only', () => {
  const score = calcSfipBaseScore({ tempC: -8, rhLiq: 98, w: 0.5, tqc: 5e-4 })

  assert.equal(score, 1)
  assert.equal(calcSfipBaseScore({ tempC: 2, rhLiq: 98, w: 0.5, tqc: 5e-4 }), 0)
})

test('buildKimIcingFieldFromGrid derives score and grade', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[3],
    components: [
      tempComponent([263.15, 263.15, 263.15, Number.NaN]),
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 40, 95, 90] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.2, 0.2, 0.2, 0.2] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [2e-4, 2e-4, 2e-4, 2e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 5e-4, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.8, 0.8, 0.8, 0.8] },
    ],
  })

  const field = buildKimIcingFieldFromGrid(grid)

  assert.equal(field.type, 'kim_nwp_icing_potential')
  assert.equal(field.variant, 'k-fip-lite')
  assert.equal(field.fieldEncoding.icingScore.scale, 0.0001)
  assert.equal(field.fieldEncoding.icingGrade.scale, 1)
  assert.ok(field.icingScore[0] > field.icingScore[1])
  assert.equal(field.icingGrade[1], 0)
  assert.ok(field.icingScore[2] < field.icingScore[0])
  assert.equal(field.icingGrade[3], -32768)
})

test('class 3 requires high liquid-water membership or freezing-rain bonus', () => {
  assert.equal(icingGradeFor(0.8, { mCl: 0.3, bFrz: 0 }), 2)
  assert.equal(icingGradeFor(0.8, { mCl: 0.8, bFrz: 0 }), 3)
  assert.equal(icingGradeFor(0.8, { mCl: 0.3, bFrz: 0.6 }), 3)
})

test('filterKimNwpIndexForVariables exposes icing grids only when all required variables exist', () => {
  const fullIcingGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: levelById('850hPa'),
    components: [
      tempComponent([263, 263, 263, 263]),
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 90, 90, 90] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.2, 0.2, 0.2, 0.2] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [1e-4, 1e-4, 1e-4, 1e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.8, 0.8, 0.8, 0.8] },
    ],
  })
  const partialIcingGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: levelById('700hPa'),
    components: [
      tempComponent([263, 263, 263, 263]),
      { variable: 'rh_liq', unit: '%', level: 700, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 90, 90, 90] },
    ],
  })
  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([fullIcingGrid, partialIcingGrid], (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`),
  })

  const icingIndex = filterKimNwpIndexForVariables(index, ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld'])

  assert.deepEqual(icingIndex.levels.map((level) => level.id), ['850hPa'])
  assert.equal(icingIndex.availability['700hPa'], undefined)
})

test('buildKimNwpIndex omits encoded values', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[0],
    components: [
      component('u', [1, 1, 1, 1]),
      component('v', [0, 0, 0, 0]),
    ],
  })

  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([grid], () => 'kim_nwp/runs/KIMG_NE57_2026051900/normalized/hf000/10m/grid.json'),
  })

  assert.equal(index.type, 'kim_nwp_index')
  assert.equal(index.latestRun, '2026051900')
  assert.equal(JSON.stringify(index).includes('"values"'), false)
})

test('buildKimNwpIndex hashes variable content without exposing values', () => {
  const firstGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: levelById('925hPa'),
    components: [
      component('u', [1, 1, 1, 1], 925),
      component('v', [0, 0, 0, 0], 925),
    ],
  })
  const changedGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: levelById('925hPa'),
    components: [
      component('u', [2, 2, 2, 2], 925),
      component('v', [0, 0, 0, 0], 925),
    ],
  })

  const firstIndex = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([firstGrid], (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`),
  })
  const changedIndex = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([changedGrid], (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`),
  })

  assert.notEqual(firstIndex.availability['925hPa']['0'].hashes.u, changedIndex.availability['925hPa']['0'].hashes.u)
  assert.equal(JSON.stringify(firstIndex).includes('"values"'), false)
})

test('filterKimNwpIndexForVariables separates wind and temp availability', () => {
  const windGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[0],
    components: [
      component('u', [1, 1, 1, 1]),
      component('v', [0, 0, 0, 0]),
    ],
  })
  const tempGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: levelById('925hPa'),
    components: [
      component('u', [1, 1, 1, 1], 925),
      component('v', [0, 0, 0, 0], 925),
      tempComponent([279, 280, 281, 282]),
    ],
  })
  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([windGrid, tempGrid], (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`),
  })

  const windIndex = filterKimNwpIndexForVariables(index, ['u', 'v'])
  const tempIndex = filterKimNwpIndexForVariables(index, ['T'])

  assert.deepEqual(windIndex.levels.map((level) => level.id), ['1000hPa', '925hPa'])
  assert.deepEqual(tempIndex.levels.map((level) => level.id), ['925hPa'])
  assert.equal(tempIndex.availability['1000hPa'], undefined)
  assert.deepEqual(windIndex.availability['1000hPa']['0'].variables, ['u', 'v'])
  assert.deepEqual(windIndex.availability['925hPa']['3'].variables, ['u', 'v'])
  assert.deepEqual(tempIndex.availability['925hPa']['3'].variables, ['T'])
})

test('filterKimNwpIndexForVariables exposes cloud grids only when T and rh exist', () => {
  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    entries: indexEntries([
      buildKimNwpGrid({
        model: 'KIMG/NE57',
        tmfc: '2026051900',
        hf: 0,
        level: levelById('925hPa'),
        components: [tempComponent([279, 280, 281, 282])],
      }),
      buildKimNwpGrid({
        model: 'KIMG/NE57',
        tmfc: '2026051900',
        hf: 3,
        level: levelById('850hPa'),
        components: [
          tempComponent([279, 280, 281, 282]),
          { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 80, 70, 60] },
        ],
      }),
    ], (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`),
  })

  const cloudIndex = filterKimNwpIndexForVariables(index, ['T', 'rh'])

  assert.deepEqual(cloudIndex.levels.map((level) => level.id), ['850hPa'])
  assert.deepEqual(cloudIndex.availability['850hPa']['3'].variables, ['T', 'rh'])
})
