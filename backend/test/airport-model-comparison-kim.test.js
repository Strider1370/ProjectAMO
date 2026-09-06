import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { collectKimAirportComparison, createKimComparisonHourLoader, sampleKimAirport } from '../src/airport-model-comparison/kim.js'
import { buildKimNwpGrid, KIM_NWP_LEVELS } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { readCollectionAttempt } from '../src/airport-model-comparison/store.js'

const bounds = { lonMin: 129, lonMax: 130, latMin: 35, latMax: 36, dx: 1, dy: 1 }
const airport = { icao: 'RKPU', lat: 35.45, lon: 129.35 }

test('sampleKimAirport selects nearest grid point and rejects out-of-domain airports', () => {
  const grid = { nx: 2, ny: 2, bounds, values: [10, 20, 30, 40] }
  assert.deepEqual(sampleKimAirport(grid, airport), { index: 0, grid_lat: 35, grid_lon: 129, value: 10 })
  assert.throws(() => sampleKimAirport(grid, { ...airport, lon: 131 }), /outside_kim_grid/)
})

test('collector loads each grid once for multiple airports and publishes complete records', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-comparison-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const airports = [airport, { icao: 'RKPK', lat: 35.2, lon: 129.2 }]
  let loads = 0
  const loadHour = async ({ hf }) => {
    loads += 1
    const values = [1, 2, 3, 4]
    const component = (value) => ({ nx: 2, ny: 2, bounds, values: values.map(() => value) })
    return {
      surface: { u10m: component(2), v10m: component(-2), t2m: component(290), rh2m: component(70), psl: component(101300), tcld: component(.6), lcld: component(.4), mcld: component(.2), hcld: component(.1), topo: component(10), gust: hf ? component(5) : null, pr: hf ? component(.001) : null },
      layers: [{ pressure_hpa: 1000, hgt: component(100), cld: component(.7), tqc: component(2e-6), tqi: component(0) }],
      revision: `hour-${hf}`,
    }
  }
  const report = await collectKimAirportComparison({ tmfc: '2026090600', forecastHours: Array.from({ length: 13 }, (_, i) => i), root, airports, loadHour })
  assert.equal(loads, 13)
  assert.deepEqual(report.publishedAirports.sort(), ['RKPK', 'RKPU'])
  assert.equal(report.failedAirports.length, 0)
})

test('collector persists its abort attempt and stops before loading the next forecast hour', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-abort-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const controller = new AbortController()
  let loads = 0
  await assert.rejects(collectKimAirportComparison({
    tmfc: '2026090600', forecastHours: Array.from({ length: 13 }, (_, i) => i), root, airports: [airport], signal: controller.signal,
    loadHour: async () => { loads += 1; controller.abort(); return {} },
  }), /abort/i)
  assert.equal(loads, 1)
  const attempt = readCollectionAttempt({ root, model: 'kim' })
  assert.deepEqual(attempt.failedAirports, ['RKPU'])
  assert.equal(attempt.errors[0].code, 'collection_cancelled')
})

test('production loader fetches a surface variable once per hour and reuses topo across hours', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-loader-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const requests = []
  const loader = createKimComparisonHourLoader({
    root, credential: 'fixture', bounds,
    fetchGrid: async request => { requests.push(request); return '# i=2,j=2\n1 1\n1 1\n' },
  })
  await loader({ tmfc: '2026090600', hf: 0 })
  await loader({ tmfc: '2026090600', hf: 1 })
  assert.equal(requests.filter(request => request.name === 'topo').length, 1)
  assert.equal(new Set(requests.map(request => `${request.hf}:${request.data}:${request.level}:${request.name}`)).size, requests.length)
  assert.ok(requests.every(request => request.signal === undefined))
})

test('production loader reuses normalized 10m u v and T before fetching', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-normalized-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const level = KIM_NWP_LEVELS.find(candidate => candidate.id === '10m')
  const component = (variable, value) => ({ variable, unit: variable === 'T' ? 'K' : 'm/s', nx: 2, ny: 2, bounds, values: [value, value, value, value] })
  writeKimNwpGrid({ root, grid: buildKimNwpGrid({ tmfc: '2026090600', hf: 0, level, components: [component('u', 2), component('v', -2), component('T', 290)] }) })
  const requests = []
  const loader = createKimComparisonHourLoader({ root, credential: 'fixture', bounds, fetchGrid: async request => { requests.push(request); return '# i=2,j=2\n1 1\n1 1\n' } })
  const hour = await loader({ tmfc: '2026090600', hf: 0 })
  assert.equal(hour.surface.u10m.values[0], 2)
  assert.equal(hour.surface.t2m.precision_source, 'normalized_scaled')
  assert.deepEqual(requests.filter(request => ['u10m', 'v10m', 't2m'].includes(request.name)), [])
  assert.ok(requests.filter(request => request.data === 'P').every(request => request.level >= 300))
})

