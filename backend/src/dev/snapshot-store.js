// 시연용 데이터 스냅샷 — 실황(latest.json)들을 이름 붙여 저장/복원. 관리자 콘솔(/api/admin/snapshot/*)에서 사용.
// 배포 서버에서도 쓸 수 있어야 해서 인증(requireRole admin)은 라우터 쪽에서 걸고, 여기는 순수 파일 로직만.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import config from '../config.js'
import { initFromFiles, loadLatest } from '../store.js'
import { kimDocumentExists } from '../processors/kim-doc-store.js'
import { EXPANDED_START_FREE_BYTES } from '../processors/kim-expanded-disk.js'

const SNAPSHOT_EXCLUDE = new Set(['snapshots', 'stats']) // 캡처 대상에서 제외(메타/재귀 방지)
const NAME_RE = /^[a-zA-Z0-9_-]+$/ // 경로 이탈(../) 방지 — 영문/숫자/-/_ 만 허용
// kim_nwp·ktg는 실제 단면(수직 프로파일) 격자 데이터가 latest.json이 아니라 runs/<runId>/ 밑에 있고,
// 자동 정리(maxRuns=2)로 6시간 주기로 지워진다 — latest.json만 복사하면 단면 브리핑이 깨지므로 폴더째 복사.
// radar·satellite도 "latest" 포인터가 latest.json이 아니라 hsr/hsr_meta.json 등 제품별 meta·sat_meta.json(+rainviewer_meta.json)
// 이고, 실제 이미지(PNG/WebP) 여러 장이 그 옆에 같이 있어서 마찬가지로 폴더째 복사해야 함(용량은 각각 수백KB~수MB로 작음).
// 공항 모델 비교는 latest 포인터가 immutable payload를 참조하고, METAR·AMOS는 과거 3시간 비교에 최근 파일도 필요하다.
// kim_surface_chart도 latest.json이 runs/<runId>/ 밑의 시각별 그림·GeoJSON을 가리킨다.
const FULL_DIR_TYPES = new Set(['kim_nwp', 'kim_surface_chart', 'ktg', 'radar', 'satellite', 'airport_model_comparison', 'metar', 'amos'])
// 레이더·위성 폴더에는 오래된 그림이 남아 있다(2026-10 운영 서버에 8월 그림 수백 MB). 기준시각 12시간 전부터의 그림과
// 메타 파일만 담는다. 화면이 쓰는 3시간 이력보다 넉넉하다.
const FRAME_TYPES = new Set(['radar', 'satellite'])
const FRAME_HISTORY_MS = 12 * 3600_000
// 점검이 보는 그림 목록. 지도 레이더는 HSR(합성 강수강도)을 기본으로 쓴다.
const FRAME_METADATA = Object.freeze({ radar: 'hsr/hsr_meta.json', satellite: 'sat_meta.json' })
// KIM 확대 영역은 회차 하나가 6 GB 가까이 되어 기준시각 앞뒤 예보시각만 담는다(시각당 약 155 MB, 기본 8시각 약 1.3 GB).
// 이 시각들만 남도록 목록 파일(latest·index·manifest)을 고쳐 써서 시간 막대에 담은 시각만 나온다. 계산용 입력(raw)과
// 수집 기록(events·monitor)은 화면에 쓰지 않아 뺀다. 창 안에 시각이 하나도 없으면 확대 영역을 담지 않고, 지도는 한반도
// 회차로 대신 보인다(server.js resolveKimDomain).
export const KIM_EXPANDED_TYPE = 'kim_nwp_ea'
export const DEMO_KIM_WINDOW = Object.freeze({ beforeHours: 1, afterHours: 6 })
const HOUR_SEGMENT = /^hf(\d{3})(?:\.|$)/
const EXPANDED_SKIP = new Set(['raw', 'events.jsonl', 'monitor.jsonl'])
// latest.json이 없어서 일반 스캔(listCapturableTypes)에 안 걸리지만 캡처해야 하는 디렉터리.
const EXTRA_CAPTURE_TYPES = new Set(['radar', 'satellite', 'airport_model_comparison'])
// 이 자료가 빠지면 복원 뒤 해당 종류만 실황으로 남아 서로 다른 시각의 데이터가 섞인다.
// 태풍은 과거 스냅샷 도입 뒤 추가된 자료라 의도적으로 제외해 최신 자료를 유지한다.
export const DEMO_REQUIRED_TYPES = Object.freeze([
  'adsb',
  'airmet',
  'airport_info',
  'amos',
  'asos_ceiling',
  'environment',
  'flight_category_overlay',
  'ground_forecast',
  'kim_nwp',
  'kim_surface_wind',
  'kma_special_warning',
  'lightning',
  'metar',
  'metar_overseas',
  'notam',
  'overseas_forecast',
  'radar',
  'satellite',
  'sigmet',
  'sigmet_overseas',
  'sigwx_low',
  'taf',
  'taf_overseas',
  'takeoff_fcst',
  'terminal_flights',
  'warning',
])
// 스냅샷 로드 직전 실황을 자동 백업해두는 예약 이름 — 목록에 노출 안 함, "되돌리기" 전용.
export const RESERVED_LIVE_BACKUP = '_live_backup'
const ADSB_REFERENCE_TOLERANCE_MS = 30 * 60 * 1000
const GENERATIONS_DIR = '.generations'

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function isValidSnapshotName(name) {
  return typeof name === 'string' && NAME_RE.test(name)
}

