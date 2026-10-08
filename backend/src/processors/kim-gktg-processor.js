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
import { cleanupKimNwpRuns, readKimNwpLatest, readKimNwpGridVariables, readKimGktgField, readKimGktgLatest, resolveKimNwpRunDir, resolveKimGktgFieldPath, writeKimGktgField, writeKimGktgAttempt, publishKimGktgRun, fingerprintKimNwpBase, fingerprintKimGktgOutputs } from './kim-nwp-store.js'

const engineDir = fileURLToPath(new URL('../../python/kim_turbulence/', import.meta.url))
const pressures = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
export const GKTG_ALGORITHM = 'kim-gktg-python-v5'
const sha = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)
const engineRevision = () => sha(['python_core.py', 'python_port.py', 'python_dynamics.py', 'python_theta.py', 'python_structure.py', 'python_combine.py', 'calibration.json', 'calculate.py', 'input_validation.py', 'products.py', 'requirements.txt'].map(name => fs.readFileSync(path.join(engineDir, name))).reduce((result, value) => Buffer.concat([result, value]), Buffer.from('kim-gktg-field-v1\n')))
const sameGrid = (a, b) => ['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every(key => a[key] === b[key])
// calculate.py의 FIELDS·SURFACE와 같은 순서.
const CUBE_FIELDS = ['u', 'v', 'w', 'T', 'q', 'hgt']
const SURFACE_FIELDS = ['ps', 'topo', 'hpbl']

export function decodeGktgInput(variable, name, size) {
  const units = { u: ['m/s'], v: ['m/s'], w: ['m/s'], T: ['K'], hgt: ['m', 'gpm'], q: ['kg/kg', 'kg kg-1', '1'] }
  if (!variable || !units[name]?.includes(variable.unit?.replace(/,$/, '')) || variable.values?.length !== size) throw new Error(`Invalid GKTG input ${name}`)
  if (variable.encoding === 'int16-scaled-json-v1' && (!Number.isFinite(variable.scale) || variable.scale <= 0 || variable.values.some(v => Math.abs(v) === 32767))) throw new Error(`Invalid/saturated GKTG input ${name}`)
  const values = decodeComponent(variable.values, variable)
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error(`Incomplete GKTG input ${name}`)
  return values
}

// decodeGktgInput과 같은 검사·같은 값을 TypedArray(GKTG float32, 권계면 float64)로 바로 만든다. 저장된 int16 배열(TypedArray)이나
// 일반 배열을 받는다. 일반 배열로 펼치지 않아 층 문서 하나를 읽는 메모리·시간이 준다. 값은 decodeGktgInput 결과를 Typed에 담은 것과 같다.
export function decodeGktgInputArray(variable, name, size, Typed = Float32Array) {
  const units = { u: ['m/s'], v: ['m/s'], w: ['m/s'], T: ['K'], hgt: ['m', 'gpm'], q: ['kg/kg', 'kg kg-1', '1'] }
  const values = variable?.values
  if (!variable || !units[name]?.includes(variable.unit?.replace(/,$/, '')) || values?.length !== size) throw new Error(`Invalid GKTG input ${name}`)
  const packed = variable.encoding === 'int16-scaled-json-v1'
  const scale = variable.scale ?? 1
  const offset = variable.offset ?? 0
  if (packed && (!Number.isFinite(variable.scale) || variable.scale <= 0)) throw new Error(`Invalid/saturated GKTG input ${name}`)
  const out = new Typed(size)
  for (let i = 0; i < size; i++) {
    const value = values[i]
    if (packed && Math.abs(value) === 32767) throw new Error(`Invalid/saturated GKTG input ${name}`)
    const decoded = packed ? (value === -32768 || !Number.isFinite(value) ? Number.NaN : value * scale + offset) : value
    if (typeof decoded !== 'number' || !Number.isFinite(decoded)) throw new Error(`Incomplete GKTG input ${name}`)
    out[i] = decoded
  }
  return out
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

// 한 예보시각 계산 입력을 stage에 쓴다: job.json + float32 파일(cube.f32 변수×기압면×y×x, surface.f32).
// 기본 격자를 한 층씩 읽어 바로 쓰므로 Node가 21층 전체를 들고 있지 않는다(확대 영역 JSON 큐브는 Node 약 4 GB였다).
// inputRevision은 쓴 값(float32, 계산 엔진이 쓰는 정밀도)과 격자·시각으로 만든다.
async function writeGktgInput({ root, tmfc, hf, stage, signal, fetchGrid, domain }) {
  const validTime = addForecastHours(tmfc, hf)
  const nz = pressures.length
  const hash = crypto.createHash('sha256')
  let grid = null
  let size = 0
  let cube = null
  const missingW = []
  const write = (fd, index, values, label) => {
    const array = values instanceof Float32Array ? values : Float32Array.from(values)
    fs.writeSync(fd, array, 0, array.byteLength, index * size * 4)
    hash.update(`${label}\n`)
    hash.update(new Uint8Array(array.buffer))
  }
  try {
    // 기본 21층을 모두 확인한 다음에만 추가 입력을 요청한다.
    for (let k = 0; k < nz; k++) {
      // 계산에 쓰는 6개 변수만 읽는다(층 문서의 나머지 바람·습도·착빙 변수는 열지 않는다).
      const layer = readKimNwpGridVariables({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: pressures[k].id, names: CUBE_FIELDS, domain })
      if (!grid) {
        grid = layer.grid
        size = grid.nx * grid.ny
        hash.update(JSON.stringify({ format: 'kim-gktg-input-v2', grid, hf, validTime, pressures: pressures.map(p => p.value * 100) }))
        cube = fs.openSync(path.join(stage, 'cube.f32'), 'w')
        fs.ftruncateSync(cube, CUBE_FIELDS.length * nz * size * 4)
      }
      if (layer.tmfc !== tmfc || Number(layer.hf) !== hf || layer.level.id !== pressures[k].id || layer.validTime !== validTime || !sameGrid(layer.grid, grid)) throw new Error('Mixed GKTG base grids')
      for (const [f, name] of CUBE_FIELDS.entries()) {
        if (name === 'w' && !layer.variables.w) { missingW.push(k); continue }
        write(cube, f * nz + k, decodeGktgInputArray(layer.variables[name], name, size), `${name}:${k}`)
      }
    }
    for (const k of missingW) {
      write(cube, CUBE_FIELDS.indexOf('w') * nz + k, await supplement({ root, tmfc, hf, name: 'w', level: pressures[k].value, grid, signal, fetchGrid, domain }), `w:${k}`)
    }
  } finally { if (cube !== null) fs.closeSync(cube) }
  const surface = fs.openSync(path.join(stage, 'surface.f32'), 'w')
  try {
    for (const [s, name] of SURFACE_FIELDS.entries()) write(surface, s, await supplement({ root, tmfc, hf, name, level: 0, grid, signal, fetchGrid, domain }), name)
  } finally { fs.closeSync(surface) }
  const job = { grid, hf, validTime, pressures: pressures.map(p => p.value * 100), cube: 'cube.f32', surface: 'surface.f32' }
  fs.writeFileSync(path.join(stage, 'job.json'), JSON.stringify(job))
  return { job, inputRevision: hash.digest('hex').slice(0, 20) }
}

// Python은 블록마다 stdout에 진행 한 줄을 쓴다. 제한시간은 블록 하나(한반도는 한 번에 계산하는 한 덩어리) 기준이다.
async function calculatePython(job, stage, { signal, python }) {
  const watchdog = new AbortController()
  let timer = null
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => watchdog.abort(new Error('gktg_python_block_timeout')), config.kim_gktg.calculation_timeout_ms)
  }
  const calculationSignal = signal ? AbortSignal.any([signal, watchdog.signal]) : watchdog.signal
  arm()
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(python, [path.join(engineDir, 'calculate.py'), path.join(stage, 'job.json'), stage], { signal: calculationSignal, env: { ...process.env, NUMBA_CACHE_DIR: config.kim_gktg.cache_path }, stdio: ['ignore', 'pipe', 'pipe'] })
      let error = ''
      child.stdout.on('data', chunk => { if (String(chunk).includes('"block"')) arm() })
      child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000) })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`gktg_python_failed (${code}): ${error}`)))
    })
  } finally { clearTimeout(timer) }
  return readGktgOutput(stage, job)
}

