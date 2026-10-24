import { randomUUID } from 'node:crypto'
import { Router } from 'express'

import airports from '../../../shared/airports.js'
import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { sendPush } from '../push/send.js'
import { airportAlertBody, pushBodyWithinLimit } from '../airport-alerts/service.js'
import { airportAlertTitle, routeSigmetBody, routeSigmetTitle } from './content.js'
import { airportTestScenarios, evaluateAirportTest } from './airport-test.js'
import { evaluateRouteTest } from './route-sigmet.js'

const TEST_LIFETIME_MS = 24 * 60 * 60_000
const TEST_RATE_WINDOW_MS = 10 * 60_000
const TEST_RATE_LIMIT = 30

function publicRun(row) {
  return row ? {
    id: row.id, targetType: row.target_type, targetId: row.target_id,
    airportName: row.target_type === 'airport'
      ? airports.find((airport) => airport.icao === row.target_id)?.nameKo ?? row.target_id : null,
    routeId: row.target_type === 'route' ? Number(row.target_id) : null,
    scenario: row.scenario, kind: row.kind, payload: JSON.parse(row.payload),
    createdAt: row.created_at, expiresAt: row.expires_at, pushStatus: row.push_status,
    test: true,
  } : null
}

export function createAlertTestRouter({ db = null, sendPushImpl = sendPush, now = Date.now } = {}) {
  const router = Router()
  const database = () => db ?? getDb()
  router.use(requireAuth)

  router.get('/alert-tests/latest', (req, res) => {
    const icao = String(req.query.icao ?? '').toUpperCase()
    const routeId = Number(req.query.routeId)
    const targetType = Number.isSafeInteger(routeId) && routeId > 0 ? 'route' : 'airport'
    if (targetType === 'airport' && !/^[A-Z]{4}$/.test(icao)) return res.status(400).json({ error: 'invalid_target' })
    const row = database().prepare(`SELECT * FROM user_alert_test_runs
      WHERE user_id=? AND target_type=? AND target_id=? AND expires_at>?
      ORDER BY created_at DESC LIMIT 1`).get(req.session.userId, targetType,
      targetType === 'route' ? String(routeId) : icao, new Date(now()).toISOString())
    res.json({ test: publicRun(row) })
  })

  router.get('/alert-tests/:id', (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'not_found' })
    const row = database().prepare('SELECT * FROM user_alert_test_runs WHERE id=? AND user_id=? AND expires_at>?')
      .get(req.params.id, req.session.userId, new Date(now()).toISOString())
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json({ test: publicRun(row) })
  })

  router.post('/alert-tests', async (req, res) => {
    const icao = typeof req.body?.icao === 'string' ? req.body.icao.toUpperCase() : ''
    const scenario = req.body?.scenario
    const endpoint = req.body?.endpoint
    const routeWatchId = req.body?.routeWatchId
    const routeTest = scenario === 'sigmet'
    if ((routeTest ? !Number.isSafeInteger(routeWatchId) || routeWatchId <= 0 : !/^[A-Z]{4}$/.test(icao))
      || typeof scenario !== 'string'
      || (endpoint !== undefined && (typeof endpoint !== 'string' || endpoint.length > 2048))) {
      return res.status(400).json({ error: 'invalid_input' })
    }
    const db2 = database()
    const watch = routeTest
      ? db2.prepare('SELECT * FROM route_sigmet_watches WHERE user_id=? AND id=? AND enabled=1 AND deleted_at IS NULL')
        .get(req.session.userId, routeWatchId)
      : db2.prepare('SELECT * FROM airport_alert_watches WHERE user_id=? AND icao=? AND enabled=1')
        .get(req.session.userId, icao)
    if (!watch) return res.status(404).json({ error: 'watch_not_found' })
    if (!routeTest && !airportTestScenarios(JSON.parse(watch.rules)).includes(scenario)) {
      return res.status(400).json({ error: 'scenario_disabled' })
    }
    const instant = now()
    db2.prepare('DELETE FROM user_alert_test_runs WHERE expires_at<=?').run(new Date(instant).toISOString())
    const recent = db2.prepare('SELECT COUNT(*) n FROM user_alert_test_runs WHERE user_id=? AND created_at>=?')
      .get(req.session.userId, new Date(instant - TEST_RATE_WINDOW_MS).toISOString()).n
    if (recent >= TEST_RATE_LIMIT) return res.status(429).json({ error: 'test_rate_limited' })
    const subscription = endpoint ? db2.prepare('SELECT * FROM push_subscriptions WHERE user_id=? AND endpoint=?')
      .get(req.session.userId, endpoint) : null
    if (endpoint && !subscription) return res.status(400).json({ error: 'device_not_subscribed' })

    const result = routeTest ? evaluateRouteTest(watch, instant) : evaluateAirportTest(watch, scenario, instant)
    if (result.error) return res.status(422).json({ error: result.error })
    const id = randomUUID()
    const createdAt = new Date(instant).toISOString()
    const expiresAt = new Date(instant + TEST_LIFETIME_MS).toISOString()
    db2.prepare(`INSERT INTO user_alert_test_runs
      (id,user_id,target_type,target_id,scenario,kind,payload,created_at,expires_at,push_status)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.session.userId, routeTest ? 'route' : 'airport', routeTest ? String(watch.route_id) : icao, scenario, result.kind,
        JSON.stringify(result.payload), createdAt, expiresAt, endpoint ? 'pending' : 'not_requested')

    let pushStatus = 'not_requested'
    if (subscription) {
      try {
        await sendPushImpl({ endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, {
          title: `테스트 · ${routeTest ? routeSigmetTitle({ ...result.payload, routeName: watch.route_name }) : airportAlertTitle(result, icao)}`,
          body: routeTest ? `모의 자료 · ${routeSigmetBody(result.payload)}`
            : pushBodyWithinLimit(`모의 자료 · ${airportAlertBody({ kind: result.kind, payload: result.payload })}`),
          url: `/?alertTest=${id}`,
        })
        pushStatus = 'sent'
      } catch (error) {
        pushStatus = error?.statusCode === 404 || error?.statusCode === 410 ? 'expired_subscription' : 'failed'
        if (pushStatus === 'expired_subscription') db2.prepare('DELETE FROM push_subscriptions WHERE id=?').run(subscription.id)
        else console.warn(`[user-alert-test] push failed for user ${req.session.userId}:`, error?.message)
      }
      db2.prepare('UPDATE user_alert_test_runs SET push_status=? WHERE id=?').run(pushStatus, id)
    }
    const test = publicRun(db2.prepare('SELECT * FROM user_alert_test_runs WHERE id=?').get(id))
    res.status(201).json({ test })
  })

  return router
}

export function startAlertTestCleanup(db = getDb(), { intervalMs = 60 * 60_000 } = {}) {
  const cleanup = () => db.prepare('DELETE FROM user_alert_test_runs WHERE expires_at<=?').run(new Date().toISOString())
  cleanup()
  const timer = setInterval(cleanup, intervalMs)
  timer.unref?.()
  return timer
}

export default createAlertTestRouter
