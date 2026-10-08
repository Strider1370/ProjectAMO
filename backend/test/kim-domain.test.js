import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../src/config.js'
import { KIM_NWP_LEVELS, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { KIM_EXPANDED_FORECAST_HOURS, kimDomain, kimDomainRequest, parseKimDomain } from '../src/processors/kim-domain.js'
import { cleanupKimNwpRuns, listKimNwpRuns, readKimNwpGrid, readKimNwpLatest, readKimTropopauseIndex, resolveKimNwpGridPath, validateKimNwpSelection,
  writeKimNwpGrid, writeKimNwpLatest, writeKimNwpManifest } from '../src/processors/kim-nwp-store.js'
import { process as collectTropopause, TROPOPAUSE_ALGORITHM } from '../src/processors/kim-tropopause-processor.js'

const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-kim-domain-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }
const TMFC = '2099010100'
const level850 = KIM_NWP_LEVELS.find(level => level.id === '850hPa')

function grid({ tmfc = TMFC, hf = 0, level = level850, nx = 2, value = 1 } = {}) {
  return { type: 'kim_nwp_grid', model: 'KIMG/NE57', tmfc, hf, validTime: addForecastHours(tmfc, hf), level,
    grid: { nx, ny: 1, lonMin: 0, lonMax: nx - 1, latMin: 0, latMax: 0 }, variables: { u: { values: Array(nx).fill(value) }, v: { values: Array(nx).fill(value) } } }
}

test('domain ids parse with a Korea default and reject anything else', () => {
  assert.equal(parseKimDomain(undefined), 'kr')
  assert.equal(parseKimDomain(''), 'kr')
  assert.equal(parseKimDomain('ea'), 'ea')
  for (const bad of ['EA', '../kr', 'constructor', '__proto__']) assert.throws(() => parseKimDomain(bad), /Invalid KIM domain/)
  assert.throws(() => kimDomain('constructor'), /Invalid KIM domain/)
})

test('expanded domain request range is the 90-160E, 6-50N KIM grid box', () => {
  const { sub, bounds } = kimDomainRequest(config, 'ea')
  const index = (lon, lat) => [Math.round(lon * 12) + 1, Math.round((lat + 90) * 12) + 1]
  assert.equal(sub, [...index(bounds.lonMin, bounds.latMin), ...index(bounds.lonMax, bounds.latMax)].join(','))
  assert.deepEqual([bounds.lonMin, bounds.latMin, bounds.lonMax, bounds.latMax], [90, 6, 160, 50])
  assert.equal(kimDomainRequest(config, 'kr').sub, config.kim_surface_wind.sub)
})

test('each domain accepts only its own forecast hours', () => {
  assert.equal(KIM_EXPANDED_FORECAST_HOURS.length, 33)
  assert.deepEqual(KIM_EXPANDED_FORECAST_HOURS.slice(23), [23, 24, 27, 30, 33, 36, 39, 42, 45, 48])
  for (const hf of [0, 24, 27, 48]) validateKimNwpSelection({ tmfc: TMFC, hf, levelId: '850hPa', domain: 'ea' })
  for (const hf of [25, 26, 49]) assert.throws(() => validateKimNwpSelection({ tmfc: TMFC, hf, levelId: '850hPa', domain: 'ea' }), /forecast hour/)
  assert.throws(() => validateKimNwpSelection({ tmfc: TMFC, hf: 27, levelId: '850hPa' }), /forecast hour/)
})

