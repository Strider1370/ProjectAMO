import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import config from '../backend/src/config.js'
import { fetchKimGrid } from '../backend/src/api-client.js'
import { parseKimGridText } from '../backend/src/parsers/kim-grid-parser.js'
import { readKimNwpGrid } from '../backend/src/processors/kim-nwp-store.js'
import { KIM_NWP_LEVELS } from '../backend/src/processors/kim-nwp-model.js'
import { publishExperiment } from '../backend/src/turbulence/experiment-store.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values: args } = parseArgs({ options: {
  tmfc: { type: 'string', default: '2026091006' },
  hours: { type: 'string', default: '6,9' },
  'source-root': { type: 'string', default: path.join(repo, 'backend/data') },
  'output-root': { type: 'string', default: config.storage.base_path },
  python: { type: 'string', default: process.env.KIM_TURBULENCE_PYTHON || path.join(repo, '.artifacts/turbulence-venv/bin/python') },
} })
if (!/^\d{10}$/.test(args.tmfc)) throw new Error('Invalid UTC run time')
const hours = [...new Set(args.hours.split(',').map(Number))]
if (!hours.length || hours.some((h) => !Number.isInteger(h) || h < 0 || h > 16)) throw new Error('Invalid forecast hours')
hours.sort((a, b) => a - b)
// Explicit radar/satellite credential: never silently fall back to aviation/NWP key.
const credential = process.env.KMA_RADAR_SATELLITE_AUTH_KEY
if (!credential || process.env.KMA_RADAR_SATELLITE_ENABLED === '0') throw new Error('Radar/satellite credential is unavailable')
const cache = path.join(repo, 'artifacts/kim-turbulence-demo/inputs', args.tmfc)
fs.mkdirSync(cache, { recursive: true })
async function runCalculator(parameters) {
  await new Promise((resolve, reject) => {
    const child = spawn(args.python, [path.join(repo, 'scripts/turbulence/calculate_python.py'), ...parameters], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Python TURB calculator exited ${code}`)))
  })
}
const pressures = KIM_NWP_LEVELS.filter((l) => l.kind === 'pressure')
const sameGrid = (a, b) => ['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every((key) => a[key] === b[key])
const unitAliases = { u: ['m/s'], v: ['m/s'], w: ['m/s'], T: ['K'], hgt: ['m', 'gpm'], q: ['kg/kg', 'kg kg-1', '1'] }

function decode(variable, name, size) {
  const unit = variable?.unit?.replace(/,$/, '')
  if (!unitAliases[name].includes(unit) || variable.encoding !== 'int16-scaled-json-v1'
    || variable.values.length !== size || !Number.isFinite(variable.scale) || variable.scale <= 0) {
    throw new Error(`Invalid cached KIM variable: ${name} (${unit})`)
  }
  return variable.values.map((v) => Number.isFinite(v) && v > -32767 && v < 32767
    ? v * variable.scale + (variable.offset || 0) : null)
}

async function supplemental(name, level, hf, grid) {
  const file = path.join(cache, `hf${hf}-${name}-${level}.txt`)
  let text
  if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8')
  else {
    console.log(`KIM radar/satellite key: ${args.tmfc} +${hf} ${name} ${level}`)
    text = await fetchKimGrid({ data: level ? 'P' : 'U', name, level, tmfc: args.tmfc, hf,
      sub: '1429,1441,1633,1609', credential })
  }
  // A response must identify the exact file/run/hour/level and requested bounds.
  const stamp = `.ft${String(hf).padStart(3, '0')}.${args.tmfc}.nc`
  if (!text.includes(stamp) || !new RegExp(`level\\s*[:=]\\s*${level}(?:\\s|,)`).test(text)) {
    throw new Error(`Mismatched supplemental KIM time/level: ${name}`)
  }
  const parsed = parseKimGridText(text, { variable: name, level })
  const unit = parsed.unit.replace(/,$/, '')
  if (parsed.nx !== grid.nx || parsed.ny !== grid.ny
    || !text.includes('lon1 = 119.0, lat1 = 30.0, lon2 = 136.0, lat2 = 44.0')
    || unit !== (name === 'ps' ? 'Pa' : name === 'w' ? 'm/s' : 'm')) {
    throw new Error(`Mismatched supplemental KIM grid/unit: ${name} (${unit})`)
  }
  const values = parsed.values.map((v) => Number.isFinite(v) && v > -9000 ? v : null)
  if (values.filter((v) => v !== null).length < values.length * .9) throw new Error(`Incomplete supplemental KIM: ${name}`)
  if (name === 'ps' && values.some((v) => v !== null && (v < 20000 || v > 110000))) throw new Error('Invalid surface pressure')
  if (name === 'topo' && values.some((v) => v !== null && (v < -500 || v > 9000))) throw new Error('Invalid terrain height')
  if (name === 'hpbl' && values.some((v) => v !== null && (v < 0 || v > 10000))) throw new Error('Invalid boundary layer height')
  if (name === 'w' && values.some((v) => v !== null && Math.abs(v) > 100)) throw new Error('Invalid vertical velocity')
  if (!fs.existsSync(file)) fs.writeFileSync(file, text)
  return values
}

const frames = []
for (const hf of hours) {
  const layers = pressures.map((level) => readKimNwpGrid({ root: args['source-root'], model: 'KIMG/NE57', tmfc: args.tmfc, hf, levelId: level.id }))
  const grid = layers[0].grid
  if (!sameGrid(grid, { nx: 205, ny: 169, lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 })) {
    throw new Error('This experiment collector supports the configured Korea regional grid only')
  }
  const issue = Date.UTC(+args.tmfc.slice(0, 4), +args.tmfc.slice(4, 6) - 1, +args.tmfc.slice(6, 8), +args.tmfc.slice(8, 10))
  const validTime = new Date(issue + hf * 3600000).toISOString()
  for (let k = 0; k < layers.length; k++) {
    const layer = layers[k]
    if (layer.tmfc !== args.tmfc || layer.hf !== hf || layer.level.id !== pressures[k].id
      || layer.validTime !== validTime || !sameGrid(layer.grid, grid)) throw new Error('Mixed cached KIM grids/time')
  }
  const fields = {}
  for (const name of ['u', 'v', 'T', 'hgt', 'q']) {
    fields[name] = layers.map((l) => decode(l.variables[name], name, grid.nx * grid.ny))
  }
  fields.w = []
  for (let k = 0; k < layers.length; k++) {
    fields.w.push(layers[k].variables.w ? decode(layers[k].variables.w, 'w', grid.nx * grid.ny)
      : await supplemental('w', pressures[k].value, hf, grid))
  }
  const surface = {}
  for (const name of ['ps', 'topo', 'hpbl']) surface[name] = await supplemental(name, 0, hf, grid)
  frames.push({ grid, hf, validTime, pressures: pressures.map((p) => p.value * 100), fields, surface })
}
const provenance = { model: 'KIMG/NE57', cachedVariables: ['u', 'v', 'T', 'hgt', 'q', 'w (1000–300 hPa)'],
  supplementalVariables: ['ps', 'topo', 'hpbl', 'w (250/200/150 hPa)'], credential: 'radar/satellite',
  gridOrder: 'south-to-north, west-to-east', inputHumidity: 'native specific humidity kg/kg', collectedAt: new Date().toISOString() }
// Pin the path invoked by the supplied operational shell and its main includes.
// Alternate/backup sources must never silently replace these implementations.
const mainSource = 'reference/TURB/_SRC/g_ktg_score_8km_KIM_global_mpi_remap_main.f'
const shellSource = 'reference/TURB/SHEL/amo_gdps_diag_gktg_body2_12hr.ksh'
const activeText = fs.readFileSync(path.join(repo, mainSource), 'utf8')
  .split(/\r?\n/).filter((line) => !/^[cC*!]/.test(line)).join('\n')
for (const include of ['indices_gtg40ARismwtNoRi.f', 'interproutines38.f', 'itfacomp41.f', 'remaproutines31x5.f']) {
  if (!activeText.includes(`include '${include}'`)) throw new Error(`Active TURB main no longer includes ${include}`)
}
if (!fs.readFileSync(path.join(repo, shellSource), 'utf8').includes('${HDIR}/EXEC/g_ktg_score_8km_KIM_global_mpi_remap_main \\')) {
  throw new Error('TURB operational executable path changed')
}
const sourceFiles = [mainSource, shellSource,
  ...['indices_gtg40ARismwtNoRi.f', 'interproutines38.f', 'itfacomp41.f', 'remaproutines31x5.f',
    'filtroutines32.f', 'sfnroutines40-nofit.f', 'consts.inc'].map((name) => `reference/TURB/_SRC/${name}`),
  'reference/TURB/DABA/static_thresholds_KMAUM_ln2600RismwtNoRi-3.dat',
  'reference/TURB/SHEL/make_namelist_12hr.ksh',
  'reference/TURB/EXEC/g_ktg_score_8km_KIM_global_mpi_remap_main']
provenance.turbSource = { main: mainSource, combination: 'reference/TURB/_SRC/itfacomp41.f',
  files: sourceFiles.map((file) => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex') })),
  // Full operational executable / 91-layer .Q parity remains unverified.
  // Regional original-routine execution is recorded separately below.
  numericalParityVerified: false }
provenance.pythonEngine = { algorithm: 'kim-gktg-python-v5', mode: '24 selected indices -> CAT/MWT/GKTG',
  implementation: 'Python/NumPy/Numba', fortranRuntime: false, fastmath: false }
const hash = crypto.createHash('sha256')
for (const name of ['calculate_python.py', 'python_port.py', 'python_core.py', 'python_dynamics.py', 'python_theta.py',
  'python_structure.py', 'python_combine.py', 'input_validation.py', 'export_products.py', 'products.py', 'calibration.json', 'requirements.txt']) {
  hash.update(fs.readFileSync(path.join(repo, 'scripts/turbulence', name)))
}
hash.update(JSON.stringify(provenance.turbSource))
hash.update(JSON.stringify(provenance.pythonEngine))
const revision = hash.update(JSON.stringify(frames)).digest('hex').slice(0, 20)
const input = path.join(cache, `cube-${revision}.json`)
fs.writeFileSync(input, JSON.stringify({ tmfc: args.tmfc, revision, frames, provenance }))
// Stage on the target filesystem; publish pointer only after all fields validate.
const stages = path.join(args['output-root'], 'kim_turbulence_experiment/.staging')
fs.mkdirSync(stages, { recursive: true })
const stage = fs.mkdtempSync(path.join(stages, 'run-'))
try {
  await runCalculator([input, stage])
  const index = publishExperiment(args['output-root'], stage)
  console.log(JSON.stringify({ revision, tmfc: index.tmfc, times: index.times, fields: index.times.length * index.levels.length * index.diagnostics.length, output: args['output-root'] }))
} catch (error) {
  fs.rmSync(stage, { recursive: true, force: true })
  throw error
}
