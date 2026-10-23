import { sendPush } from '../push/send.js'
import { airportAlertBody, pushBodyWithinLimit } from './content.js'

const MAX_ATTEMPTS = 5

// 판정기의 INSERT와 같은 DB 트랜잭션에서 호출한다. 서버가 발송 전에 재시작해도
// 대기 중인 기기별 발송은 다음 공통 tick에서 복구된다.
export function queueUserAlertDeliveries(db, { source, eventId, userId, pushEnabled = true, nowIso }) {
  if (!pushEnabled) return 0
  const result = db.prepare(`INSERT OR IGNORE INTO user_alert_deliveries
    (source,event_id,subscription_id,endpoint,user_id,next_attempt_at)
    SELECT ?,?,id,endpoint,?,? FROM push_subscriptions WHERE user_id=?`)
    .run(source, eventId, userId, nowIso, userId)
  return result.changes
}

function eventForDelivery(db, source, eventId, userId) {
  if (source === 'airport') {
    const row = db.prepare('SELECT id,kind,payload FROM airport_alert_events WHERE id=? AND user_id=?').get(eventId, userId)
    if (!row) return null
    const payload = JSON.parse(row.payload)
    return { title: payload.title, body: pushBodyWithinLimit(airportAlertBody({ kind: row.kind, payload })),
      url: `/?alert=airport:${row.id}` }
  }
  const row = db.prepare('SELECT id,payload FROM route_sigmet_events WHERE id=? AND user_id=?').get(eventId, userId)
  if (!row) return null
  const payload = JSON.parse(row.payload)
  return { title: payload.title,
    body: `${payload.phenomenon} · 유효 ${payload.validFrom} – ${payload.validTo}`,
    url: `/?alert=route:${row.id}` }
}

export async function dispatchPendingUserAlerts(db, { sendPushImpl = sendPush, nowMs = Date.now(), limit = 200 } = {}) {
  const nowIso = new Date(nowMs).toISOString()
  const pending = db.prepare(`SELECT d.*,s.endpoint AS current_endpoint,s.p256dh,s.auth,s.user_id AS subscription_user_id
    FROM user_alert_deliveries d LEFT JOIN push_subscriptions s ON s.id=d.subscription_id
    WHERE d.state IN ('queued','retry') AND d.next_attempt_at<=?
    ORDER BY d.next_attempt_at,d.event_id LIMIT ?`).all(nowIso, limit)
  const summary = { sent: 0, retried: 0, expired: 0, failed: 0 }
  for (const item of pending) {
    const payload = eventForDelivery(db, item.source, item.event_id, item.user_id)
    if (!item.current_endpoint || item.current_endpoint !== item.endpoint
      || item.subscription_user_id !== item.user_id || !payload) {
      db.prepare(`UPDATE user_alert_deliveries SET state='expired',last_error='subscription_or_event_missing'
        WHERE source=? AND event_id=? AND subscription_id=?`).run(item.source, item.event_id, item.subscription_id)
      summary.expired++
      continue
    }
    try {
      await sendPushImpl({ endpoint: item.current_endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, payload)
      db.transaction(() => {
        db.prepare(`UPDATE user_alert_deliveries SET state='sent',attempts=attempts+1,sent_at=?,last_error=NULL
          WHERE source=? AND event_id=? AND subscription_id=?`)
          .run(nowIso, item.source, item.event_id, item.subscription_id)
        const table = item.source === 'airport' ? 'airport_alert_events' : 'route_sigmet_events'
        db.prepare(`UPDATE ${table} SET pushed_at=COALESCE(pushed_at,?) WHERE id=? AND user_id=?`)
          .run(nowIso, item.event_id, item.user_id)
      })()
      summary.sent++
    } catch (error) {
      const expired = error?.statusCode === 404 || error?.statusCode === 410
      const attempts = item.attempts + 1
      const state = expired ? 'expired' : attempts >= MAX_ATTEMPTS ? 'failed' : 'retry'
      const next = new Date(nowMs + Math.min(60, 2 ** attempts) * 60_000).toISOString()
      db.prepare(`UPDATE user_alert_deliveries SET state=?,attempts=?,next_attempt_at=?,last_error=?
        WHERE source=? AND event_id=? AND subscription_id=?`)
        .run(state, attempts, next, String(error?.message ?? 'push_failed').slice(0, 300),
          item.source, item.event_id, item.subscription_id)
      if (expired) {
        db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').run(item.subscription_id, item.user_id)
        summary.expired++
      } else if (state === 'retry') summary.retried++
      else summary.failed++
    }
  }
  return summary
}
