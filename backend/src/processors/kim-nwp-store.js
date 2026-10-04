import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'

import { KIM_NWP_FORECAST_HOURS, KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpIndex } from './kim-nwp-model.js'

const ROOT_DIR = 'kim_nwp'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
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

export function validateKimNwpSelection({ tmfc, hf, levelId }) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  if (!KIM_NWP_FORECAST_HOURS.includes(Number(hf))) throw new Error('Invalid KIM NWP forecast hour')
  if (!KIM_NWP_LEVELS.some((level) => level.id === levelId)) throw new Error('Invalid KIM NWP level')
}

export function resolveKimNwpRoot(root) {
  return path.join(root, ROOT_DIR)
}

export function resolveKimNwpRunDir({ root, model, tmfc }) {
  return path.join(resolveKimNwpRoot(root), 'runs', buildKimNwpRunId({ model, tmfc }))
}

export function resolveKimNwpGridPath({ root, model, tmfc, hf, levelId }) {
  validateKimNwpSelection({ tmfc, hf, levelId })
  const filePath = path.join(
    resolveKimNwpRunDir({ root, model, tmfc }),
    'normalized',
    `hf${String(Number(hf)).padStart(3, '0')}`,
    levelId,
    'grid.json',
  )
  assertInsideRoot(resolveKimNwpRoot(root), filePath)
  return filePath
}

function resolveKimNwpManifestPath(root, runId) {
  if (!/^[a-zA-Z0-9_]+_\d{10}$/.test(String(runId || ''))) throw new Error('Invalid KIM NWP run id')
  const filePath = path.join(resolveKimNwpRoot(root), 'runs', runId, 'manifest.json')
  assertInsideRoot(resolveKimNwpRoot(root), filePath)
  return filePath
}

export function writeKimNwpGrid({ root, grid }) {
  const filePath = resolveKimNwpGridPath({
    root,
    model: grid.model,
    tmfc: grid.tmfc,
    hf: grid.hf,
    levelId: grid.level.id,
  })
  writeJsonAtomic(filePath, grid)
  return filePath
}

export function writeKimNwpLatest(root, latest) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'latest.json'), latest)
}

export function writeKimNwpIndex(root, index) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'index.json'), index)
}

export function writeKimNwpManifest(root, manifest) {
  const runId = manifest.runId || buildKimNwpRunId({ model: manifest.model, tmfc: manifest.tmfc })
  writeJsonAtomic(resolveKimNwpManifestPath(root, runId), { ...manifest, runId })
}

export function readKimNwpGrid({ root, model, tmfc, hf, levelId }) {
  return readJson(resolveKimNwpGridPath({ root, model, tmfc, hf, levelId }))
}

export function readKimNwpGridSafe({ root, model, tmfc, hf, levelId }) {
  try {
    return readKimNwpGrid({ root, model, tmfc, hf, levelId })
  } catch {
    return null
  }
}

