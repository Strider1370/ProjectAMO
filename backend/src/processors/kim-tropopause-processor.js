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
import { KIM_NWP_MODEL, KIM_NWP_LEVELS, addForecastHours } from './kim-nwp-model.js'
import { decodeGktgInputArray, supplementBoundsMatch } from './kim-gktg-processor.js'
import { cleanupKimNwpRuns, readKimNwpLatest, readKimNwpGridVariables, readKimTropopauseField, readKimTropopauseUpper, readKimTropopauseLatest, resolveKimNwpRunDir, writeKimTropopauseField, writeKimTropopauseUpper, writeKimTropopauseAttempt, publishKimTropopauseRun, fingerprintKimNwpBase, fingerprintKimTropopauseOutputs } from './kim-nwp-store.js'
import { readKimRawText, writeKimRawText } from './kim-doc-store.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { KIM_DEFAULT_DOMAIN, kimDomain, kimDomainRequest } from './kim-domain.js'

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
// 제트 탐색(jet.py SEARCH_BOTTOM_HPA~SEARCH_TOP_HPA)이 쓰는 바람 층. Python에는 이 층의 u·v만 넘긴다.
const windLevels = pressures.filter(level => level.value <= 500 && level.value >= 150)
const RANGES = { T: [150, 340, ['K']], hgt: [5000, 30000, ['m', 'gpm']], u: [-150, 150, ['m/s']], v: [-150, 150, ['m/s']] }

export function validateTropopauseSupplement(text, { name, level, tmfc, hf, grid }) {
  const stamp = `.ft${String(hf).padStart(3, '0')}.${tmfc}.nc`
  if (!text.includes(stamp) || !new RegExp(`=\\s*${name},\\s*unit`).test(text) || !new RegExp(`level\\s*[:=]\\s*${level}(?:\\s|,)`).test(text)
    || !supplementBoundsMatch(text, grid)) throw new Error(`Tropopause supplemental identity mismatch: ${name}`)
  const parsed = parseKimGridText(text, { variable: name, level })
  const [lo, hi, units] = RANGES[name]
  if (parsed.nx !== grid.nx || parsed.ny !== grid.ny || !units.includes(parsed.unit?.replace(/,$/, ''))) throw new Error(`Tropopause supplemental grid/unit mismatch: ${name}`)
  if (parsed.values.length !== grid.nx * grid.ny || !parsed.values.every(v => Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`Tropopause supplemental range/missing: ${name}`)
  return parsed.values
}

async function supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid, domain }) {
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'raw', 'trop', `hf${hf}-${name}-${level}.txt`)
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
      ...kimBulkCredentialOptions(config, Date.now(), { required: kimDomain(domain).bulkOnly }),
    })
    if (!credential) throw new Error('tropopause_run_credential_unavailable')
    text = await fetchGrid({ data: 'P', name, level, tmfc, hf, sub: kimDomainRequest(config, domain).sub, credential, signal })
  }
  const values = validateTropopauseSupplement(text, { name, level, tmfc, hf, grid })
  if (cached === null) writeKimRawText(file, text)
  return values
}

