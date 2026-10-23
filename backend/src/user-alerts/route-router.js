import { Router } from 'express'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { routeAlertSnapshot } from './route-sigmet.js'

const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0

export function createRouteAlertRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db ?? getDb()
  router.use(requireAuth)

  router.get('/route-alert-watches', (req, res) => {
    const db2 = database()
    const watches = db2.prepare(`SELECT id,route_id,route_name,route_snapshot,enabled,last_evaluated_at,updated_at
      FROM route_sigmet_watches WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC`).all(req.session.userId)
      .map((row) => ({ id: row.id, routeId: row.route_id, routeName: row.route_name,
        snapshot: JSON.parse(row.route_snapshot), enabled: Boolean(row.enabled),
        lastEvaluatedAt: row.last_evaluated_at, updatedAt: row.updated_at }))
    const routes = db2.prepare('SELECT id,name,etd,eta,payload FROM routes WHERE user_id=? AND alert_enabled=0 ORDER BY created_at DESC')
      .all(req.session.userId).filter((row) => {
        try { return JSON.parse(row.payload)?.kind !== 'briefing' } catch { return false }
      }).map((row) => ({ id: row.id, name: row.name,
        snapshot: routeAlertSnapshot(row) })).filter((row) => row.snapshot)
    res.json({ watches, routes })
  })

  router.put('/route-alert-watches/:routeId', (req, res) => {
    if (!validId(req.params.routeId)) return res.status(400).json({ error: 'invalid_route' })
    const db2 = database()
    const routeId = Number(req.params.routeId)
    const route = db2.prepare('SELECT id,name,etd,eta,payload FROM routes WHERE id=? AND user_id=? AND alert_enabled=0')
      .get(routeId, req.session.userId)
    if (!route) return res.status(404).json({ error: 'route_not_found' })
    try { if (JSON.parse(route.payload)?.kind === 'briefing') return res.status(400).json({ error: 'saved_route_required' }) }
    catch { return res.status(400).json({ error: 'invalid_route' }) }
    const snapshot = routeAlertSnapshot(route)
    if (!snapshot) return res.status(400).json({ error: 'route_needs_geometry_and_times' })
    if (Date.parse(snapshot.eta) <= Date.now()) return res.status(400).json({ error: 'route_expired' })
    const nowIso = new Date().toISOString()
    const current = db2.prepare('SELECT id,route_snapshot,route_name,enabled,deleted_at FROM route_sigmet_watches WHERE user_id=? AND route_id=?')
      .get(req.session.userId, routeId)
    const nextSnapshot = JSON.stringify(snapshot)
    const routeName = route.name || '저장 경로'
    if (current?.enabled && !current.deleted_at && current.route_snapshot === nextSnapshot) {
      if (current.route_name !== routeName) db2.prepare('UPDATE route_sigmet_watches SET route_name=? WHERE id=?').run(routeName, current.id)
      return res.json({ ok: true, routeId, unchanged: true })
    }
    db2.transaction(() => {
      if (current && current.route_snapshot !== nextSnapshot) {
        db2.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE watch_id=? AND active=1').run(nowIso, current.id)
      }
      db2.prepare(`INSERT INTO route_sigmet_watches(user_id,route_id,route_name,route_snapshot,enabled,state,updated_at)
        VALUES (?,?,?,?,1,'{}',?) ON CONFLICT(user_id,route_id) DO UPDATE SET
        route_name=excluded.route_name,route_snapshot=excluded.route_snapshot,enabled=1,
        deleted_at=NULL,updated_at=excluded.updated_at`)
        .run(req.session.userId, routeId, routeName, nextSnapshot, nowIso)
    })()
    res.json({ ok: true, routeId })
  })

  router.patch('/route-alert-watches/:id', (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'invalid_input' })
    const db2 = database()
    const watch = db2.prepare('SELECT id FROM route_sigmet_watches WHERE id=? AND user_id=? AND deleted_at IS NULL').get(Number(req.params.id), req.session.userId)
    if (!watch) return res.status(404).json({ error: 'not_found' })
    const nowIso = new Date().toISOString()
    db2.transaction(() => {
      db2.prepare('UPDATE route_sigmet_watches SET enabled=?,updated_at=? WHERE id=?').run(Number(req.body.enabled), nowIso, watch.id)
      if (!req.body.enabled) db2.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE watch_id=? AND active=1')
        .run(nowIso, watch.id)
    })()
    res.json({ ok: true })
  })

  router.delete('/route-alert-watches/:id', (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'invalid_input' })
    const db2 = database()
    const watch = db2.prepare('SELECT id FROM route_sigmet_watches WHERE id=? AND user_id=? AND deleted_at IS NULL').get(Number(req.params.id), req.session.userId)
    if (!watch) return res.status(404).json({ error: 'not_found' })
    const nowIso = new Date().toISOString()
    db2.transaction(() => {
      db2.prepare('UPDATE route_sigmet_watches SET enabled=0,deleted_at=?,updated_at=? WHERE id=?').run(nowIso, nowIso, watch.id)
      db2.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE watch_id=? AND active=1').run(nowIso, watch.id)
    })()
    res.json({ ok: true })
  })

  router.get('/route-alert-events/:id', (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'not_found' })
    const row = database().prepare(`SELECT e.id,e.route_id,e.payload,e.active,e.detected_at,e.resolved_at,e.read_at
      FROM route_sigmet_events e WHERE e.id=? AND e.user_id=?`).get(Number(req.params.id), req.session.userId)
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json({ event: { id: `route:${row.id}`, routeId: row.route_id, kind: 'sigmet',
      payload: JSON.parse(row.payload), active: Boolean(row.active),
      createdAt: row.detected_at, resolvedAt: row.resolved_at, readAt: row.read_at } })
  })

  return router
}
