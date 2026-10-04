import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../src/config.js'
import { KIM_NWP_LEVELS, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid, readKimGktgLatest } from '../src/processors/kim-nwp-store.js'
import { process as collect } from '../src/processors/kim-gktg-processor.js'
import { seedGktg } from './gktg-fixture.js'

const grid = { nx: 205, ny: 169, lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 }
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
const size = grid.nx * grid.ny

function setup(t, tmfc, keys, hf = 12) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-gktg-key-'))
  const saved = Object.fromEntries(Object.keys(keys).map(key => [key, config.api[key]]))
  Object.assign(config.api, keys)
  t.after(() => {
    Object.assign(config.api, saved)
    fs.rmSync(root, { recursive: true, force: true })
  })
  for (const [k, level] of pressures.entries()) {
    const variables = Object.fromEntries(Object.entries({ u: ['m/s', 20], v: ['m/s', 0], T: ['K', 270], hgt: ['m', k * 500], q: ['kg/kg', .005] })
      .map(([name, [unit, value]]) => [name, { unit, values: Array(size).fill(value) }]))
    if (level.value > 250) variables.w = { unit: 'm/s', values: Array(size).fill(0) }
    writeKimNwpGrid({ root, grid: { model: 'KIMG/NE57', tmfc, hf, validTime: addForecastHours(tmfc, hf), level, grid, variables } })
  }
  return root
}

function supplementText({ tmfc, hf, name, level }) {
  const value = name === 'ps' ? 100000 : name === 'hpbl' ? 1000 : 0
  const unit = name === 'ps' ? 'Pa' : name === 'w' ? 'm/s' : 'm'
  return `# fname: grid.ft${String(hf).padStart(3, '0')}.${tmfc}.nc, level: ${level}\n`
    + `# variable = ${name}, unit = ${unit}, level = ${level}, i = 205, j = 169, map = S (lon1 = 119.0, lat1 = 30.0, lon2 = 136.0, lat2 = 44.0)\n`
    + Array(grid.ny).fill(Array(grid.nx).fill(value).join(' ')).join('\n') + '\n'
}

for (const [hour, expectedKey] of [['00', 'kim-key'], ['06', 'kim-key'], ['12', 'radar-key'], ['18', 'aviation-key']]) {
  test(`GKTG ${hour}Z supplements use the base run key despite a +12 hour forecast, and reuse cached inputs`, async t => {
    const tmfc = `20990101${hour}`
    const root = setup(t, tmfc, { kim_nwp_auth_key: 'kim-key', auth_key: 'aviation-key', radar_satellite_auth_key: hour === '12' ? 'radar-key' : '' })
    const requests = []
    let calculations = 0
    const run = () => collect({ root, tmfc, forecastHours: [12],
      fetchGrid: async request => { requests.push(request); return supplementText(request) },
      calculate: async () => { calculations++; throw new Error('fixture_calculation_stop') } })
    const result = await run()
    assert.equal(calculations, 1)
    assert.deepEqual(result.failures, [{ hf: 12, reason: 'fixture_calculation_stop' }])
    assert.deepEqual(requests.map(r => `${r.name}@${r.level}`), ['w@250', 'w@200', 'w@150', 'ps@0', 'topo@0', 'hpbl@0'])
    assert.ok(requests.every(r => r.credential === expectedKey && r.tmfc === tmfc))
    assert.ok(requests.every(r => r.hf === (r.name === 'topo' ? 0 : 12)))
    await run()
    assert.equal(calculations, 2)
    assert.equal(requests.length, 6)
  })
}

test('GKTG missing run keys and budget blocks preserve the last complete run without switching keys', async t => {
  const tmfc = '2099010100'
  const root = setup(t, tmfc, { kim_nwp_auth_key: '', auth_key: 'aviation-key', radar_satellite_auth_key: 'radar-key' })
  const previous = seedGktg(root, { tmfc: '2098123112' })
  let calls = 0
  const missing = await collect({ root, tmfc, forecastHours: [12], fetchGrid: async () => { calls++; assert.fail('must not fetch') } })
  assert.deepEqual(missing.failures, [{ hf: 12, reason: 'gktg_run_credential_unavailable' }])
  assert.equal(calls, 0)
  config.api.kim_nwp_auth_key = 'kim-key'
  const blocked = await collect({ root, tmfc, forecastHours: [12], fetchGrid: async request => {
    calls++
    assert.equal(request.credential, 'kim-key')
    throw Object.assign(new Error('blocked'), { code: 'api_hub_budget_blocked' })
  } })
  assert.deepEqual(blocked.failures, [{ hf: 12, reason: 'api_hub_budget_blocked' }])
  assert.equal(calls, 1)
  assert.equal(readKimGktgLatest(root).revision, previous.revision)
})
