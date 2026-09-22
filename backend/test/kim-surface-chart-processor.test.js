import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildSurfaceChartRequests,
  process as processSurfaceChart,
  readSurfaceChartLatest,
} from '../src/processors/kim-surface-chart-processor.js'

const STEP = 1 / 12
const SETTINGS = Object.freeze({
  view: { lonMin: 120, lonMax: 130, latMin: 30, latMax: 38 },
  grid: { lonMin: 114, latMin: 24, nx: 22 * 12 + 1, ny: 20 * 12 + 1, step: STEP },
  sub: '1369,1369,1633,1609',
  forecast_hours: [3, 6, 9, 12],
  concurrency: 2,
  max_runs: 2,
})
const KEY = 'test-radar-key'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-kim-chart-'))
}

// KIM 격자 응답 텍스트. 헤더의 i·j로 크기를 알려준다(값은 남쪽 행부터).
function gridText(valueAt) {
  const { nx, ny, lonMin, latMin } = SETTINGS.grid
  const rows = [`# 변수명 = x, unit = x, level = 0, i = ${nx}, j = ${ny}, map = S`]
  for (let j = 0; j < ny; j += 1) {
    const row = []
    for (let i = 0; i < nx; i += 1) row.push(valueAt(lonMin + i * STEP, latMin + j * STEP).toExponential(5))
    rows.push(row.join(' '))
  }
  return rows.join('\n')
}

const lowPressure = (lon, lat) => 101_200 - 2_000 * Math.exp(-(((lon - 125) ** 2) + ((lat - 34) ** 2)) / (2 * 2 ** 2))
const RESPONSES = {
  psl: gridText(lowPressure),
  prec_acc: gridText(() => 0),
  u10m: gridText(() => 5),
  v10m: gridText(() => -3),
}
const NOT_AVAILABLE = '# file is not exist\n'

function fakeFetch({ unavailable = new Set(), override = {} } = {}) {
  const calls = []
  const fetchGrid = async (params) => {
    calls.push(params)
    if (unavailable.has(params.tmfc)) return NOT_AVAILABLE
    return override[params.name] ?? RESPONSES[params.name]
  }
  return { calls, fetchGrid }
}

const candidates = (...tmfcs) => tmfcs.map((tmfc) => ({ tmfc, hf: 0 }))

test('each run needs four variables at four forecast hours', () => {
  const requests = buildSurfaceChartRequests('2026092200', [3, 6, 9, 12])
  assert.equal(requests.length, 16)
  assert.deepEqual([...new Set(requests.map((request) => request.name))], ['psl', 'prec_acc', 'u10m', 'v10m'])
})

test('a gap in forecast hours adds the accumulated precip needed for the 3 hour amount', () => {
  const requests = buildSurfaceChartRequests('2026092200', [6])
  assert.deepEqual(requests.filter((request) => request.name === 'prec_acc').map((request) => request.hf).sort(), [3, 6])
})

test('publishes a complete run with the chart operation, the chart area and the radar/satellite key', async () => {
  const root = tempRoot()
  const { calls, fetchGrid } = fakeFetch()
  const result = await processSurfaceChart({ candidates: candidates('2026092200'), fetchGrid, root, settings: SETTINGS, credential: KEY })
  assert.equal(result.saved, true)
  assert.equal(calls.length, 16)
  assert.ok(calls.every((call) => call.operation === 'kim_grid_chart' && call.sub === SETTINGS.sub && call.credential === KEY && call.map === 'S'))

  const latest = readSurfaceChartLatest(root)
  assert.equal(latest.latestRunId, 'KIMG_NE57_2026092200')
  const [run] = latest.runs
  assert.deepEqual(run.frames.map((frame) => frame.hf), [3, 6, 9, 12])
  assert.equal(run.frames[0].validTimeMs, Date.UTC(2026, 8, 22, 3))
  assert.equal(run.frames[0].precipStartMs, Date.UTC(2026, 8, 22, 0))
  assert.ok(Number.isFinite(run.revision), 'each publication carries a cache-busting revision')
  for (const frame of run.frames) {
    for (const file of Object.values(latest.files)) assert.ok(fs.existsSync(path.join(root, frame.path, file)), `${frame.path}/${file}`)
  }
  const centers = JSON.parse(fs.readFileSync(path.join(root, run.frames[0].path, 'centers.json'), 'utf8'))
  assert.deepEqual(centers.features.map((feature) => feature.properties.kind), ['L'])
  assert.equal(centers.features[0].properties.pressureHpa, 992)

  const written = fs.readdirSync(path.join(root, 'kim_surface_chart'), { recursive: true })
    .filter((name) => name.endsWith('.json'))
    .map((name) => fs.readFileSync(path.join(root, 'kim_surface_chart', name), 'utf8'))
  assert.ok(written.every((text) => !text.includes(KEY)))
})

test('skips when the newest available run is already published', async () => {
  const root = tempRoot()
  await processSurfaceChart({ candidates: candidates('2026092200'), fetchGrid: fakeFetch().fetchGrid, root, settings: SETTINGS, credential: KEY })
  const { calls, fetchGrid } = fakeFetch({ unavailable: new Set(['2026092206']) })
  const result = await processSurfaceChart({ candidates: candidates('2026092206', '2026092200'), fetchGrid, root, settings: SETTINGS, credential: KEY })
  assert.equal(result.skipped, true)
  assert.equal(calls.length, 1)
})

test('falls back to the previous run when the newest one is not released yet', async () => {
  const root = tempRoot()
  const { fetchGrid } = fakeFetch({ unavailable: new Set(['2026092206']) })
  const result = await processSurfaceChart({ candidates: candidates('2026092206', '2026092200'), fetchGrid, root, settings: SETTINGS, credential: KEY })
  assert.equal(result.latestRun, '2026092200')
})

test('an invalid grid keeps the last good run', async () => {
  const root = tempRoot()
  await processSurfaceChart({ candidates: candidates('2026092200'), fetchGrid: fakeFetch().fetchGrid, root, settings: SETTINGS, credential: KEY })
  const before = readSurfaceChartLatest(root)
  const { fetchGrid } = fakeFetch({ override: { psl: gridText(() => 50_000) } })
  await assert.rejects(() => processSurfaceChart({ candidates: candidates('2026092206'), fetchGrid, root, settings: SETTINGS, credential: KEY }), /psl_range/)
  assert.deepEqual(readSurfaceChartLatest(root), before)
  assert.deepEqual(fs.readdirSync(path.join(root, 'kim_surface_chart', 'runs')), ['KIMG_NE57_2026092200'])
})

test('keeps only the newest two runs', async () => {
  const root = tempRoot()
  for (const tmfc of ['2026092112', '2026092118', '2026092200']) {
    await processSurfaceChart({ candidates: candidates(tmfc), fetchGrid: fakeFetch().fetchGrid, root, settings: SETTINGS, credential: KEY })
  }
  const latest = readSurfaceChartLatest(root)
  assert.deepEqual(latest.runs.map((run) => run.tmfc), ['2026092200', '2026092118'])
  assert.deepEqual(fs.readdirSync(path.join(root, 'kim_surface_chart', 'runs')).sort(), ['KIMG_NE57_2026092118', 'KIMG_NE57_2026092200'])
})

test('refuses to run without the radar/satellite key', async () => {
  await assert.rejects(() => processSurfaceChart({ candidates: candidates('2026092200'), fetchGrid: fakeFetch().fetchGrid, root: tempRoot(), settings: SETTINGS, credential: '' }), /credential_missing/)
})