function snapshotsRoot(basePath) {
  return path.resolve(basePath, 'snapshots')
}

function isDescendantPath(root, target) {
  return target.startsWith(`${root}${path.sep}`)
}

// Keep every public snapshot-name consumer behind the same lexical boundary.
// Do not decode or normalize user input: a name is either the established
// [a-zA-Z0-9_-]+ form or it is rejected before it can select a filesystem path.
function snapshotPath(basePath, name) {
  if (!isValidSnapshotName(name)) return null
  const root = snapshotsRoot(basePath)
  const target = path.resolve(root, name)
  return isDescendantPath(root, target) ? target : null
}

// Snapshot pointers are symlinks in the new generation format.  Resolve them
// before reading so a valid-looking name cannot point outside snapshots.
function existingSnapshotPath(basePath, name) {
  const target = snapshotPath(basePath, name)
  if (!target) return null
  try {
    const root = fs.realpathSync(snapshotsRoot(basePath))
    const resolved = fs.realpathSync(target)
    return isDescendantPath(root, resolved) ? resolved : null
  } catch {
    return null
  }
}

// data/ 아래 latest.json이 있는 디렉터리 + EXTRA_CAPTURE_TYPES(다른 이름의 meta 파일을 쓰는 곳)가 캡처 대상.
function listCapturableTypes(basePath) {
  const withLatestJson = fs.readdirSync(basePath, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SNAPSHOT_EXCLUDE.has(e.name))
    .map((e) => e.name)
    .filter((type) => fs.existsSync(path.join(basePath, type, 'latest.json')))
  const extra = [...EXTRA_CAPTURE_TYPES].filter((type) => fs.existsSync(path.join(basePath, type)))
  return [...new Set([...withLatestJson, ...extra])]
}

function listFiles(root, rel = '') {
  const files = []
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? path.join(rel, entry.name) : entry.name
    if (entry.isDirectory()) files.push(...listFiles(root, child))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

function hourOfPath(rel) {
  for (const segment of rel.split(path.sep)) {
    const match = HOUR_SEGMENT.exec(segment)
    if (match) return Number(match[1])
  }
  return null
}

// 확대 영역 최신 회차에서 기준시각 앞뒤(window)에 드는 예보시각.
export function selectExpandedHours(latest, referenceMs, window = DEMO_KIM_WINDOW) {
  const tmfc = String(latest?.latestRun || '')
  if (!/^\d{10}$/.test(tmfc) || !Number.isFinite(referenceMs)) return []
  const initMs = Date.UTC(+tmfc.slice(0, 4), +tmfc.slice(4, 6) - 1, +tmfc.slice(6, 8), +tmfc.slice(8, 10))
  return (latest.hours || []).filter((hf) => {
    const validMs = initMs + hf * 3600_000
    return validMs >= referenceMs - window.beforeHours * 3600_000 && validMs <= referenceMs + window.afterHours * 3600_000
  })
}

// 목록 파일에서 담지 않은 예보시각을 뺀다(hf가 있는 항목, hours·expectedHours·availableHours, index의 시각별 availability).
export function trimToHours(value, keep) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === 'object' && Number.isInteger(item.hf)) || keep.has(item.hf))
      .map((item) => trimToHours(item, keep))
  }
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (['hours', 'expectedHours', 'availableHours'].includes(key) && Array.isArray(item)) out[key] = item.filter((hf) => keep.has(hf))
    else if (key === 'availability' && item && typeof item === 'object') {
      out[key] = Object.fromEntries(Object.entries(item).map(([level, byHour]) => [level,
        Object.fromEntries(Object.entries(byHour || {}).filter(([hf]) => !/^\d+$/.test(hf) || keep.has(Number(hf))))]))
    } else out[key] = trimToHours(item, keep)
  }
  // 기본 격자 manifest의 격자 수도 담은 시각 수에 맞춘다.
  if (value.type === 'kim_nwp_manifest' && Array.isArray(value.hours) && value.hours.length && Number.isFinite(value.expectedGridCount)) {
    const perHour = value.expectedGridCount / value.hours.length
    out.expectedGridCount = Math.round(perHour * out.hours.length)
    out.gridCount = Math.min(value.gridCount ?? out.expectedGridCount, out.expectedGridCount)
  }
  return out
}

