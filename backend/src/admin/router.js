import { Router } from 'express'

import { getDb } from '../db/index.js'
import { requireRole } from '../auth/middleware.js'
import { createUser, listUsers, listPending, setUserStatus } from '../db/users.js'
import { readMetrics } from './metrics.js'
import { trafficStats } from './visits.js'
import { isDemoMode, setDemoMode, setDemoNow, getEffectiveNow } from '../dev/demo-mode.js'
import { listSnapshots, saveSnapshot, loadSnapshot, isValidSnapshotName, hasLiveBackup, nextSnapshotName, RESERVED_LIVE_BACKUP } from '../dev/snapshot-store.js'
import config from '../config.js'

// /api/admin/* — 전체 requireRole('admin'). db 주입 가능(테스트).
export function createAdminRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireRole('admin'))

  router.get('/metrics', (req, res) => res.json(readMetrics(database(), String(req.query.range || '24h'))))
  router.get('/traffic', (req, res) => res.json(trafficStats(database())))
  router.get('/users', (req, res) => res.json(listUsers(database())))
  router.get('/pending', (req, res) => res.json(listPending(database())))
  // id 검증 + 실제 변경 여부 확인(없는 id를 조용히 200 처리하지 않음).
  function setStatus(status) {
    return (req, res) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })
      if (!setUserStatus(database(), id, status)) return res.status(404).json({ error: 'user_not_found' })
      res.json({ ok: true })
    }
  }
  router.post('/users/:id/approve', setStatus('active'))
  router.post('/users/:id/reject', setStatus('rejected'))

  // 시연 모드 on/off — 배포 서버에서도 재시작 없이 자동수집(cron)을 껐다 켰다 하기 위함.
  // 지도의 "시연용 모드" 배지는 누구나 봐야 해서 조회는 별도 공개 라우트(GET /api/demo-mode)로 뺐고,
  // 여기(관리자 전용)는 켜고 끄는 것 + 스냅샷 목록·저장·복원·되돌리기를 담당.
  router.post('/demo-mode', (req, res) => res.json({ ok: true, on: setDemoMode(!!req.body?.on) }))
  router.get('/demo-mode', (req, res) => res.json({
    on: isDemoMode(),
    now: getEffectiveNow().toISOString(),
    hasLiveBackup: hasLiveBackup(config.storage.base_path),
  }))

  router.get('/snapshot/list', (req, res) => res.json({ snapshots: listSnapshots(config.storage.base_path) }))

  // name 생략하면 "snapshot-N"으로 순번 자동 부여(스냅샷이 하나뿐이어도 이름 때문에 헷갈리지 않게).
  router.post('/snapshot/save', (req, res) => {
    const requested = req.body?.name
    const name = requested ? requested : nextSnapshotName(config.storage.base_path)
    if (!isValidSnapshotName(name) || name === RESERVED_LIVE_BACKUP) {
      return res.status(400).json({ error: 'invalid_name', hint: '영문/숫자/-/_ 만 가능' })
    }
    const { saved, referenceTime } = saveSnapshot(config.storage.base_path, name)
    res.json({ ok: true, name, saved, referenceTime })
  })

  // 스냅샷 로드 = 지금 실황을 되돌리기용으로 자동 백업 + 스냅샷 데이터로 교체 + 시연 모드 ON(cron 정지) +
  // "지금" 시각을 그 스냅샷의 기준시각으로 고정(새 비행계획이 실제 현재시각과 안 어긋나게).
  router.post('/snapshot/load', (req, res) => {
    const { name } = req.body ?? {}
    if (!isValidSnapshotName(name)) return res.status(400).json({ error: 'invalid_name' })
    // _live_backup이 이미 있으면 지금 데이터는 "실황"이 아니라 이전에 로드한 다른 스냅샷 데이터이므로
    // 다시 백업하지 않는다 — 안 그러면 두 번째 스냅샷을 로드할 때 원래 실황이 덮여써서 되돌리기가 망가진다.
    // (isDemoMode()로 판단하면 안 됨 — 로컬 DISABLE_COLLECTION은 시작부터 demoMode=true라 첫 로드부터 스킵돼버림.)
    const result = loadSnapshot(config.storage.base_path, name, { skipBackup: hasLiveBackup(config.storage.base_path) })
    if (!result) return res.status(404).json({ error: 'not_found', hint: 'GET /api/admin/snapshot/list 로 확인하세요.' })
    setDemoMode(true)
    if (result.referenceTime) setDemoNow(result.referenceTime)
    res.json({ ok: true, name, restored: result.restored, referenceTime: result.referenceTime, now: getEffectiveNow().toISOString() })
  })

  // 되돌리기 = 스냅샷 로드 전 실황(_live_backup)으로 복원 + 시연 모드 종료(시각 오버라이드도 함께 해제).
  router.post('/demo-mode/revert', (req, res) => {
    const base = config.storage.base_path
    const had = hasLiveBackup(base)
    if (had) loadSnapshot(base, RESERVED_LIVE_BACKUP, { skipBackup: true })
    setDemoMode(false)
    res.json({
      ok: true, restoredLiveBackup: had,
      note: had ? '스냅샷 로드 전 실황으로 복원 + 시연 모드 종료.' : '되돌릴 백업 없음(스냅샷을 로드한 적 없음) — 시연 모드만 종료.',
    })
  })

  // 알려진 검증 오류코드만 클라이언트로. 그 외(DB 내부오류 등)는 일반화해 내부정보 비노출.
  const KNOWN = new Set(['username_taken', 'invalid_username', 'invalid_password', 'invalid_role'])
  router.post('/forecasters', (req, res) => {
    if (req.body?.displayName != null && typeof req.body.displayName !== 'string') return res.status(400).json({ error: 'invalid_input' })
    if (req.body?.airports != null && !Array.isArray(req.body.airports)) return res.status(400).json({ error: 'invalid_input' })
    try {
      const u = createUser(database(), {
        username: req.body?.username,
        password: req.body?.password,
        role: 'forecaster',
        displayName: req.body?.displayName,
        airports: req.body?.airports,
        status: 'active',
      })
      res.status(201).json(u)
    } catch (err) {
      res.status(400).json({ error: KNOWN.has(err.message) ? err.message : 'invalid_input' })
    }
  })
  return router
}
export default createAdminRouter
