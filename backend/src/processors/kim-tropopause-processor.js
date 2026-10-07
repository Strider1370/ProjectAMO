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
import { selectKimRunCredential } from './kim-run-credential.js'
import { KIM_NWP_MODEL, KIM_NWP_LEVELS, addForecastHours } from './kim-nwp-model.js'
import { decodeGktgInput } from './kim-gktg-processor.js'
import { cleanupKimNwpRuns, readKimNwpLatest, readKimNwpGrid, readKimTropopauseField, readKimTropopauseUpper, readKimTropopauseLatest, resolveKimNwpRunDir, writeKimTropopauseField, writeKimTropopauseUpper, writeKimTropopauseAttempt, publishKimTropopauseRun, fingerprintKimNwpBase, fingerprintKimTropopauseOutputs } from './kim-nwp-store.js'
import { readKimRawText, writeKimRawText } from './kim-doc-store.js'
import { appendKimRunEvent } from './kim-run-events.js'

// 권계면 판정에는 150 hPa 위의 기온·고도가 필요하다. 기본 KIM 수집은 150 hPa까지이므로
// 100·70 hPa의 T·hgt를 이 processor가 추가로 받는다. 같은 두 층의 u·v는 연직단면의 상층 등풍속선용이며
// 권계면 계산과 제트 탐색(500–150 hPa)에는 쓰지 않는다.
export const TROPOPAUSE_SUPPLEMENT_LEVELS = [100, 70]
export const TROPOPAUSE_SUPPLEMENT_NAMES = ['T', 'hgt', 'u', 'v']
export const TROPOPAUSE_ALGORITHM = 'kim-tropopause-jet-v1'

const engineDir = fileURLToPath(new URL('../../python/kim_tropopause/', import.meta.url))
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
const sha = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)
const engineRevision = () => sha(['calculate.py', 'thermal.py', 'jet.py'].map(name => fs.readFileSync(path.join(engineDir, name)))
  .reduce((result, value) => Buffer.concat([result, value]), Buffer.from('kim-tropopause-field-v1\n')))
const sameGrid = (a, b) => ['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every(key => a[key] === b[key])
const baseRevision = layers => sha(JSON.stringify(layers.map(l => [l.tmfc, l.hf, l.validTime, l.level, l.grid, l.variables.T, l.variables.hgt, l.variables.u, l.variables.v])))
const RANGES = { T: [150, 340, ['K']], hgt: [5000, 30000, ['m', 'gpm']], u: [-150, 150, ['m/s']], v: [-150, 150, ['m/s']] }

export function validateTropopauseSupplement(text, { name, level, tmfc, hf, grid }) {
  const stamp = `.ft${String(hf).padStart(3, '0')}.${tmfc}.nc`
  if (!text.includes(stamp) || !new RegExp(`=\\s*${name},\\s*unit`).test(text) || !new RegExp(`level\\s*[:=]\\s*${level}(?:\\s|,)`).test(text)
    || !text.includes(`lon1 = ${grid.lonMin.toFixed(1)}, lat1 = ${grid.latMin.toFixed(1)}, lon2 = ${grid.lonMax.toFixed(1)}, lat2 = ${grid.latMax.toFixed(1)}`)) throw new Error(`Tropopause supplemental identity mismatch: ${name}`)
  const parsed = parseKimGridText(text, { variable: name, level })
  const [lo, hi, units] = RANGES[name]
  if (parsed.nx !== grid.nx || parsed.ny !== grid.ny || !units.includes(parsed.unit?.replace(/,$/, ''))) throw new Error(`Tropopause supplemental grid/unit mismatch: ${name}`)
  if (parsed.values.length !== grid.nx * grid.ny || !parsed.values.every(v => Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`Tropopause supplemental range/missing: ${name}`)
  return parsed.values
}

async function supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid }) {
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'raw', 'trop', `hf${hf}-${name}-${level}.txt`)
  const cached = readKimRawText(file)
  let text = cached
  if (cached === null) {
    // 기본 KIM 격자·GKTG 추가 입력과 같은 키: 발표회차(tmfc)로 고른다(00·06 KIM, 12 레이더·위성, 18 항공).
    // 키가 없거나 막혀도 다른 키로 대체하지 않는다.
    const credential = selectKimRunCredential({
      tmfc,
      kimCredential: config.api.kim_nwp_auth_key,
      aviationCredential: config.api.auth_key,
      radarCredential: config.api.radar_satellite_auth_key,
    })
    if (!credential) throw new Error('tropopause_run_credential_unavailable')
    text = await fetchGrid({ data: 'P', name, level, tmfc, hf, sub: config.kim_surface_wind.sub, credential, signal })
  }
  const values = validateTropopauseSupplement(text, { name, level, tmfc, hf, grid })
  if (cached === null) writeKimRawText(file, text)
  return values
}

