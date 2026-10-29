import { Router } from 'express'
import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { cancelPersonalAlert } from './alert-service.js'
import airports from '../../../shared/airports.js'


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

// 옛 예정비행 알림은 이력 조회·삭제만 허용한다. 새 등록은 공항/경로 감시 API로 한다.
export function createAlertsRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)

  router.post('/alerts', (_req, res) => res.status(410).json({ error: 'legacy_alert_retired', settings: '/alerts/settings' }))

  router.get('/alerts', (req, res) => {
    const rows = database().prepare(
      'SELECT id, name, etd, eta, alert_start_min_before_etd, payload FROM routes WHERE user_id = ? AND alert_enabled = 1 ORDER BY etd'
    ).all(req.session.userId)
    // sourceBriefingId는 payload 안에만 있다(컬럼을 새로 만들지 않는다). 계정 목록이
    // 어느 브리핑이 감시 중인지 표시하는 데 쓴다.
    const sourceOf = (payload) => { try { return JSON.parse(payload).sourceBriefingId ?? null } catch { return null } }
    res.json({
      flights: rows.map(({ payload, ...r }) => ({
        ...r,
        active: false,
        retired: true,
        sourceBriefingId: sourceOf(payload),
      })),
    })
  })

  router.patch('/alerts/:id', (_req, res) => res.status(410).json({ error: 'legacy_alert_retired', settings: '/alerts/settings' }))

  router.delete('/alerts/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    cancelPersonalAlert(database(), req.session.userId, id)
    res.json({ ok: true })
  })

  router.get('/legacy-alerts', (req, res) => {
    const db2 = database()
    const flights = db2.prepare(`SELECT id,name,etd,eta FROM routes
      WHERE user_id=? AND alert_enabled=1 ORDER BY etd DESC LIMIT 100`).all(req.session.userId)
    const events = db2.prepare(`SELECT t.id,t.type,t.target,t.to_val AS bound,t.detected_at AS detectedAt,
      r.name AS routeName FROM triggered_alerts t LEFT JOIN routes r ON r.id=t.route_id
      WHERE t.user_id=? ORDER BY t.detected_at DESC,t.id DESC LIMIT 200`).all(req.session.userId)
    res.json({ flights, events })
  })

  // 사용자 공항·경로·기관 사건의 공통 읽기/읽음 API. 옛 예정 비행 이력은 제외한다.
  router.get('/notifications', (req, res) => {
    res.json(listNotifications(database(), req.session.userId))
  })
  router.patch('/notifications/:id/read', (req, res) => {
    const id = req.params.id
    if (!/^(?:airport|route|organization):[1-9]\d*$/.test(id)) return res.status(404).json({ error: 'not_found' })
    markNotificationRead(database(), req.session.userId, id, new Date().toISOString())
    res.json({ ok: true })
  })
  router.post('/notifications/read-all', (req, res) => {
    const updated = markAllNotificationsRead(database(), req.session.userId, new Date().toISOString())
    res.json({ ok: true, updated })
  })

  return router
}

