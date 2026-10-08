import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setImmediate as nextTurn } from 'node:timers/promises'
import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import { collectionResult } from '../collector-execution.js'
import { kimBulkCredentialOptions, selectKimRunCredential } from './kim-run-credential.js'
import { KIM_NWP_MODEL, KIM_NWP_LEVELS, addForecastHours, decodeComponent, buildKimGktgFieldFromGrid } from './kim-nwp-model.js'
import { kimRawTextExists, readKimRawText, writeKimRawText } from './kim-doc-store.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { KIM_DEFAULT_DOMAIN, kimDomain, kimDomainRequest } from './kim-domain.js'
import { cleanupKimNwpRuns, readKimNwpLatest, readKimNwpGrid, readKimGktgField, readKimGktgLatest, resolveKimNwpRunDir, resolveKimGktgFieldPath, writeKimGktgField, writeKimGktgAttempt, publishKimGktgRun, fingerprintKimNwpBase, fingerprintKimGktgOutputs } from './kim-nwp-store.js'

const engineDir = fileURLToPath(new URL('../../python/kim_turbulence/', import.meta.url))
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
export const GKTG_ALGORITHM = 'kim-gktg-python-v5'
const sha = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)
const engineRevision = () => sha(['python_core.py', 'python_port.py', 'python_dynamics.py', 'python_theta.py', 'python_structure.py', 'python_combine.py', 'calibration.json', 'calculate.py', 'input_validation.py', 'products.py', 'requirements.txt'].map(name => fs.readFileSync(path.join(engineDir, name))).reduce((result, value) => Buffer.concat([result, value]), Buffer.from('kim-gktg-field-v1\n')))
const sameGrid = (a, b) => ['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every(key => a[key] === b[key])
const baseRevision = layers => sha(JSON.stringify(layers.map(l => [l.tmfc, l.hf, l.validTime, l.level, l.grid, l.variables])))

export function decodeGktgInput(variable, name, size) {
  const units = { u: ['m/s'], v: ['m/s'], w: ['m/s'], T: ['K'], hgt: ['m', 'gpm'], q: ['kg/kg', 'kg kg-1', '1'] }
  if (!variable || !units[name]?.includes(variable.unit?.replace(/,$/, '')) || variable.values?.length !== size) throw new Error(`Invalid GKTG input ${name}`)
  if (variable.encoding === 'int16-scaled-json-v1' && (!Number.isFinite(variable.scale) || variable.scale <= 0 || variable.values.some(v => Math.abs(v) === 32767))) throw new Error(`Invalid/saturated GKTG input ${name}`)
  const values = decodeComponent(variable.values, variable)
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error(`Incomplete GKTG input ${name}`)
  return values
}

// 응답 머리말의 영역 표기. 한 자리 위도는 자리를 맞추느라 공백이 두 칸이다("lat1 =  6.0", 2026-10-08 확대 영역).
export function supplementBoundsMatch(text, grid) {
  const number = value => value.toFixed(1).replace('.', '\\.').replace('-', '\\-')
  return new RegExp(`lon1\\s*=\\s*${number(grid.lonMin)},\\s*lat1\\s*=\\s*${number(grid.latMin)},\\s*lon2\\s*=\\s*${number(grid.lonMax)},\\s*lat2\\s*=\\s*${number(grid.latMax)}(?:\\D|$)`).test(text)
}

export function validateGktgSupplement(text, { name, level, tmfc, hf, grid }) {
  const stamp = `.ft${String(hf).padStart(3, '0')}.${tmfc}.nc`
  if (!text.includes(stamp) || !new RegExp(`=\\s*${name},\\s*unit`).test(text) || !new RegExp(`level\\s*[:=]\\s*${level}(?:\\s|,)`).test(text)
    || !supplementBoundsMatch(text, grid)) throw new Error(`GKTG supplemental identity mismatch: ${name}`)
  const parsed = parseKimGridText(text, { variable: name, level })
  const unit = parsed.unit?.replace(/,$/, '')
  if (parsed.nx !== grid.nx || parsed.ny !== grid.ny || unit !== (name === 'ps' ? 'Pa' : name === 'w' ? 'm/s' : 'm')) throw new Error(`GKTG supplemental grid/unit mismatch: ${name}`)
  const ranges = { ps: [20000, 110000], topo: [-500, 9000], hpbl: [0, 10000], w: [-100, 100] }
  const [lo, hi] = ranges[name]
  if (parsed.values.length !== grid.nx * grid.ny || !parsed.values.every(v => Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`GKTG supplemental range/missing: ${name}`)
  return parsed.values
}

async function supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid, domain }) {
  // Terrain is static within a run and shared by all thirteen hours.
  const directory = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'raw', 'gktg')
  const sharedTerrain = name === 'topo' ? path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'raw', 'hf000', '10m', 'topo.txt') : null
  if (sharedTerrain && kimRawTextExists(sharedTerrain)) return validateGktgSupplement(readKimRawText(sharedTerrain), { name, level, tmfc, hf: 0, grid })
  const cachedTerrain = name === 'topo' && fs.existsSync(directory) ? fs.readdirSync(directory).find(file => /^hf\d+-topo-0\.txt(?:\.gz)?$/.test(file)) : null
  const requestedHf = cachedTerrain ? Number(cachedTerrain.match(/^hf(\d+)/)[1]) : name === 'topo' ? 0 : hf
  const file = path.join(directory, `hf${requestedHf}-${name}-${level}.txt`)
  const cached = readKimRawText(file)
  let text = cached
  if (cached === null) {
    const credential = selectKimRunCredential({
      tmfc,
      kimCredential: config.api.kim_nwp_auth_key,
      aviationCredential: config.api.auth_key,
      radarCredential: config.api.radar_satellite_auth_key,
      ...kimBulkCredentialOptions(config, Date.now(), { required: kimDomain(domain).bulkOnly }),
    })
    if (!credential) throw new Error('gktg_run_credential_unavailable')
    text = await fetchGrid({ data: level ? 'P' : 'U', name, level, tmfc, hf: requestedHf, sub: kimDomainRequest(config, domain).sub, credential, signal })
  }
  const values = validateGktgSupplement(text, { name, level, tmfc, hf: requestedHf, grid })
  if (cached === null) writeKimRawText(file, text)
  return values
}