// gktg.f32(기압면×y×x, 결측 NaN) → 기압면 k의 배열(결측 null)을 꺼내는 함수. float32 값을 그대로 숫자로 둔다.
// 결측이 섞인 JS 배열은 값마다 따로 포장돼 확대 영역 한 층이 약 10 MB라, 21층을 한꺼번에 펼치지 않고 한 층씩 꺼낸다.
export function readGktgOutput(stage, job) {
  const size = job.grid.nx * job.grid.ny
  const buffer = fs.readFileSync(path.join(stage, 'gktg.f32'))
  if (buffer.byteLength !== job.pressures.length * size * 4) throw new Error('Invalid GKTG output size')
  const values = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  return k => Array.from(values.subarray(k * size, (k + 1) * size), v => (Number.isNaN(v) ? null : v))
}

// 한 예보시각의 GKTG 추가 입력(기본 격자에 없는 층의 w, 지상 ps·topo·hpbl)을 미리 받아 원문 캐시에 둔다. 계산 때는
// 캐시를 읽어 API를 부르지 않는다. 확대 영역은 대용량 키가 자정에 닫혀, 계산이 늦어져도 입력은 그 전에 받아 둬야 한다.
export async function prefetchGktgSupplements({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc, hf, signal, fetchGrid = fetchKimGrid }) {
  let grid = null
  for (const level of pressures) {
    const layer = readKimNwpGridVariables({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, names: [], domain })
    grid ||= layer.grid
    if (!layer.variables?.w) await supplement({ root, tmfc, hf, name: 'w', level: level.value, grid, signal, fetchGrid, domain })
  }
  for (const name of ['ps', 'topo', 'hpbl']) await supplement({ root, tmfc, hf, name, level: 0, grid, signal, fetchGrid, domain })
}

