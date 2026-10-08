import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, fork } from 'node:child_process'
import config from '../src/config.js'
import { KIM_NWP_LEVELS, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid, listKimTropopauseFields, readKimTropopauseIndex, readKimTropopauseLatest, readKimTropopauseField, writeKimTropopauseField, publishKimTropopauseRun, cleanupKimNwpRuns } from '../src/processors/kim-nwp-store.js'
import { process as collect, TROPOPAUSE_ALGORITHM, validateTropopauseSupplement } from '../src/processors/kim-tropopause-processor.js'
import { resolveApiOperation } from '../src/api-operation-registry.js'

const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-trop-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
const GRID = { nx: 3, ny: 3, lonMin: 124, lonMax: 130, latMin: 33, latMax: 40, dx: 3, dy: 3.5 }
const TMFC = '2099010100'
// ISA-like temperature (K) and height (m) for a pressure (hPa).
const isa = p => { const h = p >= 226.32 ? 44330.8 * (1 - (p / 1013.25) ** 0.190263) : 11000 + 6341.6 * Math.log(226.32 / p); return { h, t: h <= 11000 ? 288.15 - 0.0065 * h : 216.65 } }

function seedBase(root, hf = 0) {
  for (const level of pressures) {
    const { h, t } = isa(level.value)
    const size = GRID.nx * GRID.ny
    writeKimNwpGrid({ root, grid: { type: 'kim_nwp_grid', model: 'KIMG/NE57', tmfc: TMFC, hf, validTime: addForecastHours(TMFC, hf), level, grid: GRID,
      variables: { u: { unit: 'm/s', values: Array(size).fill(20) }, v: { unit: 'm/s', values: Array(size).fill(0) }, T: { unit: 'K', values: Array(size).fill(t) }, hgt: { unit: 'm', values: Array(size).fill(h) } } } })
  }
}

function supplementText({ name, level, hf }) {
  const value = name === 'T' ? 216.65 : name === 'hgt' ? isa(level).h : 12.5
  return `# fname: /ARCV/g576_v091_glob_prs.2byte.ft${String(hf).padStart(3, '0')}.${TMFC}.nc, fsize: 1byte, level: ${level}\n`
    + `# 변수명 = ${name}, unit = ${name === 'T' ? 'K' : name === 'hgt' ? 'm' : 'm/s'}, level =     ${level}, i =     3, j =     3, map = S (lon1 = 124.0, lat1 = 33.0, lon2 = 130.0, lat2 = 40.0, x_min = 1, y_min = 1, x_max = 3, y_max = 3)\n`
    + Array(3).fill(` ${value.toFixed(5)}  ${value.toFixed(5)}  ${value.toFixed(5)}`).join('\n') + '\n'
}

const fakeResult = () => ({ algorithm: TROPOPAUSE_ALGORITHM, trop: Array(9).fill(226.3), tropT: Array(9).fill(-56.5), tropAboveTop: Array(9).fill(0),
  vmax: Array(9).fill(38.9), pmax: Array(9).fill(250), jets: [], checks: { axes: 0 } })

function seedPublished(root, { hours = [0], revision = 'c'.repeat(20) } = {}) {
  const entries = hours.map(hf => {
    const field = { type: 'kim_nwp_tropopause', product: 'TROP_JET', model: 'KIMG/NE57', grid: GRID, time: { tmfc: TMFC, hf, validTime: addForecastHours(TMFC, hf) },
      encoding: 'float-json-v1', ...fakeResult(), revision, inputRevision: 'd'.repeat(20), algorithm: TROPOPAUSE_ALGORITHM }
    writeKimTropopauseField(root, field)
    return { hf, validTime: field.time.validTime, revision, inputRevision: field.inputRevision }
  })
  return publishKimTropopauseRun(root, { tmfc: TMFC, model: 'KIMG/NE57', algorithm: TROPOPAUSE_ALGORITHM, revision, expectedHours: hours, entries })
}