async function calculatePython(cube, stage, { signal, python }) {
  const input = path.join(stage, 'input.json')
  fs.writeFileSync(input, JSON.stringify(cube))
  const timeoutSignal = AbortSignal.timeout(config.kim_gktg.calculation_timeout_ms)
  const calculationSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  await new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(engineDir, 'calculate.py'), input, stage], { signal: calculationSignal, env: { ...process.env, NUMBA_CACHE_DIR: config.kim_gktg.cache_path }, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000) })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`gktg_python_failed (${code}): ${error}`)))
  })
}

export async function process({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc = readKimNwpLatest(root, domain)?.latestRun || readKimNwpLatest(root, domain)?.tmfc,
  forecastHours = config.kim_nwp.forecast_hours, signal, fetchGrid = fetchKimGrid, calculate = calculatePython,
  python = config.kim_gktg.python } = {}) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) return { type: 'kim_gktg', collection: collectionResult('partial', { waiting: true }, { reason: 'kim_gktg_base_waiting' }) }
  if (!Array.isArray(forecastHours) || !forecastHours.length || forecastHours.some(h => !kimDomain(domain).forecastHours.includes(h))) throw new Error('Invalid GKTG forecast hours')
  const entries = []
  const failures = []
  const baseRevisions = new Map()
  const engine = engineRevision()
  // 입력 격자·계산 코드·게시 결과가 지난 게시와 같으면 다시 읽지 않고 끝낸다. 모두 다시 읽어 확인하면
  // 백엔드가 100초 넘게 다른 요청을 받지 못했다(2026-10-04).
  const baseFingerprint = fingerprintKimNwpBase({ root, tmfc, hours: forecastHours, domain })
  const previous = readKimGktgLatest(root, domain)
  if (baseFingerprint && previous?.complete && previous.tmfc === tmfc && previous.algorithm === GKTG_ALGORITHM && previous.engineRevision === engine
    && previous.baseFingerprint === baseFingerprint && String(previous.expectedHours) === String(forecastHours)
    && previous.outputFingerprint && previous.outputFingerprint === fingerprintKimGktgOutputs(root, previous, domain)) {
    return { type: 'kim_gktg', tmfc, fields: previous.entries.length, revision: previous.revision, failures: [], saved: false, unchanged: true,
      collection: collectionResult('complete', { fields: previous.entries.length, expectedFields: forecastHours.length * pressures.length }) }
  }
  writeKimGktgAttempt(root, tmfc, { tmfc, started_at: new Date().toISOString(), outcome: 'running', expectedHours: forecastHours }, domain)
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain })
  for (const hf of forecastHours) {
    const hourStarted = Date.now()
    // 시각마다 한 번 이벤트 루프에 양보해 계산 중에도 API 요청을 처리한다.
    await nextTurn()
    if (signal?.aborted) {
      writeKimGktgAttempt(root, tmfc, { tmfc, outcome: 'cancelled', expectedHours: forecastHours, fields: entries.length, completed_at: new Date().toISOString() }, domain)
      signal.throwIfAborted()
    }
    let stage
    try {
      const layers = pressures.map(level => readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain }))
      const grid = layers[0].grid
      for (let k = 0; k < layers.length; k++) {
        if (layers[k].tmfc !== tmfc || Number(layers[k].hf) !== hf || layers[k].level.id !== pressures[k].id || layers[k].validTime !== addForecastHours(tmfc, hf) || !sameGrid(layers[k].grid, grid)) throw new Error('Mixed GKTG base grids')
      }
      baseRevisions.set(hf, baseRevision(layers))
      const fields = Object.fromEntries(['u', 'v', 'T', 'hgt', 'q'].map(name => [name, layers.map(l => decodeGktgInput(l.variables[name], name, grid.nx * grid.ny))]))
      fields.w = []
      for (let k = 0; k < layers.length; k++) fields.w.push(layers[k].variables.w
        ? decodeGktgInput(layers[k].variables.w, 'w', grid.nx * grid.ny)
        : await supplement({ root, tmfc, hf, name: 'w', level: pressures[k].value, grid, signal, fetchGrid, domain }))
      const surface = {}
      for (const name of ['ps', 'topo', 'hpbl']) surface[name] = await supplement({ root, tmfc, hf, name, level: 0, grid, signal, fetchGrid, domain })
      const cube = { grid, hf, validTime: addForecastHours(tmfc, hf), pressures: pressures.map(p => p.value * 100), fields, surface }
      const inputRevision = sha(JSON.stringify(cube))
      const revision = sha(`${engine}:${inputRevision}`)
      const exists = pressures.every(level => {
        try { readKimGktgField({ root, tmfc, hf, levelId: level.id, revision, domain }); return true }
        catch { return false }
      })
      if (!exists) {
        const stages = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'gktg', '.staging')
        fs.mkdirSync(stages, { recursive: true })
        stage = fs.mkdtempSync(path.join(stages, 'hour-'))
        await calculate(cube, stage, { python, signal })
        for (let k = 0; k < pressures.length; k++) {
          const gktg = JSON.parse(fs.readFileSync(path.join(stage, `${pressures[k].id}.json`), 'utf8'))
          if (gktg.length !== grid.nx * grid.ny || !gktg.some(Number.isFinite) || gktg.some(v => v !== null && (!Number.isFinite(v) || v < 0 || v > 1.5))) throw new Error('Invalid GKTG output field')
          writeKimGktgField(root, buildKimGktgFieldFromGrid(layers[k], { gktg, revision, inputRevision, algorithm: GKTG_ALGORITHM, engineRevision: engine }), domain)
        }
      }
      for (const level of pressures) entries.push({ levelId: level.id, hf, validTime: cube.validTime, variables: ['gktg'], hashes: { gktg: revision }, revision, inputRevision, grid,
        path: path.relative(root, resolveKimGktgFieldPath({ root, tmfc, hf, levelId: level.id, revision, domain })) })
      appendKimRunEvent(runDir, { type: 'gktg_hour', hf, computed: !exists, ms: Date.now() - hourStarted, revision })
    } catch (error) {
      if (signal?.aborted) {
        writeKimGktgAttempt(root, tmfc, { tmfc, outcome: 'cancelled', expectedHours: forecastHours, fields: entries.length, completed_at: new Date().toISOString() }, domain)
        signal.throwIfAborted()
      }
      failures.push({ hf, reason: error.code || error.message })
      appendKimRunEvent(runDir, { type: 'gktg_hour_failed', hf, ms: Date.now() - hourStarted, reason: String(error.code || error.message).slice(0, 300) })
    } finally { if (stage) fs.rmSync(stage, { recursive: true, force: true }) }
  }
  // A base collector may update inputs while Python runs. Keep the previous
  // complete publication until every captured hour still matches its inputs.
  for (const [hf, captured] of baseRevisions) {
    if (failures.some(failure => failure.hf === hf)) continue
    await nextTurn()
    try {
      const current = pressures.map(level => readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain }))
      if (baseRevision(current) !== captured) throw new Error('kim_gktg_base_changed')
    } catch (error) {
      failures.push({ hf, reason: error.code || error.message })
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].hf === hf) entries.splice(i, 1)
    }
  }
  const complete = failures.length === 0
  let published = null
  if (complete) {
    published = publishKimGktgRun(root, { tmfc, model: KIM_NWP_MODEL, algorithm: GKTG_ALGORITHM, engineRevision: engine, revision: sha(JSON.stringify(entries)), expectedHours: forecastHours, entries, baseFingerprint, fetched_at: new Date().toISOString() }, domain)
    // 이전 회차를 붙잡고 있던 파생 게시가 넘어왔으니 여기서도 정리한다(기본 게시 때는 아직 이전 회차를 가리킨다).
    cleanupKimNwpRuns({ root, domain, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId: readKimNwpLatest(root, domain)?.latestRunId, onlyComplete: true, reason: 'gktg_published' })
  }
  appendKimRunEvent(runDir, { type: complete ? 'gktg_published' : 'gktg_partial', revision: published?.revision || null, fields: entries.length, failures: failures.length })
  writeKimGktgAttempt(root, tmfc, { tmfc, outcome: complete ? 'complete' : 'partial', expectedHours: forecastHours, fields: entries.length, failures, completed_at: new Date().toISOString() }, domain)
  return { type: 'kim_gktg', tmfc, fields: entries.length, revision: published?.revision, failures, saved: complete,
    collection: collectionResult(complete ? 'complete' : 'partial', { fields: entries.length, expectedFields: forecastHours.length * pressures.length }, complete ? {} : { reason: 'kim_gktg_incomplete' }) }
}

export default { process }