// 한 예보시각 계산 입력을 stage에 쓴다: job.json + cube.f8(float64; T·hgt 21층+100·70 hPa, u·v 500~150 hPa).
// 권계면 계산은 float64로 하므로 값을 decode 결과 그대로 넘긴다. 기본 격자는 한 층씩, 필요한 변수만 읽는다.
// 100·70 hPa u·v는 계산 입력이 아니지만 단면용 상층 결과로 함께 게시하므로 inputRevision에 넣는다.
async function writeTropopauseInput({ root, tmfc, hf, stage, signal, fetchGrid, domain }) {
  const validTime = addForecastHours(tmfc, hf)
  const levels = pressures.length + TROPOPAUSE_SUPPLEMENT_LEVELS.length
  const offsets = { T: 0, hgt: levels, u: 2 * levels, v: 2 * levels + windLevels.length }
  const hash = crypto.createHash('sha256')
  let grid = null
  let size = 0
  let cube = null
  const write = (name, k, values) => {
    const array = values instanceof Float64Array ? values : Float64Array.from(values)
    fs.writeSync(cube, array, 0, array.byteLength, (offsets[name] + k) * size * 8)
    hash.update(`${name}:${k}\n`)
    hash.update(new Uint8Array(array.buffer))
  }
  const upper = { T: [], hgt: [], u: [], v: [] }
  try {
    // 기본 21층을 모두 확보한 시각만 추가 API를 요청한다.
    for (const [k, level] of pressures.entries()) {
      const wind = windLevels.indexOf(level)
      const layer = readKimNwpGridVariables({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, names: wind >= 0 ? ['T', 'hgt', 'u', 'v'] : ['T', 'hgt'], domain })
      if (!grid) {
        grid = layer.grid
        size = grid.nx * grid.ny
        hash.update(JSON.stringify({ format: 'kim-tropopause-input-v2', grid, hf, validTime, pressures: pressures.map(p => p.value), windPressures: windLevels.map(p => p.value) }))
        cube = fs.openSync(path.join(stage, 'cube.f8'), 'w')
        fs.ftruncateSync(cube, (2 * levels + 2 * windLevels.length) * size * 8)
      }
      if (layer.tmfc !== tmfc || Number(layer.hf) !== hf || layer.level.id !== level.id || layer.validTime !== validTime || !sameGrid(layer.grid, grid)) throw new Error('Mixed tropopause base grids')
      for (const name of ['T', 'hgt']) write(name, k, decodeGktgInputArray(layer.variables[name], name, size, Float64Array))
      if (wind >= 0) for (const name of ['u', 'v']) write(name, wind, decodeGktgInputArray(layer.variables[name], name, size, Float64Array))
    }
    for (const [j, level] of TROPOPAUSE_SUPPLEMENT_LEVELS.entries()) for (const name of TROPOPAUSE_SUPPLEMENT_NAMES) {
      const values = await supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid, domain })
      upper[name].push(values)
      if (name === 'T' || name === 'hgt') write(name, pressures.length + j, values)
      else { hash.update(`upper-${name}:${level}\n`); hash.update(new Uint8Array(Float64Array.from(values).buffer)) }
    }
  } finally { if (cube !== null) fs.closeSync(cube) }
  const job = { grid, hf, validTime, pressures: [...pressures.map(p => p.value), ...TROPOPAUSE_SUPPLEMENT_LEVELS],
    windPressures: windLevels.map(p => p.value), cube: 'cube.f8' }
  fs.writeFileSync(path.join(stage, 'job.json'), JSON.stringify(job))
  return { job, upper, inputRevision: hash.digest('hex').slice(0, 20) }
}

// 한 예보시각의 권계면 추가 입력(100·70 hPa T·hgt·u·v)을 미리 받아 원문 캐시에 둔다(GKTG 미리 받기와 같은 이유).
export async function prefetchTropopauseSupplements({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc, hf, signal, fetchGrid = fetchKimGrid }) {
  const { grid } = readKimNwpGridVariables({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: pressures[0].id, names: [], domain })
  for (const level of TROPOPAUSE_SUPPLEMENT_LEVELS) for (const name of TROPOPAUSE_SUPPLEMENT_NAMES) {
    await supplement({ root, tmfc, hf, name, level, grid, signal, fetchGrid, domain })
  }
}