test('tropopause store publishes only complete runs and serves exact immutable fields', t => {
  const root = temporary(t)
  const manifest = seedPublished(root, { hours: [0, 3] })
  const index = readKimTropopauseIndex(root)
  assert.equal(index.product, 'TROP_JET')
  assert.deepEqual(index.times.map(time => time.hf), [0, 3])
  assert.equal(readKimTropopauseField({ root, tmfc: TMFC, hf: 3, revision: manifest.revision }).trop[0], 226.3)
  assert.equal(readKimTropopauseField({ root, tmfc: TMFC, hf: 3 }).revision, manifest.revision)
  assert.throws(() => readKimTropopauseField({ root, tmfc: TMFC, hf: 3, revision: '../../etc' }))
  assert.throws(() => publishKimTropopauseRun(root, { ...manifest, expectedHours: [0, 3, 6] }), /Incomplete/)
  assert.throws(() => writeKimTropopauseField(root, { ...readKimTropopauseField({ root, tmfc: TMFC, hf: 0 }), vmax: Array(9).fill(1) }), /collision/)
  assert.deepEqual(listKimTropopauseFields(root).map(f => `${f.tmfc}/${f.hf}/${f.revision}`), [`${TMFC}/0/${manifest.revision}`, `${TMFC}/3/${manifest.revision}`])
  cleanupKimNwpRuns({ root, maxRuns: 1 })
  assert.equal(readKimTropopauseLatest(root).revision, manifest.revision)
})

test('base waiting keeps the previous publication without fetching', async t => {
  const root = temporary(t)
  const manifest = seedPublished(root)
  let calls = 0
  const result = await collect({ root, tmfc: '2099010106', forecastHours: [0], fetchGrid: () => { calls++; throw new Error('must not fetch') } })
  assert.equal(result.collection.outcome, 'partial')
  assert.equal(calls, 0)
  assert.equal(readKimTropopauseLatest(root).revision, manifest.revision)
})

test('processor fetches only 100/70 hPa T, hgt, u and v with the run key, caches them and publishes a complete run', async t => {
  const root = temporary(t)
  seedBase(root)
  const saved = { radar: config.api.radar_satellite_auth_key, kim: config.api.kim_nwp_auth_key, aviation: config.api.auth_key }
  Object.assign(config.api, { radar_satellite_auth_key: 'radar-key', kim_nwp_auth_key: 'kim-key', auth_key: 'aviation-key' })
  t.after(() => Object.assign(config.api, { radar_satellite_auth_key: saved.radar, kim_nwp_auth_key: saved.kim, auth_key: saved.aviation }))
  const requests = []
  let cube = null
  const run = () => collect({ root, tmfc: TMFC, forecastHours: [0],
    fetchGrid: async request => { requests.push(request); return supplementText(request) },
    calculate: async input => { cube = input; return fakeResult() } })
  const result = await run()
  assert.equal(result.collection.outcome, 'complete')
  assert.deepEqual(requests.map(r => `${r.name}@${r.level}`).sort(), ['T@100', 'T@70', 'hgt@100', 'hgt@70', 'u@100', 'u@70', 'v@100', 'v@70'])
  assert.ok(requests.every(r => r.credential === 'kim-key' && r.data === 'P')) // 00 UTC run → KIM key
  assert.deepEqual(cube.pressures.slice(-3), [150, 100, 70])
  // 바람은 제트 탐색 층(500~150 hPa)만 넘긴다.
  assert.deepEqual(cube.windPressures, [500, 450, 400, 350, 300, 250, 200, 150])
  assert.equal(readKimTropopauseIndex(root).times.length, 1)
  // Cached raw supplements and the immutable result are reused without new requests.
  await run()
  assert.equal(requests.length, 8)
  // 상층 바람은 단면 응답에만 붙고, 100·70 hPa 층으로 나온다.
  const { loadTropopauseCrossSection } = await import('../src/briefing/tropopause-cross-section.js')
  const section = loadTropopauseCrossSection({ root, axis: { samples: [{ lon: 127, lat: 36, distanceNm: 0 }] }, validTime: addForecastHours(TMFC, 0) })
  assert.deepEqual(section.upperLevels.map(l => l.pressure), [100, 70])
  assert.equal(section.upperLevels[0].values[0].u, 12.5)
  assert.ok(Math.abs(section.upperLevels[1].altFt - isa(70).h * 3.28084) < 1)
})

test('an unchanged published run is skipped without rereading; a rewritten input or missing output reruns it', async t => {
  const root = temporary(t)
  seedBase(root)
  const saved = config.api.kim_nwp_auth_key
  config.api.kim_nwp_auth_key = 'kim-key'
  t.after(() => { config.api.kim_nwp_auth_key = saved })
  let calculations = 0
  const run = () => collect({ root, tmfc: TMFC, forecastHours: [0], fetchGrid: async request => supplementText(request),
    calculate: async () => { calculations++; return fakeResult() } })
  const first = await run()
  assert.equal(first.collection.outcome, 'complete')
  assert.ok(readKimTropopauseLatest(root).baseFingerprint)
  const skipped = await run()
  assert.equal(skipped.unchanged, true)
  assert.equal(skipped.collection.outcome, 'complete')
  assert.equal(skipped.revision, first.revision)
  // 같은 값으로 다시 쓴 격자도 지문이 달라져 다시 확인한다(결과가 있으면 계산은 하지 않는다).
  seedBase(root)
  assert.equal((await run()).unchanged, undefined)
  assert.equal(calculations, 1)
  assert.equal((await run()).unchanged, true)
  // 게시된 결과가 사라지면 건너뛰지 않고 다시 계산한다.
  const { revision } = readKimTropopauseLatest(root).entries[0]
  for (const extension of ['json', 'nc']) fs.rmSync(path.join(root, `kim_nwp/runs/KIMG_NE57_${TMFC}/derived/tropopause/hf000/${revision}.${extension}`), { force: true })
  assert.equal((await run()).collection.outcome, 'complete')
  assert.equal(calculations, 2)
})