export function readKimNwpIndex(root) {
  const filePath = path.join(resolveKimNwpRoot(root), 'index.json')
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function readKimNwpLatest(root) {
  const filePath = path.join(resolveKimNwpRoot(root), 'latest.json')
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function readKimNwpManifest(root, runId) {
  const filePath = resolveKimNwpManifestPath(root, runId)
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function listKimNwpRuns(root) {
  const runsDir = path.join(resolveKimNwpRoot(root), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
}

export function cleanupKimNwpRuns({ root, maxRuns, latestRunId }) {
  const limit = Number(maxRuns)
  if (!Number.isFinite(limit) || limit <= 0) return
  const runsDir = path.join(resolveKimNwpRoot(root), 'runs')
  const completeRuns = listKimNwpRuns(root).filter((runId) => {
    const manifest = readKimNwpManifest(root, runId)
    return manifest?.usable === true && manifest.complete !== false
  })
  const keep = new Set(completeRuns.slice(0, limit))
  if (latestRunId) keep.add(latestRunId)
  for (const derivedLatest of [readKimGktgLatest(root), readKimTropopauseLatest(root)]) if (derivedLatest?.runId) keep.add(derivedLatest.runId)
  // Partial calculations and institution-pinned runs must survive base retention.
  for (const runId of listKimNwpRuns(root)) {
    const dir = path.join(runsDir, runId)
    for (const product of ['gktg', 'tropopause']) {
      const attemptFile = path.join(dir, 'derived', product, 'last-attempt.json')
      const attempt = fs.existsSync(attemptFile) ? readJson(attemptFile) : null
      if (attempt?.outcome === 'running' || (attempt?.outcome === 'partial' && Date.now() - Date.parse(attempt.completed_at) < 24 * 3600000)) keep.add(runId)
    }
    if (fs.existsSync(path.join(dir, 'pins.json'))) keep.add(runId)
  }
  for (const runId of listKimNwpRuns(root)) {
    if (keep.has(runId)) continue
    fs.rmSync(path.join(runsDir, runId), { recursive: true, force: true })
  }
}

function validateGktgRevision(revision) {
  if (!/^[a-f0-9]{20,64}$/.test(String(revision || ''))) throw new Error('Invalid GKTG revision')
}

export function resolveKimGktgFieldPath({ root, tmfc, hf, levelId, revision }) {
  validateGktgRevision(revision)
  validateKimNwpSelection({ tmfc, hf, levelId })
  if (!levelId.endsWith('hPa')) throw new Error('GKTG requires a pressure level')
  return path.join(path.dirname(resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId })), 'gktg', `${revision}.json`)
}

export function readKimGktgLatest(root) {
  const file = path.join(resolveKimNwpRoot(root), 'derived', 'gktg', 'latest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function readKimGktgManifest(root, tmfc, revision) {
  validateGktgRevision(revision)
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'derived', 'gktg', revision, 'manifest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function writeKimGktgAttempt(root, tmfc, attempt) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'derived', 'gktg', 'last-attempt.json'), attempt)
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'derived', 'gktg', 'last-attempt.json'), attempt)
}

function gktgContentHash(field) {
  return createHash('sha256').update(JSON.stringify([field.time, field.level.id, field.grid, field.gktg, field.geopotentialHeight, field.geopotentialHeightEncoding, field.inputRevision, field.engineRevision || null])).digest('hex')
}

export function writeKimGktgField(root, field) {
  field = { ...field, content_hash: gktgContentHash(field) }
  const file = resolveKimGktgFieldPath({ root, tmfc: field.time.tmfc, hf: field.time.hf, levelId: field.level.id, revision: field.revision })
  if (fs.existsSync(file)) {
    let existing
    let validExisting = false
    try {
      existing = readJson(file)
      validExisting = existing.content_hash === gktgContentHash(existing)
    } catch {}
    if (validExisting) {
      if (!isDeepStrictEqual(existing, field)) throw new Error('GKTG immutable field collision')
      return file
    }
    // Quarantine damaged bytes; a valid immutable result is never overwritten.
    fs.renameSync(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`)
  }
  writeJsonAtomic(file, field)
  return file
}

export function readKimGktgField({ root, tmfc, hf, levelId, revision }) {
  const latest = readKimGktgLatest(root)
  const selectedRevision = revision || (latest?.tmfc === tmfc ? latest.entries?.find(entry => entry.hf === Number(hf) && entry.levelId === levelId)?.revision : null)
  if (!selectedRevision) throw new Error('GKTG revision unavailable for requested run')
  const field = readJson(resolveKimGktgFieldPath({ root, tmfc, hf, levelId, revision: selectedRevision }))
  if (field.time?.tmfc !== tmfc || field.time?.hf !== Number(hf) || field.level?.id !== levelId || field.revision !== selectedRevision
    || field.gktg?.length !== field.grid.nx * field.grid.ny || field.content_hash !== gktgContentHash(field)) throw new Error('Corrupt GKTG immutable field')
  return field
}

export function publishKimGktgRun(root, manifest) {
  validateGktgRevision(manifest.revision)
  const levels = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
  if (!manifest.expectedHours?.length || !manifest.expectedHours.every(hf => levels.every(level =>
    manifest.entries?.some(entry => entry.hf === hf && entry.levelId === level.id)))) {
    throw new Error('Incomplete GKTG run cannot be published')
  }
  for (const entry of manifest.entries) {
    const field = readKimGktgField({ root, tmfc: manifest.tmfc, hf: entry.hf, levelId: entry.levelId, revision: entry.revision })
    if (field.inputRevision !== entry.inputRevision || field.gktg.length !== field.grid.nx * field.grid.ny) throw new Error('Invalid GKTG published field')
  }
  const payload = { ...manifest, type: 'kim_gktg_manifest', complete: true, usable: true, runId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: manifest.tmfc }) }
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc: manifest.tmfc }), 'derived', 'gktg', manifest.revision, 'manifest.json'), payload)
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'derived', 'gktg', 'latest.json'), payload)
  return payload
}

export function readKimGktgIndex(root) {
  const manifest = readKimGktgLatest(root)
  if (!manifest?.complete) return null
  const index = buildKimNwpIndex({ tmfc: manifest.tmfc, entries: manifest.entries })
  return { ...index, type: 'kim_nwp_gktg_index', product: 'GKTG', revision: manifest.revision, algorithm: manifest.algorithm }
}

// 권계면·제트(TROP_JET): 시각별 2차원 불변 결과. 기압층이 없으므로 run/derived/tropopause/hfNNN/<revision>.json에 둔다.
export const KIM_TROPOPAUSE_GRIDS = ['trop', 'tropT', 'tropAboveTop', 'vmax', 'pmax']

export function resolveKimTropopauseFieldPath({ root, tmfc, hf, revision }) {
  validateGktgRevision(revision)
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  if (!KIM_NWP_FORECAST_HOURS.includes(Number(hf))) throw new Error('Invalid KIM NWP forecast hour')
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'derived', 'tropopause', `hf${String(Number(hf)).padStart(3, '0')}`, `${revision}.json`)
  assertInsideRoot(resolveKimNwpRoot(root), file)
  return file
}

export function readKimTropopauseLatest(root) {
  const file = path.join(resolveKimNwpRoot(root), 'derived', 'tropopause', 'latest.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function writeKimTropopauseAttempt(root, tmfc, attempt) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'derived', 'tropopause', 'last-attempt.json'), attempt)
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'derived', 'tropopause', 'last-attempt.json'), attempt)
}

function tropopauseContentHash(field) {
  return createHash('sha256').update(JSON.stringify([field.time, field.grid, ...KIM_TROPOPAUSE_GRIDS.map(name => field[name]), field.jets, field.inputRevision, field.engineRevision || null])).digest('hex')
}

function validTropopauseShape(field) {
  const size = field?.grid?.nx * field?.grid?.ny
  return Number.isInteger(size) && size > 0 && KIM_TROPOPAUSE_GRIDS.every(name => field[name]?.length === size) && Array.isArray(field.jets)
}

export function writeKimTropopauseField(root, field) {
  if (!validTropopauseShape(field)) throw new Error('Invalid tropopause field')
  field = { ...field, content_hash: tropopauseContentHash(field) }
  const file = resolveKimTropopauseFieldPath({ root, tmfc: field.time.tmfc, hf: field.time.hf, revision: field.revision })
  if (fs.existsSync(file)) {
    let existing
    let validExisting = false
    try {
      existing = readJson(file)
      validExisting = existing.content_hash === tropopauseContentHash(existing)
    } catch {}
    if (validExisting) {
      if (!isDeepStrictEqual(existing, field)) throw new Error('Tropopause immutable field collision')
      return file
    }
    fs.renameSync(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`)
  }
  writeJsonAtomic(file, field)
  return file
}

// 단면용 상층 격자(hgt·T·u·v): 같은 revision 옆 <revision>.upper.json. 지도 API로는 내보내지 않는다.
function resolveKimTropopauseUpperPath({ root, tmfc, hf, revision }) {
  return resolveKimTropopauseFieldPath({ root, tmfc, hf, revision }).replace(/\.json$/, '.upper.json')
}

export function writeKimTropopauseUpper(root, upper) {
  const size = upper.grid.nx * upper.grid.ny
  if (!upper.levels?.length || !upper.levels.every(l => ['hgt', 'T', 'u', 'v'].every(k => l[k]?.length === size))) throw new Error('Invalid tropopause upper levels')
  const file = resolveKimTropopauseUpperPath({ root, ...upper })
  if (!fs.existsSync(file)) writeJsonAtomic(file, { type: 'kim_nwp_tropopause_upper', ...upper })
  return file
}

export function readKimTropopauseUpper({ root, tmfc, hf, revision }) {
  const upper = readJson(resolveKimTropopauseUpperPath({ root, tmfc, hf, revision }))
  if (upper.tmfc !== tmfc || upper.hf !== Number(hf) || upper.revision !== revision) throw new Error('Corrupt tropopause upper levels')
  return upper
}

export function readKimTropopauseField({ root, tmfc, hf, revision }) {
  const latest = readKimTropopauseLatest(root)
  const selectedRevision = revision || (latest?.tmfc === tmfc ? latest.entries?.find(entry => entry.hf === Number(hf))?.revision : null)
  if (!selectedRevision) throw new Error('Tropopause revision unavailable for requested run')
  const field = readJson(resolveKimTropopauseFieldPath({ root, tmfc, hf, revision: selectedRevision }))
  if (field.time?.tmfc !== tmfc || field.time?.hf !== Number(hf) || field.revision !== selectedRevision
    || !validTropopauseShape(field) || field.content_hash !== tropopauseContentHash(field)) throw new Error('Corrupt tropopause immutable field')
  return field
}

export function publishKimTropopauseRun(root, manifest) {
  validateGktgRevision(manifest.revision)
  if (!manifest.expectedHours?.length || !manifest.expectedHours.every(hf => manifest.entries?.some(entry => entry.hf === hf))) {
    throw new Error('Incomplete tropopause run cannot be published')
  }
  for (const entry of manifest.entries) {
    const field = readKimTropopauseField({ root, tmfc: manifest.tmfc, hf: entry.hf, revision: entry.revision })
    if (field.inputRevision !== entry.inputRevision) throw new Error('Invalid tropopause published field')
  }
  const payload = { ...manifest, type: 'kim_tropopause_manifest', complete: true, usable: true, runId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: manifest.tmfc }) }
  writeJsonAtomic(path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc: manifest.tmfc }), 'derived', 'tropopause', manifest.revision, 'manifest.json'), payload)
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'derived', 'tropopause', 'latest.json'), payload)
  return payload
}