function planExpanded(basePath, referenceMs, window) {
  const dir = path.join(basePath, KIM_EXPANDED_TYPE)
  const latest = readJson(path.join(dir, 'latest.json'))
  const hours = selectExpandedHours(latest, referenceMs, window)
  if (!hours.length || !latest?.latestRunId) return { files: [], expanded: null }
  const keep = new Set(hours)
  const runRel = path.join('runs', latest.latestRunId)
  const files = []
  for (const rel of ['latest.json', 'index.json']) files.push({ rel, trim: true })
  if (fs.existsSync(path.join(dir, 'derived'))) {
    for (const rel of listFiles(dir, 'derived')) files.push({ rel, trim: path.basename(rel) === 'latest.json' })
  }
  for (const rel of listFiles(dir, runRel)) {
    const inside = path.relative(runRel, rel)
    if (EXPANDED_SKIP.has(inside.split(path.sep)[0])) continue
    const hf = hourOfPath(inside)
    if (hf !== null && !keep.has(hf)) continue
    files.push({ rel, trim: path.basename(rel) === 'manifest.json' })
  }
  return {
    files: files.map((file) => ({ ...file, src: path.join(dir, file.rel), rel: path.join(KIM_EXPANDED_TYPE, file.rel), keep })),
    expanded: { tmfc: latest.latestRun, hours },
  }
}

// 담을 파일 목록. 크기를 먼저 더해 디스크를 확인한 뒤에 복사한다.
function planType(basePath, type, referenceMs, window) {
  if (type === KIM_EXPANDED_TYPE) return planExpanded(basePath, referenceMs, window)
  const dir = path.join(basePath, type)
  let rels
  if (FRAME_TYPES.has(type)) {
    rels = listFiles(dir).filter((rel) => rel.endsWith('.json')
      || !Number.isFinite(referenceMs) || fs.statSync(path.join(dir, rel)).mtimeMs >= referenceMs - FRAME_HISTORY_MS)
  } else if (FULL_DIR_TYPES.has(type)) rels = listFiles(dir)
  else rels = ['latest.json']
  return { files: rels.map((rel) => ({ src: path.join(dir, rel), rel: path.join(type, rel) })) }
}