async function calculatePython(job, stage, { signal, python }) {
  const input = path.join(stage, 'job.json')
  const timeoutSignal = AbortSignal.timeout(config.kim_tropopause.calculation_timeout_ms)
  const calculationSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  await new Promise((resolve, reject) => {
    // 열적 권계면 판정은 Numba로 컴파일한다. 컴파일 결과는 GKTG와 같은 캐시 폴더에 둔다(배포 폴더는 쓰지 않는다).
    const child = spawn(python, [path.join(engineDir, 'calculate.py'), input, stage], { signal: calculationSignal, env: { ...process.env, NUMBA_CACHE_DIR: config.kim_gktg.cache_path }, stdio: ['ignore', 'ignore', 'pipe'] })
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

export async function process({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc = readKimNwpLatest(root, domain)?.latestRun || readKimNwpLatest(root, domain)?.tmfc,
  forecastHours = config.kim_nwp.forecast_hours, signal, fetchGrid = fetchKimGrid, calculate = calculatePython,
  python = config.kim_tropopause.python, turn = async () => () => {}, publish = true } = {}) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) return { type: 'kim_tropopause', collection: collectionResult('partial', { waiting: true }, { reason: 'kim_tropopause_base_waiting' }) }
  if (!Array.isArray(forecastHours) || !forecastHours.length || forecastHours.some(h => !kimDomain(domain).forecastHours.includes(h))) throw new Error('Invalid tropopause forecast hours')
  const entries = []
  const failures = []
  const baseFingerprints = new Map()
  const engine = engineRevision()
  const cancelled = () => {
    writeKimTropopauseAttempt(root, tmfc, { tmfc, outcome: 'cancelled', expectedHours: forecastHours, fields: entries.length, completed_at: new Date().toISOString() }, domain)
    signal.throwIfAborted()
  }
  // 입력 격자·계산 코드·게시 결과가 지난 게시와 같으면 다시 읽지 않고 끝낸다(GKTG와 같은 이유).
  const baseFingerprint = fingerprintKimNwpBase({ root, tmfc, hours: forecastHours, domain })
  const previous = readKimTropopauseLatest(root, domain)
  if (baseFingerprint && previous?.complete && previous.tmfc === tmfc && previous.algorithm === TROPOPAUSE_ALGORITHM && previous.engineRevision === engine
    && previous.baseFingerprint === baseFingerprint && String(previous.expectedHours) === String(forecastHours)
    && previous.outputFingerprint && previous.outputFingerprint === fingerprintKimTropopauseOutputs(root, previous, domain)) {
    return { type: 'kim_tropopause', tmfc, fields: previous.entries.length, revision: previous.revision, failures: [], saved: false, unchanged: true,
      collection: collectionResult('complete', { fields: previous.entries.length, expectedFields: forecastHours.length }) }
  }
  writeKimTropopauseAttempt(root, tmfc, { tmfc, started_at: new Date().toISOString(), outcome: 'running', expectedHours: forecastHours }, domain)
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain })
  for (const hf of forecastHours) {
    const hourStarted = Date.now()
    // 시각마다 한 번 이벤트 루프에 양보해 계산 중에도 API 요청을 처리한다.
    await nextTurn()
    if (signal?.aborted) cancelled()
    let stage
    let releaseTurn = null
    try {
      // 무거운 계산 순번을 예보시각마다 받는다(GKTG와 같다).
      releaseTurn = await turn()
      // 계산 중 기본 수집기가 이 시각 입력을 바꾸면 게시하지 않는다. 파일 지문(inode·크기·수정 시각)으로 본다.
      baseFingerprints.set(hf, fingerprintKimNwpBase({ root, tmfc, hours: [hf], domain }))
      const stages = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'tropopause', '.staging')
      fs.mkdirSync(stages, { recursive: true })
      stage = fs.mkdtempSync(path.join(stages, 'hour-'))
      const { job, upper, inputRevision } = await writeTropopauseInput({ root, tmfc, hf, stage, signal, fetchGrid, domain })
      const { grid } = job
      const size = grid.nx * grid.ny
      const revision = sha(`${engine}:${inputRevision}`)
      let exists = true
      try { readKimTropopauseField({ root, tmfc, hf, revision, domain }); readKimTropopauseUpper({ root, tmfc, hf, revision, domain }) } catch { exists = false }
      if (!exists) {
        const result = await calculate(job, stage, { python, signal })
        validateResult(result, size)
        writeKimTropopauseField(root, {
          type: 'kim_nwp_tropopause', product: 'TROP_JET', model: KIM_NWP_MODEL, grid,
          time: { tmfc, hf, validTime: job.validTime }, encoding: 'float-json-v1',
          units: { trop: 'hPa', tropT: '°C', vmax: 'kt', pmax: 'hPa' },
          trop: result.trop, tropT: result.tropT, tropAboveTop: result.tropAboveTop, vmax: result.vmax, pmax: result.pmax,
          jets: result.jets, checks: result.checks, revision, inputRevision, algorithm: TROPOPAUSE_ALGORITHM, engineRevision: engine,
        }, domain)
      }
      // 단면용 상층(100·70 hPa) 원 격자. 지도 결과와 분리해 지도 요청 크기를 늘리지 않는다.
      writeKimTropopauseUpper(root, { tmfc, hf, revision, grid, levels: TROPOPAUSE_SUPPLEMENT_LEVELS.map((pressure, k) => ({
        pressure, hgt: upper.hgt[k], T: upper.T[k], u: upper.u[k], v: upper.v[k] })) }, domain)
      entries.push({ hf, validTime: job.validTime, revision, inputRevision })
      appendKimRunEvent(runDir, { type: 'tropopause_hour', hf, computed: !exists, ms: Date.now() - hourStarted, revision })
    } catch (error) {
      if (signal?.aborted) cancelled()
      failures.push({ hf, reason: error.code || error.message })
      appendKimRunEvent(runDir, { type: 'tropopause_hour_failed', hf, ms: Date.now() - hourStarted, reason: String(error.code || error.message).slice(0, 300) })
    } finally {
      if (stage) fs.rmSync(stage, { recursive: true, force: true })
      releaseTurn?.()
    }
  }
  // 계산 중 기본 수집기가 입력을 바꿨으면 그 시각은 게시하지 않는다.
  for (const [hf, captured] of baseFingerprints) {
    if (failures.some(failure => failure.hf === hf)) continue
    await nextTurn()
    try {
      if (!captured || fingerprintKimNwpBase({ root, tmfc, hours: [hf], domain }) !== captured) throw new Error('kim_tropopause_base_changed')
    } catch (error) {
      failures.push({ hf, reason: error.code || error.message })
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].hf === hf) entries.splice(i, 1)
    }
  }
  const complete = failures.length === 0
  let published = null
  // publish=false: 시각별 결과만 계산해 둔다(GKTG와 같다).
  if (complete && publish) {
    published = publishKimTropopauseRun(root, { tmfc, model: KIM_NWP_MODEL, algorithm: TROPOPAUSE_ALGORITHM, engineRevision: engine, revision: sha(JSON.stringify(entries)), expectedHours: forecastHours, entries, baseFingerprint, fetched_at: new Date().toISOString() }, domain)
    cleanupKimNwpRuns({ root, domain, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId: readKimNwpLatest(root, domain)?.latestRunId, onlyComplete: true, reason: 'tropopause_published' })
  }
  appendKimRunEvent(runDir, { type: !complete ? 'tropopause_partial' : publish ? 'tropopause_published' : 'tropopause_computed', hours: forecastHours, revision: published?.revision || null, fields: entries.length, failures: failures.length })
  writeKimTropopauseAttempt(root, tmfc, { tmfc, outcome: !complete ? 'partial' : publish ? 'complete' : 'computed', expectedHours: forecastHours, fields: entries.length, failures, completed_at: new Date().toISOString() }, domain)
  // publish=false인 시각별 계산은 결과 목록·입력 지문·계산 판을 돌려준다. 확대 회차가 모아 두었다가
  // publishComputedTropopause로 다시 읽지 않고 게시한다.
  const computedResult = publish ? {} : { entries, baseFingerprints: Object.fromEntries(baseFingerprints), engineRevision: engine }
  return { type: 'kim_tropopause', tmfc, fields: entries.length, revision: published?.revision, failures, saved: complete, ...computedResult,
    collection: collectionResult(complete ? 'complete' : 'partial', { fields: entries.length, expectedFields: forecastHours.length }, complete ? {} : { reason: 'kim_tropopause_incomplete' }) }
}

