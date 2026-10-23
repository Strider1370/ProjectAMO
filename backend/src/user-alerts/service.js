import { getDb } from '../db/index.js'
import { isDemoMode } from '../dev/demo-mode.js'
import { runAirportAlertTick } from '../airport-alerts/service.js'
import { runRouteSigmetTick } from './route-sigmet.js'
import { dispatchPendingUserAlerts } from './delivery.js'

// 사용자 알림의 유일한 주기 실행 지점. 종류별 판정은 독립적으로 실패할 수 있지만
// 기기 발송 대기열은 마지막에 반드시 한 번 처리한다.
export async function runUserAlertTick(db = getDb(), options = {}) {
  const nowMs = options.nowMs ?? Date.now()
  const result = { airport: null, route: null, delivery: null }
  try { result.airport = await runAirportAlertTick(db, { weather: options.airportWeather, nowMs,
    deliver: false, queue: options.queue !== false, userId: options.userId ?? null }) }
  catch (error) { console.error('[user-alert] airport evaluation failed:', error?.message) }
  try { result.route = await runRouteSigmetTick(db, { data: options.sigmetWeather, nowMs,
    deliver: false, queue: options.queue !== false, userId: options.userId ?? null }) }
  catch (error) { console.error('[user-alert] route evaluation failed:', error?.message) }
  result.delivery = options.deliver === false ? { skipped: 'disabled' }
    : await dispatchPendingUserAlerts(db, { sendPushImpl: options.sendPushImpl, nowMs })
  return result
}

export function startUserAlertScheduler(db = getDb(), { intervalMs = 60_000 } = {}) {
  let running = false
  const tick = async () => {
    if (running || isDemoMode()) return
    running = true
    try { await runUserAlertTick(db) }
    catch (error) { console.error('[user-alert] tick failed:', error?.message) }
    finally { running = false }
  }
  void tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