test('the same run time is stored separately per domain; Korea keeps its existing location', t => {
  const root = temporary(t)
  writeKimNwpGrid({ root, grid: grid({ nx: 2, value: 1 }) })
  writeKimNwpGrid({ root, grid: grid({ nx: 5, value: 9 }), domain: 'ea' })
  writeKimNwpLatest(root, { latestRun: TMFC, latestRunId: 'KIMG_NE57_2099010100', marker: 'kr' })
  writeKimNwpLatest(root, { latestRun: TMFC, latestRunId: 'KIMG_NE57_2099010100', marker: 'ea' }, 'ea')

  assert.equal(resolveKimNwpGridPath({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa' }),
    path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2099010100', 'normalized', 'hf000', '850hPa', 'grid.json'))
  assert.ok(resolveKimNwpGridPath({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa', domain: 'ea' }).startsWith(path.join(root, 'kim_nwp_ea', 'runs')))
  assert.equal(readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa' }).grid.nx, 2)
  assert.equal(readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa', domain: 'ea' }).grid.nx, 5)
  assert.equal(readKimNwpLatest(root).marker, 'kr')
  assert.equal(readKimNwpLatest(root, 'ea').marker, 'ea')
})

test('run retention counts each domain on its own', t => {
  const root = temporary(t)
  const complete = (tmfc, domain) => {
    writeKimNwpGrid({ root, grid: grid({ tmfc }), domain })
    writeKimNwpManifest(root, { model: 'KIMG/NE57', tmfc, usable: true, complete: true }, domain)
  }
  complete('2099010100', 'kr')
  complete('2099010106', 'kr')
  complete('2099010100', 'ea')
  cleanupKimNwpRuns({ root, maxRuns: 1, latestRunId: 'KIMG_NE57_2099010106' })
  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2099010106'])
  assert.deepEqual(listKimNwpRuns(root, 'ea'), ['KIMG_NE57_2099010100'])

  complete('2099010200', 'ea')
  cleanupKimNwpRuns({ root, maxRuns: 1, latestRunId: 'KIMG_NE57_2099010200', domain: 'ea' })
  assert.deepEqual(listKimNwpRuns(root, 'ea'), ['KIMG_NE57_2099010200'])
  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2099010106'])
})

test('expanded tropopause run computes a +30h hour with the bulk key and expanded range, leaving Korea untouched', async t => {
  const root = temporary(t)
  const GRID = { nx: 3, ny: 3, lonMin: 124, lonMax: 130, latMin: 33, latMax: 40, dx: 3, dy: 3.5 }
  const hf = 30
  const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
  for (const level of pressures) {
    writeKimNwpGrid({ root, domain: 'ea', grid: { type: 'kim_nwp_grid', model: 'KIMG/NE57', tmfc: TMFC, hf, validTime: addForecastHours(TMFC, hf), level, grid: GRID,
      variables: { u: { unit: 'm/s', values: Array(9).fill(20) }, v: { unit: 'm/s', values: Array(9).fill(0) }, T: { unit: 'K', values: Array(9).fill(250) }, hgt: { unit: 'm', values: Array(9).fill(5000 + level.value) } } } })
  }
  const saved = { key: config.api.kma_bulk_auth_key, bulk: { ...config.kim_bulk } }
  config.api.kma_bulk_auth_key = 'bulk-key'
  Object.assign(config.kim_bulk, { use: false, valid_until_kst: '2999-12-31', window_start_hour_kst: 0, window_end_hour_kst: 24 })
  t.after(() => { config.api.kma_bulk_auth_key = saved.key; Object.assign(config.kim_bulk, saved.bulk) })

  const requests = []
  const supplement = ({ name, level }) => `# fname: /ARCV/g576_v091_glob_prs.2byte.ft${String(hf).padStart(3, '0')}.${TMFC}.nc, fsize: 1byte, level: ${level}\n`
    + `# 변수명 = ${name}, unit = ${name === 'T' ? 'K' : name === 'hgt' ? 'm' : 'm/s'}, level =     ${level}, i =     3, j =     3, map = S (lon1 = 124.0, lat1 = 33.0, lon2 = 130.0, lat2 = 40.0, x_min = 1, y_min = 1, x_max = 3, y_max = 3)\n`
    + Array(3).fill(` ${name === 'T' ? '216.65' : name === 'hgt' ? '17000.0' : '12.5'}  ${name === 'T' ? '216.65' : name === 'hgt' ? '17000.0' : '12.5'}  ${name === 'T' ? '216.65' : name === 'hgt' ? '17000.0' : '12.5'}`).join('\n') + '\n'
  const result = await collectTropopause({ root, domain: 'ea', tmfc: TMFC, forecastHours: [hf],
    fetchGrid: async request => { requests.push(request); return supplement(request) },
    calculate: async () => ({ algorithm: TROPOPAUSE_ALGORITHM, trop: Array(9).fill(226.3), tropT: Array(9).fill(-56.5), tropAboveTop: Array(9).fill(0),
      vmax: Array(9).fill(38.9), pmax: Array(9).fill(250), jets: [], checks: { axes: 0 } }) })

  assert.equal(result.collection.outcome, 'complete')
  assert.equal(requests.length, 8)
  assert.ok(requests.every(r => r.credential === 'bulk-key' && r.sub === kimDomainRequest(config, 'ea').sub))
  assert.deepEqual(readKimTropopauseIndex(root, 'ea').times.map(time => time.hf), [hf])
  assert.equal(readKimTropopauseIndex(root), null)
  assert.equal(fs.existsSync(path.join(root, 'kim_nwp')), false)
})