// 확대 회차 게시: 시각별 계산(publish=false)이 돌려준 결과로 바로 게시한다. 게시를 다시 부르면 33시각 입력을 다시 준비하고
// 결과를 모두 다시 열어 운영 서버에서 회차마다 약 7분(GKTG)·2분(권계면)이 걸렸다(2026-10-09). 입력 격자가 계산 뒤 바뀌지
// 않았는지(파일 지문)와 결과 파일이 모두 있는지만 확인한다. 하나라도 맞지 않으면 던지고, 호출한 쪽이 예전 방식으로 게시한다.
export function publishComputedTropopause({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc, forecastHours, hourResults }) {
  const engines = new Set(hourResults.map(result => result?.engineRevision))
  if (engines.size !== 1 || !engines.values().next().value) throw new Error('kim_tropopause_engine_mismatch')
  const engine = engines.values().next().value
  const entries = []
  forecastHours.forEach((hf, index) => {
    const result = hourResults[index]
    const list = (result?.entries || []).filter(entry => entry.hf === hf)
    if (!list.length) throw new Error('kim_tropopause_hour_incomplete')
    const captured = result.baseFingerprints?.[hf]
    if (!captured || fingerprintKimNwpBase({ root, tmfc, hours: [hf], domain }) !== captured) throw new Error('kim_tropopause_base_changed')
    entries.push(...list)
  })
  const baseFingerprint = fingerprintKimNwpBase({ root, tmfc, hours: forecastHours, domain })
  const published = publishKimTropopauseRun(root, { tmfc, model: KIM_NWP_MODEL, algorithm: TROPOPAUSE_ALGORITHM, engineRevision: engine, revision: sha(JSON.stringify(entries)), expectedHours: forecastHours, entries, baseFingerprint, fetched_at: new Date().toISOString() }, domain, { readFields: false })
  appendKimRunEvent(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), { type: 'tropopause_published', hours: forecastHours, revision: published.revision, fields: entries.length, failures: 0, fromComputed: true })
  writeKimTropopauseAttempt(root, tmfc, { tmfc, outcome: 'complete', expectedHours: forecastHours, fields: entries.length, failures: [], completed_at: new Date().toISOString() }, domain)
  return published
}

export default { process }