function copyPlannedFile(file, stageBase) {
  const dest = path.join(stageBase, file.rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (file.trim) {
    const value = readJson(file.src)
    if (value) { fs.writeFileSync(dest, JSON.stringify(trimToHours(value, file.keep))); return }
  }
  fs.copyFileSync(file.src, dest)
}

function freeBytes(target) {
  try {
    const stat = fs.statfsSync(target)
    return stat.bavail * stat.bsize
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function readSnapshotMeta(basePath, name) {
  const snapshotRoot = existingSnapshotPath(basePath, name)
  if (!snapshotRoot) return { savedAt: null, referenceTime: null, generation: null, revision: null }
  try {
    return JSON.parse(fs.readFileSync(path.join(snapshotRoot, 'meta.json'), 'utf8'))
  } catch {
    return { savedAt: null, referenceTime: null, generation: null, revision: null } // 메타 없는 구버전 스냅샷
  }
}

// 저장 순서(savedAt)대로 정렬해 반환 — 화면에서 1./2./3. 번호를 매길 때 그대로 순번이 된다.
export function listSnapshots(basePath) {
  const dir = snapshotsRoot(basePath)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    // 새 스냅샷은 불변 generation을 가리키는 symlink다. 기존 디렉터리 형식도
    // 그대로 읽어 외부 repair 도구와 기존 이름 UX를 호환한다.
    .filter((e) => (e.isDirectory() || e.isSymbolicLink())
      && e.name !== RESERVED_LIVE_BACKUP && existingSnapshotPath(basePath, e.name))
    .map((e) => ({ name: e.name, ...readSnapshotMeta(basePath, e.name) }))
    .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''))
}

// "demo" 하나만 있어도 이름이 뭘 가리키는지 헷갈린다는 피드백 — 순서가 드러나는 이름을 자동으로 붙인다.
// 기존 snapshot-N 중 가장 큰 N+1. 레거시 이름(예: demo)은 패턴이 안 맞아 무시되고 번호는 계속 이어진다.
export function nextSnapshotName(basePath) {
  const existing = listSnapshots(basePath).map((s) => s.name)
  const maxN = existing.reduce((max, name) => {
    const m = /^snapshot-(\d+)$/.exec(name)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `snapshot-${maxN + 1}`
}

export function hasLiveBackup(basePath) {
  return Boolean(existingSnapshotPath(basePath, RESERVED_LIVE_BACKUP))
}

export function discardLiveBackup(basePath) {
  const dir = snapshotPath(basePath, RESERVED_LIVE_BACKUP)
  if (!dir) return false
  const existed = pathEntryExists(dir)
  fs.rmSync(dir, { recursive: true, force: true })
  return existed
}

function replaceDirectory(srcDir, destDir) {
  const suffix = `${process.pid}-${Date.now()}`
  const stage = `${destDir}.restore-${suffix}`
  const prior = `${destDir}.prior-${suffix}`
  fs.rmSync(stage, { recursive: true, force: true })
  fs.cpSync(srcDir, stage, { recursive: true })
  if (fs.existsSync(destDir)) fs.renameSync(destDir, prior)
  try {
    fs.renameSync(stage, destDir)
    fs.rmSync(prior, { recursive: true, force: true })
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true })
    if (!fs.existsSync(destDir) && fs.existsSync(prior)) fs.renameSync(prior, destDir)
    throw error
  }
}

function pathEntryExists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch {
    return false
  }
}

function snapshotGenerationRoot(basePath, name) {
  const root = snapshotsRoot(basePath)
  const generationRoot = path.resolve(root, GENERATIONS_DIR, name)
  if (!isDescendantPath(root, generationRoot)) throw new Error('invalid_snapshot_name')
  return generationRoot
}

function newGeneration() {
  return `${Date.now()}-${process.pid}-${randomUUID()}`
}

// 공개 snapshot 이름은 하나의 symlink로만 교체한다. 따라서 name 아래의 자료와
// meta.json은 항상 같은 immutable generation을 가리킨다.
function publishSnapshotGeneration(basePath, name, generationPath) {
  const snapshotsPath = snapshotsRoot(basePath)
  const pointerPath = snapshotPath(basePath, name)
  if (!pointerPath) throw new Error('invalid_snapshot_name')
  const nextPath = `${pointerPath}.next-${process.pid}-${randomUUID()}`
  const generationRoot = snapshotGenerationRoot(basePath, name)
  fs.symlinkSync(path.relative(snapshotsPath, generationPath), nextPath, 'dir')
  try {
    if (pathEntryExists(pointerPath) && !fs.lstatSync(pointerPath).isSymbolicLink()) {
      // 한 번만 필요한 레거시 migration이다. 이동에 실패하면 원래 디렉터리를
      // 복구하고, 새 generation은 아직 공개하지 않는다.
      const legacyPath = path.join(generationRoot, `legacy-${newGeneration()}`)
      fs.renameSync(pointerPath, legacyPath)
      try {
        fs.renameSync(nextPath, pointerPath)
      } catch (error) {
        if (!pathEntryExists(pointerPath) && pathEntryExists(legacyPath)) fs.renameSync(legacyPath, pointerPath)
        throw error
      }
      return
    }
    fs.renameSync(nextPath, pointerPath)
  } finally {
    fs.rmSync(nextPath, { recursive: true, force: true })
  }
}

function replaceFile(srcFile, destFile) {
  const stage = `${destFile}.restore-${process.pid}-${Date.now()}`
  fs.mkdirSync(path.dirname(destFile), { recursive: true })
  fs.copyFileSync(srcFile, stage)
  fs.renameSync(stage, destFile)
}

