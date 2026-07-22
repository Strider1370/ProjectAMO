// 시연용 데이터 스냅샷 — 실황(latest.json)들을 이름 붙여 저장/복원. 관리자 콘솔(/api/admin/snapshot/*)에서 사용.
// 배포 서버에서도 쓸 수 있어야 해서 인증(requireRole admin)은 라우터 쪽에서 걸고, 여기는 순수 파일 로직만.
import fs from 'node:fs'
import path from 'node:path'
import { initFromFiles, loadLatest } from '../store.js'

const SNAPSHOT_EXCLUDE = new Set(['snapshots', 'stats']) // 캡처 대상에서 제외(메타/재귀 방지)
const NAME_RE = /^[a-zA-Z0-9_-]+$/ // 경로 이탈(../) 방지 — 영문/숫자/-/_ 만 허용
// kim_nwp·ktg는 실제 단면(수직 프로파일) 격자 데이터가 latest.json이 아니라 runs/<runId>/ 밑에 있고,
// 자동 정리(maxRuns=2)로 6시간 주기로 지워진다 — latest.json만 복사하면 단면 브리핑이 깨지므로 폴더째 복사.
// radar·satellite도 "latest" 포인터가 latest.json이 아니라 echo_meta.json/sat_meta.json(+rainviewer_meta.json)
// 이고, 실제 이미지(PNG/WebP) 여러 장이 그 옆에 같이 있어서 마찬가지로 폴더째 복사해야 함(용량은 각각 수백KB~수MB로 작음).
const FULL_DIR_TYPES = new Set(['kim_nwp', 'ktg', 'radar', 'satellite'])
// latest.json이 없어서 일반 스캔(listCapturableTypes)에 안 걸리지만 캡처해야 하는 디렉터리.
const EXTRA_CAPTURE_TYPES = new Set(['radar', 'satellite'])
// 스냅샷 로드 직전 실황을 자동 백업해두는 예약 이름 — 목록에 노출 안 함, "되돌리기" 전용.
export const RESERVED_LIVE_BACKUP = '_live_backup'

export function isValidSnapshotName(name) {
  return typeof name === 'string' && NAME_RE.test(name)
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

function copyTypeInto(basePath, type, destDir) {
  if (FULL_DIR_TYPES.has(type)) {
    fs.cpSync(path.join(basePath, type), destDir, { recursive: true })
  } else {
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(path.join(basePath, type, 'latest.json'), path.join(destDir, 'latest.json'))
  }
}

function readSnapshotMeta(basePath, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(basePath, 'snapshots', name, 'meta.json'), 'utf8'))
  } catch {
    return { savedAt: null, referenceTime: null } // 메타 없는 구버전 스냅샷
  }
}

// 저장 순서(savedAt)대로 정렬해 반환 — 화면에서 1./2./3. 번호를 매길 때 그대로 순번이 된다.
export function listSnapshots(basePath) {
  const dir = path.join(basePath, 'snapshots')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== RESERVED_LIVE_BACKUP)
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
  return fs.existsSync(path.join(basePath, 'snapshots', RESERVED_LIVE_BACKUP))
}

// 스냅샷 "기준시각" — METAR 배치 수신시각(fetched_at)을 대표값으로 씀. 복원 시 시연 모드의
// demoNow를 이 값으로 맞춰서, 그 시점 데이터에 맞는 "지금"으로 새 비행계획을 짤 수 있게 한다.
function referenceTimeFor(basePath) {
  const metar = loadLatest(path.join(basePath, 'metar'))
  return metar?.fetched_at || new Date().toISOString()
}

export function saveSnapshot(basePath, name) {
  const destBase = path.join(basePath, 'snapshots', name)
  const saved = []
  for (const type of listCapturableTypes(basePath)) {
    copyTypeInto(basePath, type, path.join(destBase, type))
    saved.push(type)
  }
  const referenceTime = referenceTimeFor(basePath)
  fs.writeFileSync(path.join(destBase, 'meta.json'), JSON.stringify({ savedAt: new Date().toISOString(), referenceTime }, null, 2))
  return { saved, referenceTime }
}

// skipBackup: true면 실황을 _live_backup에 백업하지 않고 바로 복원한다. 되돌리기(_live_backup 복원)
// 자체이거나, 이미 시연 모드라 실황이 아니라 "다른 스냅샷 데이터"인 경우에 true로 넘겨야 한다 —
// 안 그러면 두 번째 스냅샷을 로드할 때 첫 번째 스냅샷 데이터가 _live_backup을 덮어써서 원래 실황을 영영 잃는다.
export function loadSnapshot(basePath, name, { skipBackup = false } = {}) {
  const srcBase = path.join(basePath, 'snapshots', name)
  if (!fs.existsSync(srcBase)) return null

  if (!skipBackup) saveSnapshot(basePath, RESERVED_LIVE_BACKUP)

  const restored = []
  for (const type of fs.readdirSync(srcBase, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const srcDir = path.join(srcBase, type)
    if (FULL_DIR_TYPES.has(type)) {
      fs.rmSync(path.join(basePath, type), { recursive: true, force: true })
      fs.cpSync(srcDir, path.join(basePath, type), { recursive: true })
      restored.push(type)
      continue
    }
    const srcFile = path.join(srcDir, 'latest.json')
    if (!fs.existsSync(srcFile)) continue
    fs.mkdirSync(path.join(basePath, type), { recursive: true })
    fs.copyFileSync(srcFile, path.join(basePath, type, 'latest.json'))
    restored.push(type)
  }
  initFromFiles(basePath)

  let referenceTime = null
  try { referenceTime = JSON.parse(fs.readFileSync(path.join(srcBase, 'meta.json'), 'utf8')).referenceTime ?? null } catch { /* 메타 없는 구버전 스냅샷 */ }
  return { restored, referenceTime }
}