async function calculatePython(cube, stage, { signal, python }) {
  const input = path.join(stage, 'input.json')
  fs.writeFileSync(input, JSON.stringify(cube))
  const timeoutSignal = AbortSignal.timeout(config.kim_tropopause.calculation_timeout_ms)
  const calculationSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  await new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(engineDir, 'calculate.py'), input, stage], { signal: calculationSignal, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000) })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`tropopause_python_failed (${code}): ${error}`)))
  })
  return JSON.parse(fs.readFileSync(path.join(stage, 'result.json'), 'utf8'))
}

function validateResult(result, size) {
  const grids = ['trop', 'tropT', 'tropAboveTop', 'vmax', 'pmax']
  if (result?.algorithm !== TROPOPAUSE_ALGORITHM || !grids.every(name => Array.isArray(result[name]) && result[name].length === size) || !Array.isArray(result.jets)) throw new Error('Invalid tropopause output')
  const bad = (values, lo, hi) => values.some(v => v !== null && (!Number.isFinite(v) || v < lo || v > hi))
  if (bad(result.trop, 50, 600) || bad(result.vmax, 0, 400) || bad(result.pmax, 100, 600) || result.tropAboveTop.some(v => v !== 0 && v !== 1)) throw new Error('Out-of-range tropopause output')
  if (!result.vmax.every(Number.isFinite)) throw new Error('Incomplete tropopause wind output')
}