// 스냅샷 "기준시각" — METAR 배치 수신시각(fetched_at)을 대표값으로 씀. 복원 시 시연 모드의
// demoNow를 이 값으로 맞춰서, 그 시점 데이터에 맞는 "지금"으로 새 비행계획을 짤 수 있게 한다.
function referenceTimeFor(basePath) {
  const metar = loadLatest(path.join(basePath, 'metar'))
  return metar?.fetched_at || new Date().toISOString()
}

// minFreeAfterBytes: 저장한 뒤에도 남아야 하는 디스크 여유. 확대 수집을 쓰면 다음 확대 회차를 시작할 자리(약 8.1 GB)를
// 남긴다. 모자라면 아무것도 쓰지 않고 snapshot_disk_budget으로 거절한다.
export function saveSnapshot(basePath, name, {
  beforePublish,
  kimWindow = DEMO_KIM_WINDOW,
  minFreeAfterBytes = config.kim_expanded?.enabled ? EXPANDED_START_FREE_BYTES : 0,
  diskFree = freeBytes,
  activePath = path.join(basePath, '.active-data'),
} = {}) {
  if (!snapshotPath(basePath, name)) throw new Error('invalid_snapshot_name')
  const referenceTime = referenceTimeFor(basePath)
  const referenceMs = Date.parse(referenceTime)
  const saved = []
  const files = []
  let kimExpanded = null
  for (const type of listCapturableTypes(basePath)) {
    const plan = planType(basePath, type, referenceMs, kimWindow)
    if (!plan.files.length) continue
    files.push(...plan.files)
    saved.push(type)
    if (plan.expanded) kimExpanded = plan.expanded
  }
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file.src).size, 0)
  const free = diskFree(basePath)
  if (free - bytes < minFreeAfterBytes) {
    const error = new Error('snapshot_disk_budget')
    error.code = 'snapshot_disk_budget'
    error.detail = { bytes, free, minFreeAfterBytes }
    throw error
  }

  const generation = newGeneration()
  const generationRoot = snapshotGenerationRoot(basePath, name)
  const generationPath = path.join(generationRoot, generation)
  const stageBase = path.join(generationRoot, `.capture-${generation}`)
  fs.mkdirSync(generationRoot, { recursive: true })
  fs.rmSync(stageBase, { recursive: true, force: true })
  try {
    for (const file of files) copyPlannedFile(file, stageBase)
    const savedAt = new Date().toISOString()
    const revision = `snapshot:${name}:${generation}`
    fs.writeFileSync(path.join(stageBase, 'meta.json'), JSON.stringify({ savedAt, referenceTime, generation, revision, bytes, kimExpanded, kimWindow }, null, 2))
    beforePublish?.({ stageBase, generation, generationPath })
    fs.renameSync(stageBase, generationPath)
    try {
      publishSnapshotGeneration(basePath, name, generationPath)
    } catch (error) {
      fs.rmSync(generationPath, { recursive: true, force: true })
      throw error
    }
    pruneSnapshotGenerations(basePath, name, { keep: generation, activePath })
    return { name, saved, referenceTime, savedAt, generation, revision, bytes, kimExpanded }
  } finally {
    fs.rmSync(stageBase, { recursive: true, force: true })
  }
}

function activeDemoView(activePath) {
  try {
    const meta = readJson(path.join(fs.realpathSync(activePath), '.view.json'))
    return meta?.mode === 'demo' ? meta : null
  } catch {
    return null
  }
}

// 같은 이름의 이전 generation과 그 시연 view를 지운다(스냅샷 하나가 2 GB 가까이 되어 쌓아 둘 수 없다).
// 지금 시연 중인 generation은 남긴다. 다음 저장이나 삭제 때 지운다.
export function pruneSnapshotGenerations(basePath, name, { keep, activePath = path.join(basePath, '.active-data') } = {}) {
  const active = activeDemoView(activePath)
  const inUse = new Set([keep, active?.name === name ? active.generation : null].filter(Boolean))
  const generationRoot = snapshotGenerationRoot(basePath, name)
  const viewsRoot = path.join(basePath, '.demo-views', name)
  const removed = []
  for (const root of [generationRoot, viewsRoot]) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root)) {
      if (inUse.has(entry) || entry.startsWith('.capture-')) continue
      fs.rmSync(path.join(root, entry), { recursive: true, force: true })
      if (root === generationRoot) removed.push(entry)
    }
  }
  return removed
}

