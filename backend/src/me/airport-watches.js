import { Router } from 'express'
import airports from '../../../shared/airports.js'
import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { airportAlertRulesSchema, DEFAULT_AIRPORT_ALERT_RULES } from '../airport-alerts/rules.js'

const AIRPORTS = new Set(airports.map((airport) => airport.icao))

export function createAirportWatchesRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db ?? getDb()
  router.use(requireAuth)

  router.get('/airport-watches', (req, res) => {
    const watches = database().prepare('SELECT icao,enabled,rules,state,last_evaluated_at FROM airport_alert_watches WHERE user_id=? ORDER BY icao').all(req.session.userId)
      .map((row) => ({ icao: row.icao, enabled: Boolean(row.enabled), rules: airportAlertRulesSchema.parse(JSON.parse(row.rules)),
        sourceStatus: JSON.parse(row.state || '{}').sourceStatus ?? null, lastEvaluatedAt: row.last_evaluated_at }))
    res.json({ watches, defaults: DEFAULT_AIRPORT_ALERT_RULES })
  })

  router.get('/airport-alert-events/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: 'not_found' })
    const row = database().prepare(`SELECT id,icao,kind,payload,active,detected_at,resolved_at,read_at
      FROM airport_alert_events WHERE id=? AND user_id=?`).get(id, req.session.userId)
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json({ event: { id: `airport:${row.id}`, airportIcao: row.icao,
      airportName: airports.find((airport) => airport.icao === row.icao)?.nameKo ?? row.icao,
      kind: row.kind, payload: JSON.parse(row.payload), active: Boolean(row.active),
      createdAt: row.detected_at, resolvedAt: row.resolved_at, readAt: row.read_at } })
  })

  router.put('/airport-watches/:icao', (req, res) => {
    const icao = String(req.params.icao).toUpperCase()
    if (!AIRPORTS.has(icao)) return res.status(400).json({ error: 'unsupported_airport' })
    const parsed = airportAlertRulesSchema.safeParse(req.body?.rules)
    if (!parsed.success || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'invalid_input' })
    if (req.body.enabled && !Object.entries(parsed.data).some(([key, rule]) => key !== 'channels' && rule.enabled)) {
      return res.status(400).json({ error: 'no_enabled_conditions' })
    }
    const db2 = database()
    const now = new Date().toISOString()
    db2.transaction(() => {
      const previous = db2.prepare('SELECT enabled,rules,state FROM airport_alert_watches WHERE user_id=? AND icao=?').get(req.session.userId, icao)
      const withoutChannels = (value) => { const { channels: _channels, ...conditions } = value; return conditions }
      const conditionChanged = !previous || Boolean(previous.enabled) !== req.body.enabled
        || JSON.stringify(withoutChannels(JSON.parse(previous.rules))) !== JSON.stringify(withoutChannels(parsed.data))
      db2.prepare(`INSERT INTO airport_alert_watches (user_id,icao,enabled,rules,state,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,icao) DO UPDATE SET
        enabled=excluded.enabled,rules=excluded.rules,state=excluded.state,
        last_evaluated_at=CASE WHEN ? THEN NULL ELSE airport_alert_watches.last_evaluated_at END,
        updated_at=excluded.updated_at`)
        .run(req.session.userId, icao, Number(req.body.enabled), JSON.stringify(parsed.data), conditionChanged ? '{}' : previous.state, now, Number(conditionChanged))
      if (conditionChanged) db2.prepare('UPDATE airport_alert_events SET active=0,resolved_at=? WHERE user_id=? AND icao=? AND active=1')
        .run(now, req.session.userId, icao)
    })()
    res.json({ icao, enabled: req.body.enabled, rules: parsed.data })
  })

  router.delete('/airport-watches/:icao', (req, res) => {
    const icao = String(req.params.icao).toUpperCase()
    const db2 = database()
    const now = new Date().toISOString()
    db2.transaction(() => {
      db2.prepare('DELETE FROM airport_alert_watches WHERE user_id=? AND icao=?').run(req.session.userId, icao)
      db2.prepare('UPDATE airport_alert_events SET active=0,resolved_at=? WHERE user_id=? AND icao=? AND active=1')
        .run(now, req.session.userId, icao)
    })()
    res.json({ ok: true })
  })

  return router
}

export default createAirportWatchesRouter
