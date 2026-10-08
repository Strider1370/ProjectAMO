import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import config from '../src/config.js'
import { KIM_NWP_LEVELS, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid, readKimGktgField, readKimGktgLatest, readKimNwpGrid, readKimNwpGridVariables } from '../src/processors/kim-nwp-store.js'
import { process as collect, readGktgOutput } from '../src/processors/kim-gktg-processor.js'

const engineDir = fileURLToPath(new URL('../python/kim_turbulence/', import.meta.url))
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
const grid = { nx: 30, ny: 26, lonMin: 120, lonMax: 120 + 29 / 12, latMin: 30, latMax: 30 + 25 / 12 }
const size = grid.nx * grid.ny
const TMFC = '2099010100'

function seed(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-gktg-blocks-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [k, level] of pressures.entries()) {
    const variables = Object.fromEntries(Object.entries({ u: ['m/s', 20 + k], v: ['m/s', -k], T: ['K', 290 - 3 * k], hgt: ['m', 100 + k * 500], q: ['kg/kg', 0.0123] })
      .map(([name, [unit, value]]) => [name, { unit, values: Array.from({ length: size }, (_, i) => value + (name === 'u' ? i * 0.01 : 0)) }]))
    if (level.value > 250) variables.w = { unit: 'm/s', values: Array(size).fill(0.5) }
    writeKimNwpGrid({ root, grid: { model: 'KIMG/NE57', tmfc: TMFC, hf: 0, validTime: addForecastHours(TMFC, 0), level, grid, variables } })
  }
  return root
}

function supplementText({ hf, name, level }) {
  const value = name === 'ps' ? 100000 : name === 'hpbl' ? 1000 : name === 'w' ? -0.25 : 0
  const unit = name === 'ps' ? 'Pa' : name === 'w' ? 'm/s' : 'm'
  return `# fname: grid.ft${String(hf).padStart(3, '0')}.${TMFC}.nc, level: ${level}\n`
    + `# variable = ${name}, unit = ${unit}, level = ${level}, i = ${grid.nx}, j = ${grid.ny}, map = S (lon1 = 120.0, lat1 = 30.0, lon2 = ${grid.lonMax.toFixed(1)}, lat2 = ${grid.latMax.toFixed(1)})\n`
    + Array(grid.ny).fill(Array(grid.nx).fill(value).join(' ')).join('\n') + '\n'
}

for (const format of ['json', 'nc']) test(`GKTG hands Python float32 input files laid out field × level × y × x and publishes its float32 output (${format} store)`, async t => {
  const savedFormat = process.env.KIM_STORE_FORMAT
  process.env.KIM_STORE_FORMAT = format
  t.after(() => { if (savedFormat === undefined) delete process.env.KIM_STORE_FORMAT; else process.env.KIM_STORE_FORMAT = savedFormat })
  const root = seed(t)
  const saved = config.api.kim_nwp_auth_key
  config.api.kim_nwp_auth_key = 'kim-key'
  t.after(() => { config.api.kim_nwp_auth_key = saved })
  let job = null
  const result = await collect({ root, tmfc: TMFC, forecastHours: [0], fetchGrid: async request => supplementText(request),
    calculate: async (input, stage) => {
      job = input
      const nz = input.pressures.length
      const cube = new Float32Array(fs.readFileSync(path.join(stage, 'cube.f32')).buffer.slice(0))
      const surface = new Float32Array(fs.readFileSync(path.join(stage, 'surface.f32')).buffer.slice(0))
      const at = (field, k, i) => cube[(field * nz + k) * size + i]
      assert.equal(cube.length, 6 * nz * size)
      assert.equal(at(0, 3, 7), Math.fround(23 + 0.07)) // u, 4th level, 8th point
      assert.equal(at(1, 5, 0), -5) // v
      assert.equal(at(2, 0, 0), 0.5) // w from the base grid (1000 hPa)
      assert.equal(at(2, nz - 1, 0), -0.25) // w supplement (150 hPa)
      assert.equal(at(3, 2, 0), 284) // T
      assert.equal(at(4, 0, 0), Math.fround(0.0123)) // q
      assert.equal(at(5, nz - 1, 0), 100 + (nz - 1) * 500) // hgt
      assert.deepEqual([surface[0], surface[size], surface[2 * size]], [100000, 0, 1000]) // ps, topo, hpbl
      // Python 출력과 같은 모양: 기압면별, 결측 null.
      return input.pressures.map((_, k) => Array.from({ length: size }, (_, i) => (i < grid.nx ? null : Math.fround(0.01 * (k + 1)))))
    } })
  assert.equal(result.collection.outcome, 'complete')
  assert.deepEqual(job.pressures, pressures.map(p => p.value * 100))
  assert.deepEqual(job.grid, grid)
  const latest = readKimGktgLatest(root)
  const field = readKimGktgField({ root, tmfc: TMFC, hf: 0, levelId: '500hPa', revision: latest.entries.find(e => e.levelId === '500hPa').revision })
  assert.equal(field.gktg[0], null)
  assert.equal(field.gktg[grid.nx], Math.fround(0.01 * (pressures.findIndex(p => p.id === '500hPa') + 1)))
  assert.equal(field.geopotentialHeight[0], 100 + pressures.findIndex(p => p.id === '500hPa') * 500)
  assert.ok(Array.isArray(field.geopotentialHeight))
})