test('the child-process worker computes from the shared data and fetches supplements only through the parent', { skip: !fs.existsSync(config.kim_tropopause.python) && 'tropopause Python environment unavailable' }, async t => {
  const root = temporary(t)
  seedBase(root)
  fs.writeFileSync(path.join(root, 'kim_nwp/latest.json'), JSON.stringify({ latestRun: TMFC }))
  const { runKimDerivedWorker } = await import('../src/processors/kim-derived-worker.js')
  const requests = []
  const result = await runKimDerivedWorker('kim_tropopause', {
    workerConfig: { timeout_ms: 120_000, max_old_space_mb: 512, nice: 10 },
    setPriority: () => {},
    forkImpl: (entry, args, options) => fork(entry, args, { ...options, env: { ...process.env, DATA_PATH: root, KMA_KIM_NWP_AUTH_KEY: 'kim-key' } }),
    fetchGrid: async request => { requests.push(request); return supplementText(request) },
  })
  assert.equal(result.type, 'kim_tropopause')
  assert.equal(result.tmfc, TMFC)
  assert.equal(requests.length, 8)
  assert.ok(requests.every(r => r.credential === 'kim-key' && r.signal instanceof AbortSignal))
  // 자식이 실제 Python까지 불렀다: 이 고정 격자는 경위도 간격이 달라(3°×3.5°) Python 입력 검사에서 거절된다.
  // 기본 격자가 없는 나머지 시각과 함께 실패로 남아 게시하지 않는다.
  assert.match(result.failures.find(f => f.hf === 0).reason, /tropopause_python_failed.*grid must be square/s)
  assert.equal(result.fields, 0)
  assert.equal(result.collection.outcome, 'partial')
})

test('a missing run key or a wrong supplement leaves the run partial', async t => {
  const root = temporary(t)
  seedBase(root)
  const saved = config.api.kim_nwp_auth_key
  config.api.kim_nwp_auth_key = ''
  t.after(() => { config.api.kim_nwp_auth_key = saved })
  const result = await collect({ root, tmfc: TMFC, forecastHours: [0], fetchGrid: async () => assert.fail('must not fetch'), calculate: async () => fakeResult() })
  assert.equal(result.collection.outcome, 'partial')
  assert.match(result.failures[0].reason, /credential_unavailable/)
  assert.throws(() => validateTropopauseSupplement(supplementText({ name: 'T', level: 100, hf: 3 }), { name: 'T', level: 100, tmfc: TMFC, hf: 0, grid: GRID }), /identity/)
})

test('100/70 hPa T/hgt requests are accounted as the tropopause supplement operation', () => {
  const url = name => new URL(`https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std?name=${name}&level=100&sub=${config.kim_surface_wind.sub}`)
  assert.equal(resolveApiOperation({ url: url('T') })?.id, 'kim_grid_trop')
  assert.equal(resolveApiOperation({ url: url('u') })?.id, 'kim_grid_trop')
  assert.equal(resolveApiOperation({ url: url('hgt') })?.id, 'kim_grid_trop')
  assert.equal(resolveApiOperation({ url: new URL(`https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std?name=T&level=150&sub=${config.kim_surface_wind.sub}`) })?.id, 'kim_grid')
})

