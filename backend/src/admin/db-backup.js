import fs from 'node:fs'
import path from 'node:path'
import { backupAssetsPath, backupOrganizationFiles, isPublishedOrganizationBackup, organizationFilesRoot, verifyOrganizationBackup } from './organization-backup-files.js'

// SQLite 백업. 계정·방문 기록·지표가 전부 projectamo.db 한 파일에 들어 있는데 지금까지
// 백업 수단이 없었다.
//
// cp로 복사하지 않는다 — 이 DB는 WAL 모드라 본체 파일만 베끼면 아직 WAL에만 있는 최근 쓰기가
// 빠진 채로, 혹은 반쯤 쓰인 상태로 복사된다. VACUUM INTO는 SQLite가 트랜잭션 안에서 일관된
// 스냅샷을 새 파일로 써주는 한 문장이고, 덤으로 압축까지 된다.
//
// 한계를 분명히 해둔다: 사본이 같은 디스크에 있다. 실수로 지웠거나 마이그레이션이 망가진
// 경우는 이걸로 되살리지만, 디스크 자체가 죽으면 원본과 사본이 함께 사라진다. 진짜 대비는
// 다른 기기로 복사하는 것이고 그건 이 파일의 범위가 아니다.
const DIR_NAME = 'backups'
const PREFIX = 'projectamo-'
const STAGING_PREFIX = '.backup-staging-'
const STAGING_OWNER = 'owner.json'
const STAGING_PUBLICATION = 'publication.json'
const STALE_STAGING_MS = 6 * 60 * 60 * 1000

export function backupDir(basePath) {
  return path.join(basePath, DIR_NAME)
}

// 파일 이름에 시각을 넣어 정렬만으로 최신을 찾을 수 있게 한다(KST).
function stamp(nowMs) {
  const kst = new Date(nowMs + 9 * 3_600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}-${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}

export function listBackups(basePath) {
  const dir = backupDir(basePath)
  cleanupBackupArtifacts(dir)
  let names
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((name) => backupNameParts(name))
    .sort(compareBackupNames)
    .map((name) => {
      const full = path.join(dir, name)
      try {
        if (!isPublishedOrganizationBackup(full)) return null
        const stat = fs.statSync(full)
        return { name, path: full, bytes: stat.size, at: stat.mtime.toISOString() }
      } catch { return null }
    })
    .filter(Boolean)
}

function backupNameParts(name) {
  return new RegExp(`^${PREFIX}(\\d{8}-\\d{4})(?:-(\\d+))?\\.db$`).exec(name)
}

// Same-minute retries receive an attempt suffix.  Numeric ordering keeps the
// newly published generation ahead of the original timestamp name.
function compareBackupNames(a, b) {
  const [, stampA, attemptA = '0'] = backupNameParts(a)
  const [, stampB, attemptB = '0'] = backupNameParts(b)
  return stampB.localeCompare(stampA) || Number(attemptB) - Number(attemptA)
}

function nextBackupPath(dir, now) {
  const base = `${PREFIX}${stamp(now)}`
  let attempt = 0
  while (true) {
    const suffix = attempt === 0 ? '' : `-${String(attempt).padStart(2, '0')}`
    const candidate = path.join(dir, `${base}${suffix}.db`)
    if (!fs.existsSync(candidate) && !fs.existsSync(backupAssetsPath(candidate))) return candidate
    attempt += 1
  }
}

function stagingOwnerPath(staging) {
  return path.join(staging, STAGING_OWNER)
}

function stagingPublicationPath(staging) {
  return path.join(staging, STAGING_PUBLICATION)
}

function writeStagingOwner(staging) {
  fs.writeFileSync(stagingOwnerPath(staging), JSON.stringify({ pid: process.pid }))
}

function stageOwnerState(staging) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(stagingOwnerPath(staging), 'utf8'))
    if (!Number.isSafeInteger(pid) || pid <= 0) return 'unknown'
    process.kill(pid, 0)
    return 'live'
  } catch (error) {
    // EPERM means a process exists but is owned by another account; that is an
    // active writer too.  A dead recorded owner is immediately recoverable;
    // staging from the pre-owner format falls back to a conservative age check.
    if (error?.code === 'EPERM') return 'live'
    if (error?.code === 'ESRCH') return 'abandoned'
    return 'unknown'
  }
}

function declaredPublication(staging) {
  try {
    const { target } = JSON.parse(fs.readFileSync(stagingPublicationPath(staging), 'utf8'))
    return backupNameParts(target) ? target : null
  } catch {
    return null
  }
}

function declarePublication(staging, target) {
  fs.writeFileSync(stagingPublicationPath(staging), JSON.stringify({ target: path.basename(target) }))
}