test('NC partial read opens only the requested arrays', t => {
  const savedFormat = process.env.KIM_STORE_FORMAT
  process.env.KIM_STORE_FORMAT = 'nc'
  t.after(() => { if (savedFormat === undefined) delete process.env.KIM_STORE_FORMAT; else process.env.KIM_STORE_FORMAT = savedFormat })
  const root = seed(t)
  const layer = readKimNwpGridVariables({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa', names: ['T', 'w'] })
  assert.ok(ArrayBuffer.isView(layer.variables.T.values))
  assert.equal(layer.variables.T.values.length, size)
  assert.equal(layer.variables.u.values, null)
  assert.equal(layer.variables.T.unit, 'K')
  const full = readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc: TMFC, hf: 0, levelId: '850hPa' })
  assert.deepEqual(Array.from(layer.variables.T.values), full.variables.T.values)
})

test('Python GKTG output file maps NaN to null and keeps float32 values', t => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-gktg-out-'))
  t.after(() => fs.rmSync(stage, { recursive: true, force: true }))
  const job = { grid: { nx: 2, ny: 1 }, pressures: [100000, 85000] }
  fs.writeFileSync(path.join(stage, 'gktg.f32'), Buffer.from(new Float32Array([NaN, 0.1, 0.2, NaN]).buffer))
  assert.deepEqual(readGktgOutput(stage, job), [[null, Math.fround(0.1)], [Math.fround(0.2), null]])
  fs.writeFileSync(path.join(stage, 'gktg.f32'), Buffer.from(new Float32Array(3).buffer))
  assert.throws(() => readGktgOutput(stage, job), /size/)
})

test('block plan covers the domain once with 192-cell windows; Korea (smaller in area) stays one piece', { skip: !fs.existsSync(config.kim_gktg.python) && 'GKTG Python environment unavailable' }, () => {
  const code = `
import json
from calculate import plan_blocks, WINDOW
out = {}
for name, (ny, nx) in {"kr": (169, 205), "ea": (529, 841), "proto": (529, 541)}.items():
    blocks = plan_blocks(ny, nx)
    cover = [[0] * nx for _ in range(ny)]
    for (cy0, cy1, cx0, cx1), (y0, y1, x0, x1) in blocks:
        assert y0 <= cy0 < cy1 <= y1 and x0 <= cx0 < cx1 <= x1 and (len(blocks) == 1 or (y1 - y0 <= WINDOW and x1 - x0 <= WINDOW))
        assert (cy0 - y0 >= 24 or y0 == 0) and (y1 - cy1 >= 24 or y1 == ny) and (cx0 - x0 >= 24 or x0 == 0) and (x1 - cx1 >= 24 or x1 == nx)
        for y in range(cy0, cy1):
            for x in range(cx0, cx1):
                cover[y][x] += 1
    assert all(c == 1 for row in cover for c in row)
    out[name] = len(blocks)
print(json.dumps(out))`
  const run = spawnSync(config.kim_gktg.python, ['-c', code], { cwd: engineDir, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), { kr: 1, ea: 24, proto: 16 })
})