// 알림센터 피드: 소유·기관 소속 범위의 발생 알림 최신순과 진행 중 미확인 수.
export function listNotifications(db, userId) {
  const names = new Map(airports.map((airport) => [airport.icao, airport.nameKo]))
  const airportEvents = db.prepare(`SELECT id,icao,kind,payload,active,detected_at,read_at,pushed_at
    FROM airport_alert_events WHERE user_id=? ORDER BY detected_at DESC,id DESC LIMIT 200`).all(userId)
    .map((row) => ({ id: `airport:${row.id}`, source: 'airport', airportIcao: row.icao,
      routeName: names.get(row.icao) ?? row.icao, type: row.kind, payload: JSON.parse(row.payload),
      active: Boolean(row.active), detectedAt: row.detected_at, readAt: row.read_at, pushedAt: row.pushed_at }))
  const routeEvents = db.prepare(`SELECT id,route_id,payload,active,detected_at,read_at,pushed_at
    FROM route_sigmet_events WHERE user_id=? ORDER BY detected_at DESC,id DESC LIMIT 200`).all(userId)
    .map((row) => { const payload = JSON.parse(row.payload); return {
      id: `route:${row.id}`, source: 'route', routeId: row.route_id, routeName: payload.routeName,
      type: 'sigmet', payload, active: Boolean(row.active), detectedAt: row.detected_at,
      readAt: row.read_at, pushedAt: row.pushed_at,
    } })
  const organizationEvents = db.prepare(`SELECT a.id,a.organization_id,a.kind,a.payload,a.active,a.created_at,
      s.read_at,o.name AS organization_name
    FROM organization_alerts a
    JOIN organization_members m ON m.organization_id=a.organization_id AND m.user_id=? AND m.status='active'
    JOIN organizations o ON o.id=a.organization_id
    LEFT JOIN organization_alert_user_states s ON s.alert_id=a.id AND s.user_id=?
    ORDER BY a.created_at DESC,a.id DESC LIMIT 200`).all(userId, userId)
    .map((row) => { const payload = JSON.parse(row.payload); return {
      id: `organization:${row.id}`, source: 'organization', organizationId: row.organization_id,
      routeName: `${row.organization_name} · ${payload.targetName ?? '관심대상'}`,
      type: row.kind, payload, active: Boolean(row.active), detectedAt: row.created_at,
      readAt: row.read_at,
    } })
  const notifications = [...airportEvents, ...routeEvents, ...organizationEvents]
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt) || String(b.id).localeCompare(String(a.id)))
    .slice(0, 200)
  // Badge = active and unread, including active events outside the 200-row feed.
  const unreadCount = db.prepare('SELECT COUNT(*) n FROM airport_alert_events WHERE user_id=? AND active=1 AND read_at IS NULL').get(userId).n
    + db.prepare('SELECT COUNT(*) n FROM route_sigmet_events WHERE user_id=? AND active=1 AND read_at IS NULL').get(userId).n
    + db.prepare(`SELECT COUNT(*) n FROM organization_alerts a
      JOIN organization_members m ON m.organization_id=a.organization_id AND m.user_id=? AND m.status='active'
      LEFT JOIN organization_alert_user_states s ON s.alert_id=a.id AND s.user_id=?
      WHERE a.active=1 AND s.read_at IS NULL`).get(userId, userId).n
  return { notifications, unreadCount }
}

export function markNotificationRead(db, userId, id, nowIso) {
  if (typeof id === 'string' && /^airport:[1-9]\d*$/.test(id)) {
    return db.prepare('UPDATE airport_alert_events SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL')
      .run(nowIso, Number(id.slice(8)), userId).changes > 0
  }
  if (typeof id === 'string' && /^route:[1-9]\d*$/.test(id)) {
    return db.prepare('UPDATE route_sigmet_events SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL')
      .run(nowIso, Number(id.slice(6)), userId).changes > 0
  }
  if (typeof id === 'string' && /^organization:[1-9]\d*$/.test(id)) {
    const alertId = Number(id.slice('organization:'.length))
    const row = db.prepare(`SELECT a.organization_id FROM organization_alerts a
      JOIN organization_members m ON m.organization_id=a.organization_id AND m.user_id=? AND m.status='active'
      WHERE a.id=?`).get(userId, alertId)
    if (!row) return false
    return db.prepare(`INSERT INTO organization_alert_user_states
      (organization_id,alert_id,user_id,read_at,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(alert_id,user_id) DO UPDATE SET read_at=COALESCE(read_at,excluded.read_at),updated_at=excluded.updated_at`)
      .run(row.organization_id, alertId, userId, nowIso, nowIso).changes > 0
  }
  return false
}

export function markAllNotificationsRead(db, userId, nowIso) {
  const airportEvents = db.prepare('UPDATE airport_alert_events SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso, userId).changes
  const routeEvents = db.prepare('UPDATE route_sigmet_events SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso, userId).changes
  const orgRows = db.prepare(`SELECT a.id FROM organization_alerts a
    JOIN organization_members m ON m.organization_id=a.organization_id AND m.user_id=? AND m.status='active'
    LEFT JOIN organization_alert_user_states s ON s.alert_id=a.id AND s.user_id=?
    WHERE s.read_at IS NULL`).all(userId, userId)
  for (const row of orgRows) markNotificationRead(db, userId, `organization:${row.id}`, nowIso)
  return airportEvents + routeEvents + orgRows.length
}

export default createAlertsRouter
