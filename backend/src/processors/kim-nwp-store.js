import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'

import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpIndex } from './kim-nwp-model.js'
import { KIM_DEFAULT_DOMAIN, kimDomain } from './kim-domain.js'
import { kimDocumentExists, kimDocumentStoragePath, quarantineKimDocument, readKimDocument, readKimDocumentArrays, writeKimDocument } from './kim-doc-store.js'
import { appendKimRunEvent } from './kim-run-events.js'

// 모든 함수는 영역(domain, 기본 'kr')을 받는다. 영역마다 저장 폴더가 따로라(kim-domain.js) 회차·latest·index·
// 파생 결과·정리가 영역 사이에 섞이지 않는다.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

// 들여쓰기 없이 쓴다. 격자 배열을 한 줄에 하나씩 펼치면 같은 격자가 3.4배(1.69MB → 5.74MB) 커져
// 회차마다 1.7GB를 쓰고, 쓰고 읽는 동안 백엔드 메모리도 그만큼 더 들었다.
function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function assertInsideRoot(root, filePath) {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(filePath)
  const rel = path.relative(resolvedRoot, resolvedPath)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Resolved KIM NWP path escapes root: ${filePath}`)
  }
}

export function buildKimNwpRunId({ model, tmfc }) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  return `${safeSegment(model)}_${tmfc}`
}

function validateForecastHour(hf, domain) {
  if (!kimDomain(domain).forecastHours.includes(Number(hf))) throw new Error('Invalid KIM NWP forecast hour')
}

export function validateKimNwpSelection({ tmfc, hf, levelId, domain = KIM_DEFAULT_DOMAIN }) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  validateForecastHour(hf, domain)
  if (!KIM_NWP_LEVELS.some((level) => level.id === levelId)) throw new Error('Invalid KIM NWP level')
}

export function resolveKimNwpRoot(root, domain = KIM_DEFAULT_DOMAIN) {
  return path.join(root, kimDomain(domain).storeDir)
}

export function resolveKimNwpRunDir({ root, model, tmfc, domain = KIM_DEFAULT_DOMAIN }) {
  return path.join(resolveKimNwpRoot(root, domain), 'runs', buildKimNwpRunId({ model, tmfc }))
}

export function resolveKimNwpGridPath({ root, model, tmfc, hf, levelId, domain = KIM_DEFAULT_DOMAIN }) {
  validateKimNwpSelection({ tmfc, hf, levelId, domain })
  const filePath = path.join(
    resolveKimNwpRunDir({ root, model, tmfc, domain }),
    'normalized',
    `hf${String(Number(hf)).padStart(3, '0')}`,
    levelId,
    'grid.json',
  )
  assertInsideRoot(resolveKimNwpRoot(root, domain), filePath)
  return filePath
}

function resolveKimNwpManifestPath(root, runId, domain) {
  if (!/^[a-zA-Z0-9_]+_\d{10}$/.test(String(runId || ''))) throw new Error('Invalid KIM NWP run id')
  const filePath = path.join(resolveKimNwpRoot(root, domain), 'runs', runId, 'manifest.json')
  assertInsideRoot(resolveKimNwpRoot(root, domain), filePath)
  return filePath
}

export function writeKimNwpGrid({ root, grid, domain = KIM_DEFAULT_DOMAIN }) {
  const filePath = resolveKimNwpGridPath({
    root,
    model: grid.model,
    tmfc: grid.tmfc,
    hf: grid.hf,
    levelId: grid.level.id,
    domain,
  })
  writeKimDocument(filePath, grid)
  return filePath
}

export function writeKimNwpLatest(root, latest, domain = KIM_DEFAULT_DOMAIN) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'latest.json'), latest)
}

export function writeKimNwpIndex(root, index, domain = KIM_DEFAULT_DOMAIN) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'index.json'), index)
}

export function writeKimNwpManifest(root, manifest, domain = KIM_DEFAULT_DOMAIN) {
  const runId = manifest.runId || buildKimNwpRunId({ model: manifest.model, tmfc: manifest.tmfc })
  writeJsonAtomic(resolveKimNwpManifestPath(root, runId, domain), { ...manifest, runId })
}

export function readKimNwpGrid({ root, model, tmfc, hf, levelId, domain = KIM_DEFAULT_DOMAIN }) {
  return readKimDocument(resolveKimNwpGridPath({ root, model, tmfc, hf, levelId, domain }))
}

// 지정한 변수의 값 배열만 읽는다(readKimDocumentArrays). 다른 변수는 values가 null이고, 읽은 값은 TypedArray일 수 있다.
export function readKimNwpGridVariables({ root, model, tmfc, hf, levelId, names, domain = KIM_DEFAULT_DOMAIN }) {
  return readKimDocumentArrays(resolveKimNwpGridPath({ root, model, tmfc, hf, levelId, domain }), names.map(name => `/variables/${name}/values`))
}

export function readKimNwpGridSafe({ root, model, tmfc, hf, levelId, domain = KIM_DEFAULT_DOMAIN }) {
  try {
    return readKimNwpGrid({ root, model, tmfc, hf, levelId, domain })
  } catch {
    return null
  }
}

export function readKimNwpIndex(root, domain = KIM_DEFAULT_DOMAIN) {
  const filePath = path.join(resolveKimNwpRoot(root, domain), 'index.json')
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function readKimNwpLatest(root, domain = KIM_DEFAULT_DOMAIN) {
  const filePath = path.join(resolveKimNwpRoot(root, domain), 'latest.json')
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function readKimNwpManifest(root, runId, domain = KIM_DEFAULT_DOMAIN) {
  const filePath = resolveKimNwpManifestPath(root, runId, domain)
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function listKimNwpRuns(root, domain = KIM_DEFAULT_DOMAIN) {
  const runsDir = path.join(resolveKimNwpRoot(root, domain), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
}

// onlyComplete: 파생 결과 게시 직후처럼 기본 수집이 다른 회차를 받고 있을 수 있는 때 쓴다. 받는 중인 회차는
// 끝날 때까지 manifest가 없으므로, 완성된 회차만 지울 수 있게 해 수집 중 폴더를 건드리지 않는다.
// 영역마다 따로 센다(영역별 저장 폴더).
export function cleanupKimNwpRuns({ root, maxRuns, latestRunId, onlyComplete = false, reason = 'base_published', domain = KIM_DEFAULT_DOMAIN }) {
  const limit = Number(maxRuns)
  if (!Number.isFinite(limit) || limit <= 0) return
  const runsDir = path.join(resolveKimNwpRoot(root, domain), 'runs')
  const completeRuns = listKimNwpRuns(root, domain).filter((runId) => {
    const manifest = readKimNwpManifest(root, runId, domain)
    return manifest?.usable === true && manifest.complete !== false
  })
  const completeSet = new Set(completeRuns)
  const keep = new Set(completeRuns.slice(0, limit))
  if (latestRunId) keep.add(latestRunId)
  for (const derivedLatest of [readKimGktgLatest(root, domain), readKimTropopauseLatest(root, domain)]) if (derivedLatest?.runId) keep.add(derivedLatest.runId)
  // ACI는 기본 회차와 같은 회차일 때만 보존한다. 지도는 기본 회차와 다른 ACI를 표시하지 않으므로(aci_base_run_mismatch),
  // 새 회차의 ACI가 실패해 latest가 옛 회차에 남아도 그 회차(약 5 GB)를 붙잡지 않는다. 기본 latest가 없으면 보존한다.
  const aciLatestFile = path.join(resolveKimNwpRoot(root, domain), 'derived', 'aci', 'latest.json')
  if (fs.existsSync(aciLatestFile)) {
    const aci = readJson(aciLatestFile)
    const baseRunId = readKimNwpLatest(root, domain)?.latestRunId
    if (aci?.runId && (!baseRunId || aci.runId === baseRunId)) keep.add(aci.runId)
  }
  // Partial calculations and institution-pinned runs must survive base retention.
  // ACI는 확대 수집기 안에서 시각별로 계산·재시도하므로 진행 중(6시간 이내)인 회차만 지킨다.
  for (const runId of listKimNwpRuns(root, domain)) {
    const dir = path.join(runsDir, runId)
    for (const product of ['gktg', 'tropopause', 'aci']) {
      const attemptFile = path.join(dir, 'derived', product, 'last-attempt.json')
      const attempt = fs.existsSync(attemptFile) ? readJson(attemptFile) : null
      if (product === 'aci') {
        if (attempt?.outcome === 'running' && Date.now() - Date.parse(attempt.started_at) < 6 * 3600000) keep.add(runId)
        continue
      }
      if (attempt?.outcome === 'running' || (attempt?.outcome === 'partial' && Date.now() - Date.parse(attempt.completed_at) < 24 * 3600000)) keep.add(runId)
    }
    if (fs.existsSync(path.join(dir, 'pins.json'))) keep.add(runId)
  }
  const removed = []
  for (const runId of listKimNwpRuns(root, domain)) {
    if (keep.has(runId) || (onlyComplete && !completeSet.has(runId))) continue
    fs.rmSync(path.join(runsDir, runId), { recursive: true, force: true })
    removed.push(runId)
  }
  if (removed.length) for (const runId of keep) appendKimRunEvent(path.join(runsDir, runId), { type: 'runs_cleaned', reason, removed, kept: [...keep] })
  return removed
}

// 파일 크기·수정 시각·inode만으로 만든 지문. 내용을 읽지 않아 수백 개 격자도 수 ms에 끝난다.
// 저장은 모두 임시 파일 + rename이라 내용이 바뀌면 inode·수정 시각이 함께 바뀐다. 파일이 없으면 null.
function statFingerprint(files) {
  const parts = []
  for (const document of files) {
    const file = kimDocumentStoragePath(document)
    if (!file) return null
    let stat
    try { stat = fs.statSync(file) } catch { return null }
    parts.push(`${file}:${stat.ino}:${stat.size}:${stat.mtimeMs}`)
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 20)
}

// 파생 계산(GKTG·권계면)의 입력인 기압면 기본 격자 전체의 지문. 지난 게시와 같으면 다시 계산·검증하지 않는다.
export function fingerprintKimNwpBase({ root, tmfc, hours, domain = KIM_DEFAULT_DOMAIN }) {
  const levels = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
  return statFingerprint(hours.flatMap(hf => levels.map(level => resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain }))))
}

function validateGktgRevision(revision) {
  if (!/^[a-f0-9]{20,64}$/.test(String(revision || ''))) throw new Error('Invalid GKTG revision')
}

export function resolveKimGktgFieldPath({ root, tmfc, hf, levelId, revision, domain = KIM_DEFAULT_DOMAIN }) {
  validateGktgRevision(revision)
  validateKimNwpSelection({ tmfc, hf, levelId, domain })
  if (!levelId.endsWith('hPa')) throw new Error('GKTG requires a pressure level')
  return path.join(path.dirname(resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId, domain })), 'gktg', `${revision}.json`)
}

export function readKimGktgLatest(root, domain = KIM_DEFAULT_DOMAIN) {
  const file = path.join(resolveKimNwpRoot(root, domain), 'derived', 'gktg', 'latest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function readKimGktgManifest(root, tmfc, revision, domain = KIM_DEFAULT_DOMAIN) {
  validateGktgRevision(revision)
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'gktg', revision, 'manifest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function writeKimGktgAttempt(root, tmfc, attempt, domain = KIM_DEFAULT_DOMAIN) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'derived', 'gktg', 'last-attempt.json'), attempt)
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'gktg', 'last-attempt.json'), attempt)
}

function gktgContentHash(field) {
  return createHash('sha256').update(JSON.stringify([field.time, field.level.id, field.grid, field.gktg, field.geopotentialHeight, field.geopotentialHeightEncoding, field.inputRevision, field.engineRevision || null])).digest('hex')
}

export function writeKimGktgField(root, field, domain = KIM_DEFAULT_DOMAIN) {
  field = { ...field, content_hash: gktgContentHash(field) }
  const file = resolveKimGktgFieldPath({ root, tmfc: field.time.tmfc, hf: field.time.hf, levelId: field.level.id, revision: field.revision, domain })
  if (kimDocumentExists(file)) {
    let existing
    let validExisting = false
    try {
      existing = readKimDocument(file)
      validExisting = existing.content_hash === gktgContentHash(existing)
    } catch {}
    if (validExisting) {
      if (!isDeepStrictEqual(existing, JSON.parse(JSON.stringify(field)))) throw new Error('GKTG immutable field collision')
      return file
    }
    // Quarantine damaged bytes; a valid immutable result is never overwritten.
    quarantineKimDocument(file, `${Date.now()}-${randomUUID()}`)
  }
  writeKimDocument(file, field)
  return file
}

export function readKimGktgField({ root, tmfc, hf, levelId, revision, domain = KIM_DEFAULT_DOMAIN }) {
  const latest = readKimGktgLatest(root, domain)
  const selectedRevision = revision || (latest?.tmfc === tmfc ? latest.entries?.find(entry => entry.hf === Number(hf) && entry.levelId === levelId)?.revision : null)
  if (!selectedRevision) throw new Error('GKTG revision unavailable for requested run')
  const field = readKimDocument(resolveKimGktgFieldPath({ root, tmfc, hf, levelId, revision: selectedRevision, domain }))
  if (field.time?.tmfc !== tmfc || field.time?.hf !== Number(hf) || field.level?.id !== levelId || field.revision !== selectedRevision
    || field.gktg?.length !== field.grid.nx * field.grid.ny || field.content_hash !== gktgContentHash(field)) throw new Error('Corrupt GKTG immutable field')
  return field
}

// readFields=false: 같은 실행에서 방금 계산·검증해 쓴 결과를 게시할 때(확대 회차). 파일을 다시 열지 않고 모두 있는지만
// 지문으로 확인한다(33시각 × 21층을 다시 풀면 운영 서버에서 2분 넘게 걸렸다, 2026-10-09).
export function publishKimGktgRun(root, manifest, domain = KIM_DEFAULT_DOMAIN, { readFields = true } = {}) {
  validateGktgRevision(manifest.revision)
  const levels = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
  if (!manifest.expectedHours?.length || !manifest.expectedHours.every(hf => levels.every(level =>
    manifest.entries?.some(entry => entry.hf === hf && entry.levelId === level.id)))) {
    throw new Error('Incomplete GKTG run cannot be published')
  }
  if (readFields) {
    for (const entry of manifest.entries) {
      const field = readKimGktgField({ root, tmfc: manifest.tmfc, hf: entry.hf, levelId: entry.levelId, revision: entry.revision, domain })
      if (field.inputRevision !== entry.inputRevision || field.gktg.length !== field.grid.nx * field.grid.ny) throw new Error('Invalid GKTG published field')
    }
  }
  const outputFingerprint = fingerprintKimGktgOutputs(root, manifest, domain)
  if (!readFields && !outputFingerprint) throw new Error('GKTG published field missing')
  const payload = { ...manifest, type: 'kim_gktg_manifest', complete: true, usable: true, runId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: manifest.tmfc }),
    outputFingerprint }
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc: manifest.tmfc, domain }), 'derived', 'gktg', manifest.revision, 'manifest.json'), payload)
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'derived', 'gktg', 'latest.json'), payload)
  return payload
}

// 게시한 결과 파일의 지문. 손상·삭제되면 달라져 다음 실행이 건너뛰지 않고 다시 확인·복구한다.
export function fingerprintKimGktgOutputs(root, { tmfc, entries }, domain = KIM_DEFAULT_DOMAIN) {
  return statFingerprint(entries.map(entry => resolveKimGktgFieldPath({ root, tmfc, hf: entry.hf, levelId: entry.levelId, revision: entry.revision, domain })))
}

export function readKimGktgIndex(root, domain = KIM_DEFAULT_DOMAIN) {
  const manifest = readKimGktgLatest(root, domain)
  if (!manifest?.complete) return null
  const index = buildKimNwpIndex({ tmfc: manifest.tmfc, entries: manifest.entries })
  return { ...index, type: 'kim_nwp_gktg_index', product: 'GKTG', revision: manifest.revision, algorithm: manifest.algorithm }
}

// 권계면·제트(TROP_JET): 시각별 2차원 불변 결과. 기압층이 없으므로 run/derived/tropopause/hfNNN/<revision>.json에 둔다.
export const KIM_TROPOPAUSE_GRIDS = ['trop', 'tropT', 'tropAboveTop', 'vmax', 'pmax']

export function resolveKimTropopauseFieldPath({ root, tmfc, hf, revision, domain = KIM_DEFAULT_DOMAIN }) {
  validateGktgRevision(revision)
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  validateForecastHour(hf, domain)
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'tropopause', `hf${String(Number(hf)).padStart(3, '0')}`, `${revision}.json`)
  assertInsideRoot(resolveKimNwpRoot(root, domain), file)
  return file
}

export function readKimTropopauseLatest(root, domain = KIM_DEFAULT_DOMAIN) {
  const file = path.join(resolveKimNwpRoot(root, domain), 'derived', 'tropopause', 'latest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function writeKimTropopauseAttempt(root, tmfc, attempt, domain = KIM_DEFAULT_DOMAIN) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'derived', 'tropopause', 'last-attempt.json'), attempt)
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'derived', 'tropopause', 'last-attempt.json'), attempt)
}

function tropopauseContentHash(field) {
  return createHash('sha256').update(JSON.stringify([field.time, field.grid, ...KIM_TROPOPAUSE_GRIDS.map(name => field[name]), field.jets, field.inputRevision, field.engineRevision || null])).digest('hex')
}

function validTropopauseShape(field) {
  const size = field?.grid?.nx * field?.grid?.ny
  return Number.isInteger(size) && size > 0 && KIM_TROPOPAUSE_GRIDS.every(name => field[name]?.length === size) && Array.isArray(field.jets)
}

export function writeKimTropopauseField(root, field, domain = KIM_DEFAULT_DOMAIN) {
  if (!validTropopauseShape(field)) throw new Error('Invalid tropopause field')
  field = { ...field, content_hash: tropopauseContentHash(field) }
  const file = resolveKimTropopauseFieldPath({ root, tmfc: field.time.tmfc, hf: field.time.hf, revision: field.revision, domain })
  if (kimDocumentExists(file)) {
    let existing
    let validExisting = false
    try {
      existing = readKimDocument(file)
      validExisting = existing.content_hash === tropopauseContentHash(existing)
    } catch {}
    if (validExisting) {
      if (!isDeepStrictEqual(existing, JSON.parse(JSON.stringify(field)))) throw new Error('Tropopause immutable field collision')
      return file
    }
    quarantineKimDocument(file, `${Date.now()}-${randomUUID()}`)
  }
  writeKimDocument(file, field)
  return file
}

// 단면용 상층 격자(hgt·T·u·v): 같은 revision 옆 <revision>.upper.json. 지도 API로는 내보내지 않는다.
function resolveKimTropopauseUpperPath({ root, tmfc, hf, revision, domain }) {
  return resolveKimTropopauseFieldPath({ root, tmfc, hf, revision, domain }).replace(/\.json$/, '.upper.json')
}

export function writeKimTropopauseUpper(root, upper, domain = KIM_DEFAULT_DOMAIN) {
  const size = upper.grid.nx * upper.grid.ny
  if (!upper.levels?.length || !upper.levels.every(l => ['hgt', 'T', 'u', 'v'].every(k => l[k]?.length === size))) throw new Error('Invalid tropopause upper levels')
  const file = resolveKimTropopauseUpperPath({ root, tmfc: upper.tmfc, hf: upper.hf, revision: upper.revision, domain })
  if (!kimDocumentExists(file)) writeKimDocument(file, { type: 'kim_nwp_tropopause_upper', ...upper })
  return file
}

// 게시한 지도 결과와 단면용 상층 파일의 지문(GKTG와 같은 용도).
export function fingerprintKimTropopauseOutputs(root, { tmfc, entries }, domain = KIM_DEFAULT_DOMAIN) {
  return statFingerprint(entries.flatMap(entry => [resolveKimTropopauseFieldPath({ root, tmfc, hf: entry.hf, revision: entry.revision, domain }),
    resolveKimTropopauseUpperPath({ root, tmfc, hf: entry.hf, revision: entry.revision, domain })]))
}

export function readKimTropopauseUpper({ root, tmfc, hf, revision, domain = KIM_DEFAULT_DOMAIN }) {
  const upper = readKimDocument(resolveKimTropopauseUpperPath({ root, tmfc, hf, revision, domain }))
  if (upper.tmfc !== tmfc || upper.hf !== Number(hf) || upper.revision !== revision) throw new Error('Corrupt tropopause upper levels')
  return upper
}

export function readKimTropopauseField({ root, tmfc, hf, revision, domain = KIM_DEFAULT_DOMAIN }) {
  const latest = readKimTropopauseLatest(root, domain)
  const selectedRevision = revision || (latest?.tmfc === tmfc ? latest.entries?.find(entry => entry.hf === Number(hf))?.revision : null)
  if (!selectedRevision) throw new Error('Tropopause revision unavailable for requested run')
  const field = readKimDocument(resolveKimTropopauseFieldPath({ root, tmfc, hf, revision: selectedRevision, domain }))
  if (field.time?.tmfc !== tmfc || field.time?.hf !== Number(hf) || field.revision !== selectedRevision
    || !validTropopauseShape(field) || field.content_hash !== tropopauseContentHash(field)) throw new Error('Corrupt tropopause immutable field')
  return field
}

// readFields=false: publishKimGktgRun과 같다(같은 실행에서 방금 쓴 결과는 다시 열지 않고 존재만 확인).
export function publishKimTropopauseRun(root, manifest, domain = KIM_DEFAULT_DOMAIN, { readFields = true } = {}) {
  validateGktgRevision(manifest.revision)
  if (!manifest.expectedHours?.length || !manifest.expectedHours.every(hf => manifest.entries?.some(entry => entry.hf === hf))) {
    throw new Error('Incomplete tropopause run cannot be published')
  }
  if (readFields) {
    for (const entry of manifest.entries) {
      const field = readKimTropopauseField({ root, tmfc: manifest.tmfc, hf: entry.hf, revision: entry.revision, domain })
      if (field.inputRevision !== entry.inputRevision) throw new Error('Invalid tropopause published field')
    }
  }
  const outputFingerprint = fingerprintKimTropopauseOutputs(root, manifest, domain)
  if (!readFields && !outputFingerprint) throw new Error('Tropopause published field missing')
  const payload = { ...manifest, type: 'kim_tropopause_manifest', complete: true, usable: true, runId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: manifest.tmfc }),
    outputFingerprint }
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc: manifest.tmfc, domain }), 'derived', 'tropopause', manifest.revision, 'manifest.json'), payload)
  writeJsonAtomic(path.join(resolveKimNwpRoot(root, domain), 'derived', 'tropopause', 'latest.json'), payload)
  return payload
}

// 저장된 권계면·제트 결과 목록(회차·시각·revision). 게시 여부와 무관하게 남아 있는 불변 결과를 고를 때 쓴다.
export function listKimTropopauseFields(root, domain = KIM_DEFAULT_DOMAIN) {
  const out = []
  for (const runId of listKimNwpRuns(root, domain)) {
    const tmfc = runId.match(/_(\d{10})$/)?.[1]
    const dir = path.join(resolveKimNwpRoot(root, domain), 'runs', runId, 'derived', 'tropopause')
    if (!tmfc || !fs.existsSync(dir)) continue
    for (const hour of fs.readdirSync(dir).filter(name => /^hf\d{3}$/.test(name))) {
      const hf = Number(hour.slice(2))
      const revisions = new Set(fs.readdirSync(path.join(dir, hour)).map(name => name.match(/^([a-f0-9]{20,64})\.(?:json|nc)$/)?.[1]).filter(Boolean))
      for (const revision of revisions) out.push({ tmfc, hf, validTime: addHoursIso(tmfc, hf), revision })
    }
  }
  return out.sort((a, b) => a.validTime.localeCompare(b.validTime) || a.revision.localeCompare(b.revision))
}

function addHoursIso(tmfc, hf) {
  return new Date(Date.UTC(+tmfc.slice(0, 4), +tmfc.slice(4, 6) - 1, +tmfc.slice(6, 8), +tmfc.slice(8, 10) + hf)).toISOString()
}

export function readKimTropopauseIndex(root, domain = KIM_DEFAULT_DOMAIN) {
  const manifest = readKimTropopauseLatest(root, domain)
  if (!manifest?.complete) return null
  const times = manifest.entries.map(entry => ({ hf: entry.hf, validTime: entry.validTime, revision: entry.revision })).sort((a, b) => a.hf - b.hf)
  return { type: 'kim_nwp_tropopause_index', product: 'TROP_JET', model: manifest.model, latestRun: manifest.tmfc,
    initial_time: addHoursIso(manifest.tmfc, 0), revision: manifest.revision, algorithm: manifest.algorithm, times }
}

export default {
  buildKimNwpRunId,
  cleanupKimNwpRuns,
  listKimNwpRuns,
  readKimNwpGrid,
  readKimNwpGridSafe,
  readKimNwpIndex,
  readKimNwpLatest,
  readKimNwpManifest,
  resolveKimNwpGridPath,
  validateKimNwpSelection,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
  writeKimNwpManifest,
}