test('raw KIM sentinel is missing before sampling and conversion while tiny condensate negatives survive', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-sentinel-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const text = value => `# i=2,j=2\n${value} ${value}\n${value} ${value}\n`
  const loader = createKimComparisonHourLoader({
    root, credential: 'fixture', bounds,
    fetchGrid: async request => {
      if (request.name === 'topo' || request.name === 't2m' || request.name === 'cld' || request.name === 'tqi') return text(-99999)
      if (request.name === 'tqc') return text(-5.82077e-11)
      return text(1)
    },
  })
  const hour = await loader({ tmfc: '2026090600', hf: 0 })
  assert.equal(Number.isNaN(hour.surface.topo.values[0]), true)
  assert.equal(Number.isNaN(hour.surface.t2m.values[0]), true)
  assert.equal(Number.isNaN(hour.layers[0].cld.values[0]), true)
  assert.equal(Number.isNaN(hour.layers[0].tqi.values[0]), true)
  assert.equal(hour.layers[0].tqc.values[0], -5.82077e-11)
})

test('complete comparison window returns reused report without loading grids', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-reuse-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const hours = Array.from({ length: 13 }, (_, i) => i)
  const component = value => ({ nx: 2, ny: 2, bounds, values: [value, value, value, value] })
  const loadHour = async ({ hf }) => ({ surface: { u10m: component(2), v10m: component(-2), t2m: component(290), rh2m: component(70), psl: component(101300), tcld: component(.6), lcld: component(.4), mcld: component(.2), hcld: component(.1), topo: component(10), gust: hf ? component(5) : null, pr: hf ? component(.001) : null }, layers: [{ pressure_hpa: 1000, hgt: component(100), cld: component(.7), tqc: component(2e-6), tqi: component(0) }], revision: `hour-${hf}` })
  await collectKimAirportComparison({ tmfc: '2026090600', forecastHours: hours, root, airports: [airport], loadHour })
  const attemptBefore = JSON.stringify(readCollectionAttempt({ root, model: 'kim' }))
  const report = await collectKimAirportComparison({ tmfc: '2026090600', forecastHours: hours, root, airports: [airport], loadHour: async () => { throw new Error('must not load') } })
  assert.deepEqual(report.reusedAirports, ['RKPU'])
  assert.equal(report.deferred, false)
  assert.deepEqual(report.windows.RKPU.forecast_hours, hours)
  assert.equal(JSON.stringify(readCollectionAttempt({ root, model: 'kim' })), attemptBefore)
})

test('partial KIM attempt is persisted and runs comparison retention after publishing successes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-attempt-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const hours = Array.from({ length: 13 }, (_, i) => i)
  const component = value => ({ nx: 2, ny: 2, bounds, values: [value, value, value, value] })
  const loadHour = async ({ hf }) => ({ surface: { u10m: component(2), v10m: component(-2), t2m: component(290), rh2m: component(70), psl: component(101300), tcld: component(.6), lcld: component(.4), mcld: component(.2), hcld: component(.1), topo: component(10), gust: hf ? component(5) : null, pr: hf ? component(.001) : null }, layers: [{ pressure_hpa: 1000, hgt: component(100), cld: component(.7), tqc: component(2e-6), tqi: component(0) }], revision: `hour-${hf}` })
  const runs = path.join(root, 'airport_model_comparison', 'kim', 'runs')
  for (const run of ['202509010000','202509020000','202509030000','202509040000','202509050000']) fs.mkdirSync(path.join(runs, run), { recursive: true })
  const report = await collectKimAirportComparison({ tmfc: '2026090600', forecastHours: hours, root, airports: [airport, { icao: 'RKPK', lat: 35.2, lon: 200 }], loadHour })
  assert.deepEqual(report.publishedAirports, ['RKPU'])
  assert.deepEqual(report.failedAirports, ['RKPK'])
  assert.equal(report.failed, true)
  const attempt = readCollectionAttempt({ root, model: 'kim' })
  assert.deepEqual(attempt.publishedAirports, ['RKPU'])
  assert.deepEqual(attempt.failedAirports, ['RKPK'])
  assert.equal(attempt.target_run_at, '2026-09-06T00:00:00.000Z')
  assert.equal(fs.existsSync(path.join(runs, '202509010000')), false)
})