export async function process({ root = config.storage.base_path, domain = KIM_DEFAULT_DOMAIN, tmfc = readKimNwpLatest(root, domain)?.latestRun || readKimNwpLatest(root, domain)?.tmfc,
  forecastHours = config.kim_nwp.forecast_hours, signal, fetchGrid = fetchKimGrid, calculate = calculatePython,
  python = config.kim_gktg.python, turn = async () => () => {}, publish = true } = {}) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) return { type: 'kim_gktg', collection: collectionResult('partial', { waiting: true }, { reason: 'kim_gktg_base_waiting' }) }
  if (!Array.isArray(forecastHours) || !forecastHours.length || forecastHours.some(h => !kimDomain(domain).forecastHours.includes(h))) throw new Error('Invalid GKTG forecast hours')
  const entries = []
  const failures = []
  const baseFingerprints = new Map()
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
    let releaseTurn = null
    try {
      // 무거운 계산 순번을 예보시각마다 받는다(부모가 서버 남은 메모리도 확인한다). 시각 사이에 위성 처리가 들어올 수 있다.
      releaseTurn = await turn()
      // 계산 중 기본 수집기가 이 시각 입력을 바꾸면 게시하지 않는다. 파일 지문(inode·크기·수정 시각)으로 본다.
      baseFingerprints.set(hf, fingerprintKimNwpBase({ root, tmfc, hours: [hf], domain }))
      const stages = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'gktg', '.staging')
      fs.mkdirSync(stages, { recursive: true })
      stage = fs.mkdtempSync(path.join(stages, 'hour-'))
      const { job, inputRevision } = await writeGktgInput({ root, tmfc, hf, stage, signal, fetchGrid, domain })
      const { grid } = job
      const revision = sha(`${engine}:${inputRevision}`)
      const exists = pressures.every(level => {
        try { readKimGktgField({ root, tmfc, hf, levelId: level.id, revision, domain }); return true }
        catch { return false }
      })
      if (!exists) {
        const output = await calculate(job, stage, { python, signal })
        const levelValues = typeof output === 'function' ? output : k => output[k]
        for (let k = 0; k < pressures.length; k++) {
          const gktg = levelValues(k)
          if (gktg?.length !== grid.nx * grid.ny || !gktg.some(Number.isFinite) || gktg.some(v => v !== null && (!Number.isFinite(v) || v < 0 || v > 1.5))) throw new Error('Invalid GKTG output field')
          // 결과 문서에는 같은 입력의 지위고도만 붙인다.
          const layer = readKimNwpGridVariables({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: pressures[k].id, names: ['hgt'], domain })
          layer.variables = { hgt: { ...layer.variables.hgt, values: Array.from(layer.variables.hgt.values, v => (Number.isNaN(v) ? null : v)) } }
          writeKimGktgField(root, buildKimGktgFieldFromGrid(layer, { gktg, revision, inputRevision, algorithm: GKTG_ALGORITHM, engineRevision: engine }), domain)
        }
      }
      for (const level of pressures) entries.push({ levelId: level.id, hf, validTime: job.validTime, variables: ['gktg'], hashes: { gktg: revision }, revision, inputRevision, grid,
        path: path.relative(root, resolveKimGktgFieldPath({ root, tmfc, hf, levelId: level.id, revision, domain })) })
      appendKimRunEvent(runDir, { type: 'gktg_hour', hf, computed: !exists, ms: Date.now() - hourStarted, revision })
    } catch (error) {
      if (signal?.aborted) {
        writeKimGktgAttempt(root, tmfc, { tmfc, outcome: 'cancelled', expectedHours: forecastHours, fields: entries.length, completed_at: new Date().toISOString() }, domain)
        signal.throwIfAborted()
      }
      failures.push({ hf, reason: error.code || error.message })
      appendKimRunEvent(runDir, { type: 'gktg_hour_failed', hf, ms: Date.now() - hourStarted, reason: String(error.code || error.message).slice(0, 300) })
    } finally {
      if (stage) fs.rmSync(stage, { recursive: true, force: true })
      releaseTurn?.()
    }
  }
  // A base collector may update inputs while Python runs. Keep the previous
  // complete publication until every captured hour still matches its inputs.
  for (const [hf, captured] of baseFingerprints) {
    if (failures.some(failure => failure.hf === hf)) continue
    await nextTurn()
    try {
      if (!captured || fingerprintKimNwpBase({ root, tmfc, hours: [hf], domain }) !== captured) throw new Error('kim_gktg_base_changed')
    } catch (error) {
      failures.push({ hf, reason: error.code || error.message })
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].hf === hf) entries.splice(i, 1)
    }
  }
  const complete = failures.length === 0
  let published = null
  // publish=false: 시각별 결과만 계산해 두고 게시는 나중에 한다(확대 영역은 받으면서 시각마다 계산한다).
  if (complete && publish) {
    published = publishKimGktgRun(root, { tmfc, model: KIM_NWP_MODEL, algorithm: GKTG_ALGORITHM, engineRevision: engine, revision: sha(JSON.stringify(entries)), expectedHours: forecastHours, entries, baseFingerprint, fetched_at: new Date().toISOString() }, domain)
    // 이전 회차를 붙잡고 있던 파생 게시가 넘어왔으니 여기서도 정리한다(기본 게시 때는 아직 이전 회차를 가리킨다).
    cleanupKimNwpRuns({ root, domain, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId: readKimNwpLatest(root, domain)?.latestRunId, onlyComplete: true, reason: 'gktg_published' })
  }
  appendKimRunEvent(runDir, { type: !complete ? 'gktg_partial' : publish ? 'gktg_published' : 'gktg_computed', hours: forecastHours, revision: published?.revision || null, fields: entries.length, failures: failures.length })
  writeKimGktgAttempt(root, tmfc, { tmfc, outcome: !complete ? 'partial' : publish ? 'complete' : 'computed', expectedHours: forecastHours, fields: entries.length, failures, completed_at: new Date().toISOString() }, domain)
  return { type: 'kim_gktg', tmfc, fields: entries.length, revision: published?.revision, failures, saved: complete,
    collection: collectionResult(complete ? 'complete' : 'partial', { fields: entries.length, expectedFields: forecastHours.length * pressures.length }, complete ? {} : { reason: 'kim_gktg_incomplete' }) }
}

export default { process }