// A database rename is the completion marker.  If a host dies after assets
// moved but before that marker, remove the unpaired assets on the next safe
// observation.  A live staging owner claims its target during that tiny window
// so a concurrent status/list request cannot race the publisher.
function cleanupBackupArtifacts(dir, now = Date.now()) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  const claimedAssets = new Set()
  for (const entry of entries) {
    if (!entry.name.startsWith(STAGING_PREFIX) || !entry.isDirectory()) continue
    const staging = path.join(dir, entry.name)
    const owner = stageOwnerState(staging)
    let stale = false
    try { stale = now - fs.statSync(staging).mtimeMs > STALE_STAGING_MS } catch { continue }
    if (owner === 'live' || (owner === 'unknown' && !stale)) {
      const target = declaredPublication(staging)
      if (target) claimedAssets.add(backupAssetsPath(path.join(dir, target)))
      continue
    }
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch { /* retry on a later observation */ }
  }
  for (const entry of entries) {
    if (!entry.name.endsWith('.db.assets')) continue
    const databaseName = entry.name.slice(0, -'.assets'.length)
    if (!backupNameParts(databaseName)) continue
    const assets = path.join(dir, entry.name)
    if (claimedAssets.has(assets) || fs.existsSync(path.join(dir, databaseName))) continue
    try { fs.rmSync(assets, { recursive: true, force: true }) } catch { /* retry on a later observation */ }
  }
}

export function lastBackup(basePath) {
  return listBackups(basePath)[0] ?? null
}

// keep개만 남기고 오래된 것부터 지운다.
function prune(basePath, keep) {
  for (const old of listBackups(basePath).slice(keep)) {
    try { fs.unlinkSync(old.path); fs.rmSync(backupAssetsPath(old.path), { recursive: true, force: true }) } catch { /* 이미 없으면 그만 */ }
  }
}

// db는 better-sqlite3 연결. 실패는 던지지 않고 null을 돌려준다 — 백업이 안 됐다고
// 서버가 죽으면 백업이 없는 것보다 나쁘다. 대신 호출 측이 로그를 남긴다.
export function backupDatabase(db, basePath, { keep = 7, now = Date.now(), filesRoot = organizationFilesRoot(), onStage } = {}) {
  const dir = backupDir(basePath)
  let staging = null
  let publishedAssets = null
  let published = false
  try {
    fs.mkdirSync(dir, { recursive: true })
    cleanupBackupArtifacts(dir)
    staging = fs.mkdtempSync(path.join(dir, STAGING_PREFIX))
    writeStagingOwner(staging)
    const stagedDatabase = path.join(staging, 'snapshot.db')
    db.exec(`VACUUM INTO '${stagedDatabase.replace(/'/g, "''")}'`)
    onStage?.('vacuumed', { stagedDatabase })
    backupOrganizationFiles(stagedDatabase, filesRoot)
    onStage?.('assets-written', { stagedDatabase })
    verifyOrganizationBackup(stagedDatabase)
    onStage?.('verified', { stagedDatabase })

    const target = nextBackupPath(dir, now)
    const targetAssets = backupAssetsPath(target)
    // Publish assets first.  The DB rename is the commit marker: list/today
    // readers never expose a generation until both assets and manifest exist.
    onStage?.('before-publish', { stagedDatabase, target })
    declarePublication(staging, target)
    fs.renameSync(backupAssetsPath(stagedDatabase), targetAssets)
    publishedAssets = targetAssets
    onStage?.('assets-published', { stagedDatabase, target })
    fs.renameSync(stagedDatabase, target)
    published = true
    fs.rmSync(staging, { recursive: true, force: true })
    staging = null
    prune(basePath, keep)
    const stat = fs.statSync(target)
    return { name: path.basename(target), path: target, bytes: stat.size, at: stat.mtime.toISOString() }
  } catch (error) {
    // A return from this API must never leave an attempt directory that a
    // later operator could mistake for a recoverable generation.
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
    if (publishedAssets && !published) fs.rmSync(publishedAssets, { recursive: true, force: true })
    staging = null
    publishedAssets = null
    return { error: error.message }
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
    if (publishedAssets && !published) fs.rmSync(publishedAssets, { recursive: true, force: true })
  }
}

// 오늘(KST) 만든 백업이 이미 있나. 재시작할 때마다 백업하지 않기 위해 본다 —
// 지금 이 서버는 재시작이 잦아서(집계 이후 26회) 그대로 두면 하루치가 재시작 횟수만큼 쌓인다.
export function hasBackupToday(basePath, now = Date.now()) {
  const today = stamp(now).slice(0, 8)
  return listBackups(basePath).some((b) => b.name.startsWith(`${PREFIX}${today}`))
}

// 매일 03:10 KST. 수집이 한산한 시각이고, 정시(03:00)를 피해 다른 스케줄과 겹치지 않게 한다.
// 시작할 때 오늘 백업이 없으면 한 번 만든다 — 서버가 매일 03시에 떠 있으리라는 보장이 없다.
export function startDailyBackup(db, basePath, { schedule = '10 3 * * *', keep = 7, cron } = {}) {
  if (process.env.DB_BACKUP_DISABLED) {
    console.log('[backup] DB_BACKUP_DISABLED — 백업 비활성')
    return null
  }
  const run = (reason) => {
    const result = backupDatabase(db, basePath, { keep })
    if (result.error) console.error(`[backup] 실패(${reason}): ${result.error}`)
    else console.log(`[backup] ${result.name} (${(result.bytes / 1024).toFixed(0)} KB, ${reason})`)
  }
  if (!hasBackupToday(basePath)) run('시작 시 오늘치 없음')
  return cron?.schedule(schedule, () => run('정기'), { timezone: 'Asia/Seoul' }) ?? null
}

export default { backupDatabase, lastBackup, listBackups, backupDir, hasBackupToday, startDailyBackup }
