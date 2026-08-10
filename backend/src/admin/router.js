import { Router } from 'express'

import { getDb } from '../db/index.js'
import { requireRole } from '../auth/middleware.js'
import { createUser, listUsers, listPending, setUserStatus } from '../db/users.js'
import { readMetrics } from './metrics.js'
import { forecastDiskFull } from './disk-forecast.js'
import { trafficStats, hourlyPattern } from './visits.js'
import { readTrends } from './trends.js'
import { readDataHealth } from './data-health.js'
import { processHealth } from './process-health.js'
import { deploymentInfo } from './deployment.js'
import { readDiskUsage } from './disk-usage.js'
import store from '../store.js'
import stats from '../stats.js'
import { recordDemoEvent, getDemoEvents } from '../dev/demo-mode.js'
import { demoSession } from '../dev/demo-session.js'
import { listSnapshots, inspectSnapshot, isValidSnapshotName, nextSnapshotName, RESERVED_LIVE_BACKUP } from '../dev/snapshot-store.js'
import config from '../config.js'
import apiHubUsage from '../api-hub-usage.js'

// /api/admin/* — 전체 requireRole('admin'). db 주입 가능(테스트).
export function createAdminRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireRole('admin'))

  router.get('/metrics', (req, res) => res.json(readMetrics(database(), String(req.query.range || '24h'))))
  router.get('/traffic', (req, res) => res.json({
    ...trafficStats(database()),
    hourly: hourlyPattern(database()),
  }))
  router.get('/trends', (req, res) => {
    const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'day'
    res.json(readTrends(database(), granularity))
  })
  router.get('/data-health', (req, res) => {
    const health = readDataHealth(config.storage.active_path, { getCached: store.getCached, getStats: stats.getStats })
    health.rows = health.rows.map((row) => ({ ...row, stats: stats.getTypeSummary(row.statsKey) }))
    res.json(health)
  })
  // 서버 전산자원 탭: 재시작 횟수/가동시간/힙 메모리 + 폴더별 디스크 사용량 + 최근 실패 로그.
  // 디스크만 캐시(5분) — 나머지는 계산이 가벼워 매 요청 그대로.
  router.get('/server-health', (req, res) => res.json({
    process: processHealth(),
    disk: readDiskUsage(config.storage.base_path),
    recentErrors: (stats.getStats().recent_runs || []).filter((r) => !r.success).slice(0, 20),
    diskForecast: forecastDiskFull(readMetrics(database(), '7d').series),
    deployment: deploymentInfo(),
  }))
  router.get('/api-hub-usage', (req, res) => res.json(apiHubUsage.snapshot()))
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

  // 직접 ON/OFF는 실황 백업을 건너뛸 수 있으므로 제공하지 않는다.
  // 시작은 snapshot/load, 종료는 demo-mode/revert 두 원자적 동작으로만 수행한다.
  router.get('/demo-mode', (req, res) => res.json(demoSession.status()))
  // 디버깅용 — 버튼 눌렀을 때 실제로 뭐가 됐는지 콘솔에서 바로 확인(SSH로 pm2 로그 뒤질 필요 없이).
  router.get('/demo-mode/log', (req, res) => res.json({ events: getDemoEvents() }))

  router.get('/snapshot/list', (req, res) => res.json({
    snapshots: listSnapshots(config.storage.base_path).map((snapshot) => ({
      ...snapshot,
      inspection: inspectSnapshot(config.storage.base_path, snapshot.name),
    })),
  }))
  router.get('/snapshot/:name/inspect', (req, res) => {
    if (!isValidSnapshotName(req.params.name)) return res.status(400).json({ error: 'invalid_name' })
    res.json(inspectSnapshot(config.storage.base_path, req.params.name))
  })

  // name 생략하면 "snapshot-N"으로 순번 자동 부여(스냅샷이 하나뿐이어도 이름 때문에 헷갈리지 않게).
  router.post('/snapshot/save', async (req, res) => {
    const requested = req.body?.name
    const name = requested ? requested : nextSnapshotName(config.storage.base_path)
    if (!isValidSnapshotName(name) || name === RESERVED_LIVE_BACKUP) {
      recordDemoEvent('save-failed', `이름 거부: ${JSON.stringify(requested)}`)
      return res.status(400).json({ error: 'invalid_name', hint: '영문/숫자/-/_ 만 가능' })
    }
    try {
      const { saved, referenceTime } = await demoSession.captureSnapshot(name)
      recordDemoEvent('save', `${name} — ${saved.length}개 항목, 기준시각 ${referenceTime}`)
      res.json({ ok: true, name, saved, referenceTime, inspection: inspectSnapshot(config.storage.base_path, name) })
    } catch (error) {
      recordDemoEvent('save-failed', error.message)
      res.status(error.message.startsWith('collection_drain_timeout') ? 503 : 500).json({ error: 'snapshot_save_failed' })
    }
  })

  // 스냅샷 로드 = 지금 실황을 되돌리기용으로 자동 백업 + 스냅샷 데이터로 교체 + 시연 모드 ON(cron 정지) +
  // "지금" 시각을 그 스냅샷의 기준시각으로 고정(새 비행계획이 실제 현재시각과 안 어긋나게).
  router.post('/snapshot/load', async (req, res) => {
    const { name } = req.body ?? {}
    if (!isValidSnapshotName(name)) {
      recordDemoEvent('load-failed', `이름 형식 오류: ${JSON.stringify(name)}`)
      return res.status(400).json({ error: 'invalid_name' })
    }
    try {
      const result = await demoSession.startDemo(name)
      recordDemoEvent('load', `${name} — ${result.restored.length}개 항목 복원(${result.restored.join(', ')}), 기준시각 ${result.referenceTime}`)
      res.json({ ok: true, ...result })
    } catch (error) {
      recordDemoEvent('load-failed', `${name}: ${error.message}`)
      const status = error.code === 'snapshot_not_found' ? 404
        : error.message.startsWith('collection_drain_timeout') ? 503 : 409
      res.status(status).json({
        error: error.code || 'snapshot_load_failed',
        ...(error.report ? { inspection: error.report } : {}),
      })
    }
  })

  // 되돌리기 = 스냅샷 로드 전 실황(_live_backup)으로 복원 + 시연 모드 종료(시각 오버라이드도 함께 해제).
  router.post('/demo-mode/revert', async (req, res) => {
    try {
      const result = await demoSession.stopDemo()
      recordDemoEvent('revert', result.note)
      res.json({ ok: true, ...result })
    } catch (error) {
      recordDemoEvent('revert-failed', error.message)
      res.status(error.message.startsWith('collection_drain_timeout') ? 503 : 500).json({ error: 'live_restore_failed' })
    }
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
