import store from '../store.js'
import { getDb } from '../db/index.js'
import { isDemoMode } from '../dev/demo-mode.js'
import { evaluateAirportWatch } from './evaluate.js'
import { dispatchPendingUserAlerts } from '../user-alerts/delivery.js'
export { airportAlertBody, pushBodyWithinLimit } from '../user-alerts/content.js'

const TICK_MS = 60_000

export function currentAirportAlertWeather() {
  return { metar: store.getCached('metar'), taf: store.getCached('taf'), tafOverseas: store.getCached('taf_overseas'), warning: store.getCached('warning'), lightning: store.getCached('lightning') }
}

export async function deliverAirportAlerts(db, events, { sendPushImpl } = {}) {
  if (!events.length) return { sent: 0, skipped: 'no_events' }
  return dispatchPendingUserAlerts(db, { sendPushImpl })
}

export async function runAirportAlertTick(db = getDb(), { weather = currentAirportAlertWeather(), nowMs = Date.now(), sendPushImpl, deliver = true, queue = true, userId = null } = {}) {
  const watches = userId == null
    ? db.prepare('SELECT * FROM airport_alert_watches WHERE enabled=1 ORDER BY user_id,icao').all()
    : db.prepare('SELECT * FROM airport_alert_watches WHERE enabled=1 AND user_id=? ORDER BY icao').all(userId)
  let evaluated = 0
  let created = 0
  for (const watch of watches) {
    try {
      const events = db.transaction(() => evaluateAirportWatch(db, { ...watch, suppressDelivery: !queue }, weather, nowMs))()
      evaluated++
      created += events.length
    } catch (error) {
      console.error(`[airport-alert] ${watch.user_id}/${watch.icao} evaluation failed:`, error?.message)
    }
  }
  if (deliver) await dispatchPendingUserAlerts(db, { sendPushImpl, nowMs })
  return { evaluated, created }
}

export function startAirportAlertScheduler(db = getDb(), { intervalMs = TICK_MS } = {}) {
  let running = false
  const tick = async () => {
    if (running || isDemoMode()) return
    running = true
    try { await runAirportAlertTick(db) }
    catch (error) { console.error('[airport-alert] tick failed:', error?.message) }
    finally { running = false }
  }
  void tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