export async function process({ root = config.storage.base_path, tmfc = readKimNwpLatest(root)?.latestRun || readKimNwpLatest(root)?.tmfc,
  forecastHours = config.kim_nwp.forecast_hours, signal, fetchGrid = fetchKimGrid, calculate = calculatePython,
  python = config.kim_tropopause.python } = {}) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) return { type: 'kim_tropopause', collection: collectionResult('partial', { waiting: true }, { reason: 'kim_tropopause_base_waiting' }) }
  if (!Array.isArray(forecastHours) || !forecastHours.length || forecastHours.some(h => !Number.isInteger(h) || h < 0 || h > 12)) throw new Error('Invalid tropopause forecast hours')
  const entries = []
  const failures = []
  const baseRevisions = new Map()
  const engine = engineRevision()
  const cancelled = () => {
    writeKimTropopauseAttempt(root, tmfc, { tmfc, outcome: 'cancelled', expectedHours: forecastHours, fields: entries.length, completed_at: new Date().toISOString() })
    signal.throwIfAborted()
  }
  // 입력 격자·계산 코드·게시 결과가 지난 게시와 같으면 다시 읽지 않고 끝낸다(GKTG와 같은 이유).
  const baseFingerprint = fingerprintKimNwpBase({ root, tmfc, hours: forecastHours })
  const previous = readKimTropopauseLatest(root)
  if (baseFingerprint && previous?.complete && previous.tmfc === tmfc && previous.algorithm === TROPOPAUSE_ALGORITHM && previous.engineRevision === engine
    && previous.baseFingerprint === baseFingerprint && String(previous.expectedHours) === String(forecastHours)
    && previous.outputFingerprint && previous.outputFingerprint === fingerprintKimTropopauseOutputs(root, previous)) {
    return { type: 'kim_tropopause', tmfc, fields: previous.entries.length, revision: previous.revision, failures: [], saved: false, unchanged: true,
      collection: collectionResult('complete', { fields: previous.entries.length, expectedFields: forecastHours.length }) }
  }
  writeKimTropopauseAttempt(root, tmfc, { tmfc, started_at: new Date().toISOString(), outcome: 'running', expectedHours: forecastHours })
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc })
  for (const hf of forecastHours) {
    const hourStarted = Date.now()
    // 시각마다 한 번 이벤트 루프에 양보해 계산 중에도 API 요청을 처리한다.
    await nextTurn()
    if (signal?.aborted) cancelled()
    let stage
    try {
      // 기본 21층을 모두 확보한 시각만 추가 API를 요청한다.
      const layers = pressures.map(level => readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id }))
      const grid = layers[0].grid
      for (let k = 0; k < layers.length; k++) {
        if (layers[k].tmfc !== tmfc || Number(layers[k].hf) !== hf || layers[k].level.id !== pressures[k].id || layers[k].validTime !== addForecastHours(tmfc, hf) || !sameGrid(layers[k].grid, grid)) throw new Error('Mixed tropopause base grids')
      }
      baseRevisions.set(hf, baseRevision(layers))
      const size = grid.nx * grid.ny
      const base = Object.fromEntries(['u', 'v', 'T', 'hgt'].map(name => [name, layers.map(l => decodeGktgInput(l.variables[name], name, size))]))
      const upper = { T: [], hgt: [], u: [], v: [] }
      for (const level of TROPOPAUSE_SUPPLEMENT_LEVELS) for (const name of TROPOPAUSE_SUPPLEMENT_NAMES) {
        upper[name].push(await supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid }))
      }
      const cube = {
        grid, hf, validTime: addForecastHours(tmfc, hf),
        pressures: [...pressures.map(p => p.value), ...TROPOPAUSE_SUPPLEMENT_LEVELS],
        windPressures: pressures.map(p => p.value),
        fields: { T: [...base.T, ...upper.T], hgt: [...base.hgt, ...upper.hgt], u: base.u, v: base.v },
      }
      // 상층 바람은 계산 입력이 아니지만 같은 결과로 함께 게시하므로 revision에 포함한다.
      const inputRevision = sha(JSON.stringify([cube, upper.u, upper.v]))
      const revision = sha(`${engine}:${inputRevision}`)
      let exists = true
      try { readKimTropopauseField({ root, tmfc, hf, revision }); readKimTropopauseUpper({ root, tmfc, hf, revision }) } catch { exists = false }
      if (!exists) {
        const stages = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'derived', 'tropopause', '.staging')
        fs.mkdirSync(stages, { recursive: true })
        stage = fs.mkdtempSync(path.join(stages, 'hour-'))
        const result = await calculate(cube, stage, { python, signal })
        validateResult(result, size)
        writeKimTropopauseField(root, {
          type: 'kim_nwp_tropopause', product: 'TROP_JET', model: KIM_NWP_MODEL, grid,
          time: { tmfc, hf, validTime: cube.validTime }, encoding: 'float-json-v1',
          units: { trop: 'hPa', tropT: '°C', vmax: 'kt', pmax: 'hPa' },
          trop: result.trop, tropT: result.tropT, tropAboveTop: result.tropAboveTop, vmax: result.vmax, pmax: result.pmax,
          jets: result.jets, checks: result.checks, revision, inputRevision, algorithm: TROPOPAUSE_ALGORITHM, engineRevision: engine,
        })
      }
      // 단면용 상층(100·70 hPa) 원 격자. 지도 결과와 분리해 지도 요청 크기를 늘리지 않는다.
      writeKimTropopauseUpper(root, { tmfc, hf, revision, grid, levels: TROPOPAUSE_SUPPLEMENT_LEVELS.map((pressure, k) => ({
        pressure, hgt: upper.hgt[k], T: upper.T[k], u: upper.u[k], v: upper.v[k] })) })
      entries.push({ hf, validTime: cube.validTime, revision, inputRevision })
      appendKimRunEvent(runDir, { type: 'tropopause_hour', hf, computed: !exists, ms: Date.now() - hourStarted, revision })
    } catch (error) {
      if (signal?.aborted) cancelled()
      failures.push({ hf, reason: error.code || error.message })
      appendKimRunEvent(runDir, { type: 'tropopause_hour_failed', hf, ms: Date.now() - hourStarted, reason: String(error.code || error.message).slice(0, 300) })
    } finally { if (stage) fs.rmSync(stage, { recursive: true, force: true }) }
  }
  // 계산 중 기본 수집기가 입력을 바꿨으면 그 시각은 게시하지 않는다.
  for (const [hf, captured] of baseRevisions) {
    if (failures.some(failure => failure.hf === hf)) continue
    await nextTurn()
    try {
      const current = pressures.map(level => readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id }))
      if (baseRevision(current) !== captured) throw new Error('kim_tropopause_base_changed')
    } catch (error) {
      failures.push({ hf, reason: error.code || error.message })
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].hf === hf) entries.splice(i, 1)
    }
  }
  const complete = failures.length === 0
  let published = null
  if (complete) {
    published = publishKimTropopauseRun(root, { tmfc, model: KIM_NWP_MODEL, algorithm: TROPOPAUSE_ALGORITHM, engineRevision: engine, revision: sha(JSON.stringify(entries)), expectedHours: forecastHours, entries, baseFingerprint, fetched_at: new Date().toISOString() })
    cleanupKimNwpRuns({ root, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId: readKimNwpLatest(root)?.latestRunId, onlyComplete: true, reason: 'tropopause_published' })
  }
  appendKimRunEvent(runDir, { type: complete ? 'tropopause_published' : 'tropopause_partial', revision: published?.revision || null, fields: entries.length, failures: failures.length })
  writeKimTropopauseAttempt(root, tmfc, { tmfc, outcome: complete ? 'complete' : 'partial', expectedHours: forecastHours, fields: entries.length, failures, completed_at: new Date().toISOString() })
  return { type: 'kim_tropopause', tmfc, fields: entries.length, revision: published?.revision, failures, saved: complete,
    collection: collectionResult(complete ? 'complete' : 'partial', { fields: entries.length, expectedFields: forecastHours.length }, complete ? {} : { reason: 'kim_tropopause_incomplete' }) }
}

export default { process }
