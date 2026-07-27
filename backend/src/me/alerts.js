import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'

const EXPIRE_MS = 3 * 60 * 60 * 1000 // ETD+3h 유예 후 자동삭제 대상(스케줄러가 정리)

const registerSchema = z.object({
  templateId: z.number().int().positive(),
  etd: z.string().min(1),                                   // ISO(UTC)
  eta: z.string().min(1).nullable().optional(),             // 클라 etaCalc 계산값
  alertStartMinBeforeEtd: z.number().int().min(120).max(360).optional(), // 2~6h
  sendNoChangeConfirm: z.boolean().optional(),
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
    const startMs = etdMs - (f.alertStartMinBeforeEtd || 120) * 60000
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
    const { templateId, etd, eta, alertStartMinBeforeEtd, sendNoChangeConfirm } = parsed.data

    const etdMs = Date.parse(etd)
    if (!Number.isFinite(etdMs) || etdMs <= Date.now()) return res.status(400).json({ error: 'etd_must_be_future' })
    if (eta && Date.parse(eta) <= etdMs) return res.status(400).json({ error: 'eta_after_etd' })

    const db2 = database()
    const tpl = db2.prepare('SELECT name, payload FROM routes WHERE id = ? AND user_id = ?').get(templateId, req.session.userId)
    if (!tpl) return res.status(404).json({ error: 'template_not_found' })

    const { n } = db2.prepare('SELECT COUNT(*) n FROM routes WHERE user_id = ?').get(req.session.userId)
    if (n >= 100) return res.status(400).json({ error: 'too_many_routes' })

    const now = new Date().toISOString()
    const expiresAt = new Date(etdMs + EXPIRE_MS).toISOString()
    const info = db2.prepare(`
      INSERT INTO routes (user_id, name, etd, eta, payload, alert_enabled, alert_start_min_before_etd, send_no_change_confirm, expires_at, created_at, updated_at)
      VALUES (?,?,?,?,?,1,?,?,?,?,?)
    `).run(req.session.userId, tpl.name, etd, eta ?? null, tpl.payload, alertStartMinBeforeEtd ?? 120, sendNoChangeConfirm ? 1 : 0, expiresAt, now, now)
    res.status(201).json({ id: info.lastInsertRowid })
  })

  router.get('/alerts', (req, res) => {
    const rows = database().prepare(
      'SELECT id, name, etd, eta, alert_start_min_before_etd FROM routes WHERE user_id = ? AND alert_enabled = 1 ORDER BY etd'
    ).all(req.session.userId)
    const active = pickActiveFlight(
      rows.map((r) => ({ id: r.id, etd: r.etd, alertStartMinBeforeEtd: r.alert_start_min_before_etd })),
      Date.now(),
    )
    res.json({ flights: rows.map((r) => ({ ...r, active: active?.id === r.id })) })
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
    const expiresAt = new Date(etdMs + EXPIRE_MS).toISOString()
    db2.prepare('UPDATE routes SET etd=?, eta=?, expires_at=?, updated_at=? WHERE id=? AND user_id=?')
      .run(etd, eta ?? null, expiresAt, new Date().toISOString(), id, req.session.userId)
    res.json({ ok: true })
  })

  router.delete('/alerts/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    const db2 = database()
    try {
      db2.prepare('DELETE FROM routes WHERE id=? AND user_id=? AND alert_enabled=1').run(id, req.session.userId)
    } catch {
      // 이미 발송된 알림 기록(triggered_alerts)이 이 경로를 참조 중이면 삭제가 막힌다(FK).
      // 그 기록은 알림센터에서 계속 보여야 하므로 지우지 않고, 대신 감시만 끈다 — 활성 목록에서
      // 사라지고 새 알림도 더는 안 오는 건 사용자가 기대하는 "삭제"와 결과가 같다.
      db2.prepare('UPDATE routes SET alert_enabled=0, updated_at=? WHERE id=? AND user_id=?')
        .run(new Date().toISOString(), id, req.session.userId)
    }
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
    SELECT t.id, t.route_id AS routeId, t.type, t.severity, t.target, t.from_val AS fromVal, t.to_val AS toVal,
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
