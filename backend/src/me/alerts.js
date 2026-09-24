import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { ALERT_EXPIRE_MS, registerPersonalAlert, cancelPersonalAlert } from './alert-service.js'


const registerSchema = z.object({
  templateId: z.number().int().positive(),
  etd: z.string().min(1),                                   // ISO(UTC)
  eta: z.string().min(1).nullable().optional(),             // 클라 etaCalc 계산값
  alertStartMinBeforeEtd: z.number().int().min(360).max(1440).optional(), // 6~24h
})

const patchSchema = z.object({
  etd: z.string().min(1).optional(),
  eta: z.string().min(1).nullable().optional(),
}).strict()

// 감시창(ETD-N ~ ETD) 안에서 사용자당 가장 임박한 1건. 순수 함수(테스트 대상).
// flights: [{ id, etd(ISO), alertStartMinBeforeEtd }]
export function pickActiveFlight(flights, nowMs) {
  const inWindow = flights.filter((f) => {
    const etdMs = Date.parse(f.etd)
    if (!Number.isFinite(etdMs)) return false
    const startMs = etdMs - (f.alertStartMinBeforeEtd || 360) * 60000
    return nowMs >= startMs && nowMs < etdMs
  })
  if (!inWindow.length) return null
  inWindow.sort((a, b) => Date.parse(a.etd) - Date.parse(b.etd))
  return inWindow[0]
}

// #13 예정 비행(알림) 등록·관리. 템플릿(내 route)을 복제해 alert_enabled=1 행 생성.
// 전부 session.userId로만 필터. requireAuth 필수.
export function createAlertsRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)

  router.post('/alerts', (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
    try { res.status(201).json(registerPersonalAlert(database(), req.session.userId, parsed.data)) }
    catch (error) {
      if (['etd_must_be_future', 'eta_after_etd', 'template_not_found', 'too_many_routes'].includes(error.code)) {
        return res.status(error.status).json({ error: error.code })
      }
      throw error
    }
  })

  router.get('/alerts', (req, res) => {
    const rows = database().prepare(
      'SELECT id, name, etd, eta, alert_start_min_before_etd, payload FROM routes WHERE user_id = ? AND alert_enabled = 1 ORDER BY etd'
    ).all(req.session.userId)
    const active = pickActiveFlight(
      rows.map((r) => ({ id: r.id, etd: r.etd, alertStartMinBeforeEtd: r.alert_start_min_before_etd })),
      Date.now(),
    )
    // sourceBriefingId는 payload 안에만 있다(컬럼을 새로 만들지 않는다). 계정 목록이
    // 어느 브리핑이 감시 중인지 표시하는 데 쓴다.
    const sourceOf = (payload) => { try { return JSON.parse(payload).sourceBriefingId ?? null } catch { return null } }
    res.json({
      flights: rows.map(({ payload, ...r }) => ({
        ...r,
        active: active?.id === r.id,
        sourceBriefingId: sourceOf(payload),
      })),
    })
  })

  // ETD 조정(지연) — expires_at 재계산.
  router.patch('/alerts/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    const patch = patchSchema.safeParse(req.body)
    if (!patch.success) return res.status(400).json({ error: 'invalid_input' })

    const db2 = database()
    const row = db2.prepare('SELECT etd, eta FROM routes WHERE id=? AND user_id=? AND alert_enabled=1').get(id, req.session.userId)
    if (!row) return res.status(404).json({ error: 'not_found' })

    const etd = patch.data.etd ?? row.etd
    const etdMs = Date.parse(etd)
    if (!Number.isFinite(etdMs)) return res.status(400).json({ error: 'invalid_input' })
    const eta = 'eta' in patch.data ? patch.data.eta : row.eta
    const expiresAt = new Date(etdMs + ALERT_EXPIRE_MS).toISOString()
    db2.prepare('UPDATE routes SET etd=?, eta=?, expires_at=?, updated_at=? WHERE id=? AND user_id=?')
      .run(etd, eta ?? null, expiresAt, new Date().toISOString(), id, req.session.userId)
    res.json({ ok: true })
  })

  router.delete('/alerts/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    cancelPersonalAlert(database(), req.session.userId, id)
    res.json({ ok: true })
  })

  // ── #13 알림센터 피드(triggered_alerts) — 위 예정비행 등록과 별개 리소스 ──
  // 경로: /notifications. 스펙의 /alerts는 예정비행 목록이 이미 점유 → 발생 알림 피드는 notifications로 분리.
  router.get('/notifications', (req, res) => {
    res.json(listNotifications(database(), req.session.userId))
  })
  router.patch('/notifications/:id/read', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    markNotificationRead(database(), req.session.userId, id, new Date().toISOString())
    res.json({ ok: true })
  })
  router.post('/notifications/read-all', (req, res) => {
    const updated = markAllNotificationsRead(database(), req.session.userId, new Date().toISOString())
    res.json({ ok: true, updated })
  })

  return router
}

// 알림센터 피드: 내 발생 알림 최신순(경로명 조인) + 안 읽음 수. 순수 DB 함수(서버 없이 테스트).
export function listNotifications(db, userId) {
  const notifications = db.prepare(`
    SELECT t.id, t.route_id AS routeId, t.type, t.severity, t.target,
           t.source_id AS role,
           t.from_val AS fromVal, t.to_val AS toVal,
           t.detected_at AS detectedAt, t.pushed_at AS pushedAt, t.read_at AS readAt,
           r.name AS routeName, r.dep AS routeDep, r.dest AS routeDest, r.altn AS routeAltn
    FROM triggered_alerts t LEFT JOIN routes r ON r.id = t.route_id
    WHERE t.user_id = ? ORDER BY t.detected_at DESC, t.id DESC LIMIT 200
  `).all(userId)
  const unreadCount = db.prepare('SELECT COUNT(*) n FROM triggered_alerts WHERE user_id=? AND read_at IS NULL').get(userId).n
  return { notifications, unreadCount }
}

export function markNotificationRead(db, userId, id, nowIso) {
  return db.prepare('UPDATE triggered_alerts SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL').run(nowIso, id, userId).changes > 0
}

export function markAllNotificationsRead(db, userId, nowIso) {
  return db.prepare('UPDATE triggered_alerts SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso, userId).changes
}

export default createAlertsRouter