// The real calculator runs only where the GKTG virtual environment exists.
const python = config.kim_tropopause.python
test('Python calculator finds the ISA tropopause and a synthetic jet', { skip: !fs.existsSync(python) && 'tropopause Python environment unavailable' }, t => {
  const dir = temporary(t)
  const nx = 101, ny = 41, size = nx * ny
  const full = [...pressures.map(p => p.value), 100, 70]
  const grid = { nx, ny, lonMin: 120, lonMax: 128.333333, latMin: 33, latMax: 36.333333, dx: 1 / 12, dy: 1 / 12 }
  const jetSpeed = (p, j) => 70 * Math.exp(-(((j - 20) / 4) ** 2)) * Math.exp(-((Math.log(p / 250) / 0.35) ** 2))
  const fields = {
    T: full.map(p => Array(size).fill(isa(p).t)), hgt: full.map(p => Array(size).fill(isa(p).h)),
    u: pressures.map(p => Array.from({ length: size }, (_, i) => 10 + jetSpeed(p.value, Math.floor(i / nx)))), v: pressures.map(() => Array(size).fill(0)),
  }
  // Node가 쓰는 입력과 같은 모양: job.json + cube.f8(T·hgt 전 기압면, u·v 바람 기압면 순서의 float64).
  const cube = Float64Array.from(['T', 'hgt', 'u', 'v'].flatMap(name => fields[name].flat()))
  fs.writeFileSync(path.join(dir, 'cube.f8'), Buffer.from(cube.buffer))
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ grid, hf: 0, pressures: full, windPressures: pressures.map(p => p.value), cube: 'cube.f8' }))
  const run = spawnSync(python, [path.join(import.meta.dirname, '../python/kim_tropopause/calculate.py'), path.join(dir, 'job.json'), dir], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))
  assert.equal(result.algorithm, TROPOPAUSE_ALGORITHM)
  const mid = 20 * nx + 50
  // ISA tropopause is 226.3 hPa. On 250/200/150 hPa levels the 250-200 layer mixes troposphere
  // and stratosphere, so the half-level method places it near 207 hPa (Reichler et al. 2003 report
  // 30-40 hPa RMS in mid-latitudes for coarse data).
  assert.ok(result.trop[mid] < 226.3 && result.trop[mid] > 195, `tropopause ${result.trop[mid]}`)
  assert.ok(result.vmax[mid] > 140 && Math.abs(result.pmax[mid] - 250) < 25, `max wind ${result.vmax[mid]} kt at ${result.pmax[mid]}`)
  const main = result.jets.filter(j => !j.minor)
  assert.equal(main.length, 1)
  assert.ok(main[0].axisShown)
  assert.ok(Math.abs(main[0].core.lat - (33 + 20 / 12)) < 0.1)
  assert.ok(main[0].coordinates[0][0] < main[0].coordinates.at(-1)[0], 'axis runs downstream (west to east)')
})

test('route cross-section samples tropopause and max wind as pressure altitude and refuses other times', async t => {
  const { loadTropopauseCrossSection, pressureAltitudeFt } = await import('../src/briefing/tropopause-cross-section.js')
  const root = temporary(t)
  const manifest = seedPublished(root)
  const axis = { samples: [{ lon: 125, lat: 35, distanceNm: 0 }, { lon: 140, lat: 35, distanceNm: 10 }] }
  const section = loadTropopauseCrossSection({ root, axis, validTime: manifest.entries[0].validTime })
  assert.equal(section.available, true)
  assert.ok(Math.abs(section.samples[0].tropopauseFt - 36089) < 5)
  assert.ok(Math.abs(section.samples[0].maxWindFt - pressureAltitudeFt(250)) < 1)
  assert.equal(section.samples[1].tropopauseFt, null)
  assert.equal(loadTropopauseCrossSection({ root, axis, validTime: '2099-01-01T05:00:00.000Z' }).available, false)
})

test('fetchKimGrid accounts 100/70 hPa T/hgt requests as the tropopause operation', async () => {
  const { buildKimGridUrl } = await import('../src/api-client.js')
  const url = new URL(buildKimGridUrl({ data: 'P', name: 'hgt', level: 70, tmfc: TMFC, hf: 0, sub: config.kim_surface_wind.sub, credential: 'x' }))
  assert.equal(resolveApiOperation({ id: 'kim_grid_trop', url })?.id, 'kim_grid_trop')
  const source = fs.readFileSync(new URL('../src/api-client.js', import.meta.url), 'utf8')
  assert.match(source, /operation = 'kim_grid_trop'/)
})

test('supplement key follows the run: 12 UTC radar key, 18 UTC aviation key', async () => {
  const { selectKimRunCredential } = await import('../src/processors/kim-run-credential.js')
  const keys = { kimCredential: 'kim', aviationCredential: 'aviation', radarCredential: 'radar' }
  assert.equal(selectKimRunCredential({ tmfc: '2099010112', ...keys }), 'radar')
  assert.equal(selectKimRunCredential({ tmfc: '2099010118', ...keys }), 'aviation')
  assert.match(fs.readFileSync(new URL('../src/processors/kim-tropopause-processor.js', import.meta.url), 'utf8'), /selectKimRunCredential\(/)
})