// 스냅샷을 지운다. 지금 시연 중인 스냅샷은 먼저 시연을 끝내야 지울 수 있다.
export function deleteSnapshot(basePath, name, { activePath = path.join(basePath, '.active-data') } = {}) {
  const pointer = snapshotPath(basePath, name)
  if (!pointer || name === RESERVED_LIVE_BACKUP) throw new Error('invalid_snapshot_name')
  if (!pathEntryExists(pointer)) return false
  if (activeDemoView(activePath)?.name === name) {
    const error = new Error('snapshot_in_use')
    error.code = 'snapshot_in_use'
    throw error
  }
  fs.rmSync(pointer, { recursive: true, force: true })
  fs.rmSync(snapshotGenerationRoot(basePath, name), { recursive: true, force: true })
  fs.rmSync(path.join(basePath, '.demo-views', name), { recursive: true, force: true })
  return true
}

// skipBackup: true면 실황을 _live_backup에 백업하지 않고 바로 복원한다. 되돌리기(_live_backup 복원)
// 자체이거나, 이미 시연 모드라 실황이 아니라 "다른 스냅샷 데이터"인 경우에 true로 넘겨야 한다 —
// 안 그러면 두 번째 스냅샷을 로드할 때 첫 번째 스냅샷 데이터가 _live_backup을 덮어써서 원래 실황을 영영 잃는다.
export function loadSnapshot(basePath, name, { skipBackup = false } = {}) {
  const srcBase = existingSnapshotPath(basePath, name)
  if (!srcBase) return null

  if (!skipBackup) saveSnapshot(basePath, RESERVED_LIVE_BACKUP)

  const restored = []
  for (const type of fs.readdirSync(srcBase, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const srcDir = path.join(srcBase, type)
    if (FULL_DIR_TYPES.has(type)) {
      replaceDirectory(srcDir, path.join(basePath, type))
      restored.push(type)
      continue
    }
    const srcFile = path.join(srcDir, 'latest.json')
    if (!fs.existsSync(srcFile)) continue
    replaceFile(srcFile, path.join(basePath, type, 'latest.json'))
    restored.push(type)
  }
  initFromFiles(basePath)

  let referenceTime = null
  try { referenceTime = JSON.parse(fs.readFileSync(path.join(srcBase, 'meta.json'), 'utf8')).referenceTime ?? null } catch { /* 메타 없는 구버전 스냅샷 */ }
  return { restored, referenceTime }
}

function referencedPathExists(snapshotRoot, value) {
  if (typeof value !== 'string' || !value.startsWith('/data/')) return false
  return fs.existsSync(path.join(snapshotRoot, value.slice('/data/'.length)))
}

function inspectComparisonPointers(snapshotRoot, blockers, summaries) {
  const comparisonRoot = path.join(snapshotRoot, 'airport_model_comparison')
  if (!fs.existsSync(comparisonRoot)) return
  let missing = 0
  let airportCount = 0
  for (const modelEntry of fs.readdirSync(comparisonRoot, { withFileTypes: true })) {
    if (!modelEntry.isDirectory()) continue
    const modelRoot = path.join(comparisonRoot, modelEntry.name)
    const latestPath = path.join(modelRoot, 'latest.json')
    if (!fs.existsSync(latestPath)) continue
    try {
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
      for (const pointer of Object.values(latest.airports || {})) {
        airportCount += 1
        if (typeof pointer?.path !== 'string' || path.isAbsolute(pointer.path)) { missing += 1; continue }
        const resolved = path.resolve(modelRoot, pointer.path)
        if (!resolved.startsWith(modelRoot + path.sep) || !fs.existsSync(resolved)) missing += 1
      }
    } catch {
      blockers.push(`airport_model_comparison:${modelEntry.name}:invalid_latest_json`)
    }
  }
  if (missing) blockers.push(`airport_model_comparison:missing_payloads:${missing}`)
  summaries.airport_model_comparison = { airportCount }
}

// 확대 영역은 담은 시각만 남긴 목록과 실제 파일이 맞는지 본다. 없으면 지도는 한반도 회차로 대신 보인다.
function inspectExpanded(snapshotRoot, referenceMs, blockers, warnings, summaries) {
  const root = path.join(snapshotRoot, KIM_EXPANDED_TYPE)
  const latest = readJson(path.join(root, 'latest.json'))
  if (!latest) { warnings.push('kim_nwp_ea:not_in_snapshot_korea_fallback'); return }
  const hours = Array.isArray(latest.hours) ? latest.hours : []
  const index = readJson(path.join(root, 'index.json'))
  if (!hours.length) blockers.push('kim_nwp_ea:no_hours')
  if (!index) { blockers.push('kim_nwp_ea:missing_index'); return }
  if (String(index.times?.map((time) => time.hf)) !== String(hours)) blockers.push('kim_nwp_ea:index_hours_mismatch')
  const runDir = path.join(root, 'runs', String(latest.latestRunId || ''))
  if (!readJson(path.join(runDir, 'manifest.json'))) blockers.push('kim_nwp_ea:missing_run_manifest')
  const levels = (index.levels || []).map((level) => level.id)
  let missingGrids = 0
  for (const hf of hours) {
    for (const level of levels) {
      if (!fs.existsSync(path.join(runDir, 'normalized', `hf${String(hf).padStart(3, '0')}`, level, 'grid.nc'))) missingGrids += 1
    }
  }
  if (missingGrids) blockers.push(`kim_nwp_ea:missing_grids:${missingGrids}`)
  const keep = new Set(hours)
  for (const kind of ['gktg', 'tropopause', 'aci']) {
    const manifest = readJson(path.join(root, 'derived', kind, 'latest.json'))
    if (!manifest) { warnings.push(`kim_nwp_ea:${kind}_missing`); continue }
    const entries = manifest.entries || []
    if (entries.some((entry) => !keep.has(entry.hf))) blockers.push(`kim_nwp_ea:${kind}_hours_outside_snapshot`)
    if (!hours.every((hf) => entries.some((entry) => entry.hf === hf))) warnings.push(`kim_nwp_ea:${kind}_incomplete`)
    if (kind === 'gktg') {
      const missing = entries.filter((entry) => typeof entry.path === 'string' && !kimDocumentExists(path.join(snapshotRoot, entry.path))).length
      if (missing) blockers.push(`kim_nwp_ea:gktg_missing_fields:${missing}`)
    }
    if (kind === 'tropopause') {
      const missing = entries.filter((entry) => !fs.existsSync(path.join(runDir, 'derived', 'tropopause', `hf${String(entry.hf).padStart(3, '0')}`, `${entry.revision}.nc`))).length
      if (missing) blockers.push(`kim_nwp_ea:tropopause_missing_fields:${missing}`)
    }
  }
  const tmfc = String(latest.latestRun || '')
  const initMs = /^\d{10}$/.test(tmfc) ? Date.UTC(+tmfc.slice(0, 4), +tmfc.slice(4, 6) - 1, +tmfc.slice(6, 8), +tmfc.slice(8, 10)) : NaN
  const validTimes = hours.map((hf) => initMs + hf * 3600_000)
  if (Number.isFinite(referenceMs) && validTimes.length && (referenceMs < validTimes[0] || referenceMs > validTimes.at(-1))) {
    warnings.push('kim_nwp_ea:reference_time_outside_hours')
  }
  summaries[KIM_EXPANDED_TYPE] = { latestRun: latest.latestRun ?? null, hours }
}

export function inspectSnapshot(basePath, name) {
  const snapshotRoot = existingSnapshotPath(basePath, name)
  const blockers = []
  const warnings = []
  if (!snapshotRoot) {
    return { ready: false, blockers: ['snapshot_not_found'], warnings, referenceTime: null, types: [], summaries: {} }
  }

  const meta = readSnapshotMeta(basePath, name)
  const referenceMs = Date.parse(meta.referenceTime)
  if (!Number.isFinite(referenceMs)) blockers.push('reference_time_missing')
  const types = fs.readdirSync(snapshotRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  for (const type of DEMO_REQUIRED_TYPES) {
    if (!types.includes(type)) {
      blockers.push(`missing_type:${type}`)
      continue
    }
    if (type === 'radar' || type === 'satellite') {
      const metadataFile = FRAME_METADATA[type]
      if (!fs.existsSync(path.join(snapshotRoot, type, metadataFile))) blockers.push(`${type}:metadata_missing`)
    } else if (!fs.existsSync(path.join(snapshotRoot, type, 'latest.json'))) {
      blockers.push(`${type}:latest_missing`)
    }
  }
  const summaries = {}

  inspectComparisonPointers(snapshotRoot, blockers, summaries)

  for (const type of types) {
    const latestPath = path.join(snapshotRoot, type, 'latest.json')
    if (!fs.existsSync(latestPath)) continue
    try {
      const payload = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
      summaries[type] = {
        fetchedAt: payload.fetched_at ?? payload.updated_at ?? null,
        itemCount: Array.isArray(payload.items)
          ? payload.items.length
          : (Array.isArray(payload.aircraft) ? payload.aircraft.length : null),
      }
      if (type === 'adsb' && Number.isFinite(referenceMs)) {
        const fetchedMs = Date.parse(payload.fetched_at)
        if (!Number.isFinite(fetchedMs)) {
          blockers.push('adsb:fetched_at_missing')
        } else {
          const skewMs = Math.abs(fetchedMs - referenceMs)
          if (skewMs > ADSB_REFERENCE_TOLERANCE_MS) {
            blockers.push(`adsb:reference_skew:${Math.round(skewMs / 60_000)}m/30m`)
          }
        }
      }
    } catch {
      blockers.push(`${type}:invalid_latest_json`)
    }
  }

  // 지도가 쓰는 레이더(HSR·HCI)와 위성 그림. 옛 레이더 echo_meta.json(2026-08 수집 중단)은 보지 않는다.
  for (const [type, metaFile, minFrames, required] of [['radar', FRAME_METADATA.radar, 36, true], ['radar', 'hci/hci_meta.json', 0, false], ['satellite', FRAME_METADATA.satellite, 18, true]]) {
    const filePath = path.join(snapshotRoot, type, metaFile)
    if (!fs.existsSync(filePath)) continue
    const label = required ? type : `${type}:${path.dirname(metaFile)}`
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const frames = Array.isArray(payload.frames) ? payload.frames : []
      const missing = frames.filter((frame) => !referencedPathExists(snapshotRoot, frame.path)).length
      if (missing) blockers.push(`${label}:missing_frame_files:${missing}`)
      if (!required) continue
      summaries[type] = {
        fetchedAt: payload.fetched_at ?? payload.updatedAt ?? payload.updated_at ?? null,
        frameCount: frames.length,
        firstFrame: frames[0]?.tm ?? null,
        lastFrame: frames.at(-1)?.tm ?? null,
      }
      if (frames.length < minFrames) blockers.push(`${type}:short_history:${frames.length}/${minFrames}`)
    } catch {
      blockers.push(`${label}:invalid_metadata`)
    }
  }

  for (const type of ['kim_nwp', 'ktg']) {
    const latestPath = path.join(snapshotRoot, type, 'latest.json')
    if (!fs.existsSync(latestPath)) continue
    try {
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
      const indexPath = latest.indexPath ? path.join(snapshotRoot, latest.indexPath) : path.join(snapshotRoot, type, 'index.json')
      if (!fs.existsSync(indexPath)) blockers.push(`${type}:missing_index`)
      summaries[type] = { ...(summaries[type] || {}), latestRun: latest.latestRun ?? latest.tmfc ?? null }
    } catch {
      blockers.push(`${type}:invalid_latest_json`)
    }
  }

  inspectExpanded(snapshotRoot, Date.parse(meta.referenceTime), blockers, warnings, summaries)

  const gktgPointer = path.join(snapshotRoot, 'kim_nwp', 'derived', 'gktg', 'latest.json')
  if (fs.existsSync(gktgPointer)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(gktgPointer, 'utf8'))
      if (!manifest.complete || !manifest.entries?.length) blockers.push('kim_gktg:incomplete_manifest')
      for (const entry of manifest.entries || []) {
        const field = path.join(snapshotRoot, 'kim_nwp', 'runs', manifest.runId, 'normalized', `hf${String(entry.hf).padStart(3, '0')}`, entry.levelId, 'gktg', `${entry.revision}.json`)
        // 결과는 JSON 또는 NC로 저장된다(kim-doc-store.js).
        if (!kimDocumentExists(field)) blockers.push(`kim_gktg:missing_field:${entry.hf}:${entry.levelId}`)
      }
      summaries.kim_gktg = { latestRun: manifest.tmfc, revision: manifest.revision, fields: manifest.entries?.length || 0 }
    } catch { blockers.push('kim_gktg:invalid_manifest') }
  } else if (types.includes('kim_nwp')) warnings.push('kim_gktg:legacy_snapshot_without_gktg')

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    referenceTime: meta.referenceTime,
    savedAt: meta.savedAt,
    generation: meta.generation ?? null,
    revision: meta.revision ?? null,
    types,
    summaries,
  }
}
