import fs from 'node:fs'
import path from 'node:path'

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
  let names
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((name) => name.startsWith(PREFIX) && name.endsWith('.db'))
    .sort()
    .reverse()
    .map((name) => {
      const full = path.join(dir, name)
      try {
        const stat = fs.statSync(full)
        return { name, path: full, bytes: stat.size, at: stat.mtime.toISOString() }
      } catch { return null }
    })
    .filter(Boolean)
}

export function lastBackup(basePath) {
  return listBackups(basePath)[0] ?? null
}

// keep개만 남기고 오래된 것부터 지운다.
function prune(basePath, keep) {
  for (const old of listBackups(basePath).slice(keep)) {
    try { fs.unlinkSync(old.path) } catch { /* 이미 없으면 그만 */ }
  }
}

// db는 better-sqlite3 연결. 실패는 던지지 않고 null을 돌려준다 — 백업이 안 됐다고
// 서버가 죽으면 백업이 없는 것보다 나쁘다. 대신 호출 측이 로그를 남긴다.
export function backupDatabase(db, basePath, { keep = 7, now = Date.now() } = {}) {
  const dir = backupDir(basePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, `${PREFIX}${stamp(now)}.db`)
    // 같은 분에 두 번 부르면 VACUUM INTO가 "이미 있다"로 실패한다. 먼저 치운다.
    try { fs.unlinkSync(target) } catch { /* 없으면 그만 */ }
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    prune(basePath, keep)
    const stat = fs.statSync(target)
    return { name: path.basename(target), path: target, bytes: stat.size, at: stat.mtime.toISOString() }
  } catch (error) {
    return { error: error.message }
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