// 저장된 권계면·제트 결과 목록(회차·시각·revision). 게시 여부와 무관하게 남아 있는 불변 결과를 고를 때 쓴다.
export function listKimTropopauseFields(root) {
  const out = []
  for (const runId of listKimNwpRuns(root)) {
    const tmfc = runId.match(/_(\d{10})$/)?.[1]
    const dir = path.join(resolveKimNwpRoot(root), 'runs', runId, 'derived', 'tropopause')
    if (!tmfc || !fs.existsSync(dir)) continue
    for (const hour of fs.readdirSync(dir).filter(name => /^hf\d{3}$/.test(name))) {
      const hf = Number(hour.slice(2))
      for (const file of fs.readdirSync(path.join(dir, hour)).filter(name => /^[a-f0-9]{20,64}\.json$/.test(name))) {
        out.push({ tmfc, hf, validTime: addHoursIso(tmfc, hf), revision: file.slice(0, -5) })
      }
    }
  }
  return out.sort((a, b) => a.validTime.localeCompare(b.validTime) || a.revision.localeCompare(b.revision))
}

function addHoursIso(tmfc, hf) {
  return new Date(Date.UTC(+tmfc.slice(0, 4), +tmfc.slice(4, 6) - 1, +tmfc.slice(6, 8), +tmfc.slice(8, 10) + hf)).toISOString()
}

export function readKimTropopauseIndex(root) {
  const manifest = readKimTropopauseLatest(root)
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
