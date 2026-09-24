import { createHash, randomBytes } from 'node:crypto'
import { routeSnapshot } from '../me/route-reader.js'
import { registerPersonalAlert, cancelPersonalAlert } from '../me/alert-service.js'
import { ListFlightAlertsSchema, PrepareFlightAlertSchema, ConfirmAlertSchema } from './alert-contracts.js'
import { localToUtc } from './model-context.js'

const REVIEW_TTL = 5 * 60_000, RECEIPT_TTL = 7 * 86400_000
const hash = (value) => createHash('sha256').update(value).digest('hex')
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }) }
const canonical = (value) => value == null ? null : new Date(value).toISOString()
// Monitoring writes its own snapshot/time metadata. Only fields relevant to the
// proposed user change invalidate review, never scheduler bookkeeping.
const targetHash = (row) => hash(JSON.stringify([row.id, row.user_id, row.name, row.payload, row.created_at,
  row.alert_enabled, row.etd, row.eta, row.alert_start_min_before_etd]))
const sourceId = (row) => routeSnapshot(row)?.sourceBriefingId ?? null
const summary = (row) => ({ alertId: row.id, routeId: sourceId(row), name: String(row.name ?? '').slice(0, 200),
  etd: row.etd, eta: row.eta, alertStartMinutes: row.alert_start_min_before_etd })
const errorCodes = new Set(['AUTH_REQUIRED', 'ACCOUNT_INACTIVE', 'INVALID_TOOL_INPUT', 'INVALID_LOCAL_TIME', 'INVALID_INPUT',
  'SAVED_ROUTE_NOT_FOUND', 'SAVED_ROUTE_CORRUPT', 'ORGANIZATION_CONTEXT_UNSUPPORTED', 'SAVED_ROUTE_REQUIRED',
  'SAVED_GEOMETRY_REQUIRED', 'SAVED_FLIGHT_CONDITIONS_REQUIRED', 'ALERT_NOT_FOUND', 'ETD_MUST_BE_FUTURE', 'INVALID_FLIGHT_WINDOW',
  'TARGET_CHANGED', 'CONFIRMATION_NOT_FOUND', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_CANCELLED', 'TOO_MANY_CONFIRMATIONS',
  'FLIGHT_ALREADY_REGISTERED', 'TOO_MANY_ROUTES', 'CANCELLED'])

export function createAlertTools({ database, now = Date.now }) {
  function actor(owner) {
    if (!/^user:[1-9]\d*$/.test(owner ?? '')) fail('AUTH_REQUIRED', 401)
    const userId = Number(owner.slice(5))
    if (!Number.isSafeInteger(userId)) fail('AUTH_REQUIRED', 401)
    if (database().prepare('SELECT status FROM users WHERE id=?').get(userId)?.status !== 'active') fail('ACCOUNT_INACTIVE', 403)
    return userId
  }
  const owned = (userId, id) => database().prepare('SELECT * FROM routes WHERE id=? AND user_id=?').get(id, userId)
  const enabled = (userId) => database().prepare('SELECT * FROM routes WHERE user_id=? AND alert_enabled=1 ORDER BY etd,id').all(userId)
  function target(userId, action, id) {
    const row = owned(userId, id)
    if (!row) fail(action === 'register' ? 'SAVED_ROUTE_NOT_FOUND' : 'ALERT_NOT_FOUND', 404)
    const snapshot = routeSnapshot(row)
    if (snapshot?.scope === 'organization' || snapshot?.briefingContext?.kind === 'organization') fail('ORGANIZATION_CONTEXT_UNSUPPORTED')
    if (action === 'cancel') {
      if (!row.alert_enabled) fail('ALERT_NOT_FOUND', 404)
      return row
    }
    if (!snapshot) fail('SAVED_ROUTE_CORRUPT')
    if (row.alert_enabled || snapshot.sourceBriefingId) fail('SAVED_ROUTE_REQUIRED')
    const geometry = snapshot.routeGeometry ?? snapshot.enrouteGeometry
    if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2
      || geometry.coordinates.length > 2000 || geometry.coordinates.some((point) => !Array.isArray(point) || point.length !== 2
        || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180 || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90)) fail('SAVED_GEOMETRY_REQUIRED')
    const form = snapshot.base?.routeForm ?? snapshot.routeForm
    if (!['IFR', 'VFR'].includes(form?.flightRule) || !/^[A-Z]{4}$/.test(form?.departureAirport ?? '')
      || !/^[A-Z]{4}$/.test(form?.arrivalAirport ?? '') || !Number.isInteger(snapshot.cruiseAltitudeFt)
      || snapshot.cruiseAltitudeFt < 500 || snapshot.cruiseAltitudeFt > 60000) fail('SAVED_FLIGHT_CONDITIONS_REQUIRED')
    return row
  }
  function flightTime(etd, eta) {
    if (!Number.isFinite(Date.parse(etd)) || Date.parse(etd) <= now()) fail('ETD_MUST_BE_FUTURE')
    if (eta != null && (!(Date.parse(eta) > Date.parse(etd)) || Date.parse(eta) - Date.parse(etd) > 48 * 3600_000)) fail('INVALID_FLIGHT_WINDOW')
  }
  function envelope(data, status = 'ok') {
    return { status, reference: { effectiveNow: new Date(now()).toISOString() }, data, issues: [] }
  }
  function list(input, owner) {
    const parsed = ListFlightAlertsSchema.safeParse(input)
    if (!parsed.success) fail('INVALID_TOOL_INPUT')
    const { route_id, offset, limit } = parsed.data
    const matches = enabled(actor(owner)).filter((row) => {
      const snapshot = routeSnapshot(row)
      return snapshot?.scope !== 'organization' && snapshot?.briefingContext?.kind !== 'organization'
        && (route_id == null || sourceId(row) === route_id)
    })
    return envelope({ flights: matches.slice(offset, offset + limit).map(summary), total: matches.length,
      nextOffset: offset + limit < matches.length ? offset + limit : null,
      note: '본인 예정 비행의 감시 행입니다. 같은 원본의 여러 ETD는 서로 다른 alertId입니다. 아직 변경하지 않았습니다.' })
  }
  function prepare(input, owner) {
    const { displayTimezone = 'Asia/Seoul', ...raw } = input ?? {}
    const parsed = PrepareFlightAlertSchema.safeParse(raw)
    if (!parsed.success || !['Asia/Seoul', 'UTC'].includes(displayTimezone)) fail('INVALID_TOOL_INPUT')
    const userId = actor(owner), args = parsed.data
    if (args.action === 'register' && args.alert_id !== undefined) fail('INVALID_TOOL_INPUT')
    if (args.action === 'cancel' && Object.keys(args).some((key) => !['action', 'alert_id'].includes(key))) fail('INVALID_TOOL_INPUT')
    const etd = args.departureLocal ? localToUtc(args.departureLocal, displayTimezone) : canonical(args.etd)
    const eta = args.arrivalLocal ? localToUtc(args.arrivalLocal, displayTimezone) : canonical(args.eta)
    const missingFields = args.action === 'register'
      ? [!args.route_id && 'route_id', !etd && 'etd'].filter(Boolean) : !args.alert_id ? ['alert_id'] : []
    if (missingFields.length) return envelope({ preparationState: 'input_required', missingFields,
      note: '대상과 날짜가 있는 출발시각을 확인하세요. 저장 시각을 재사용하거나 확인 없이 실행하지 않았습니다.' }, 'partial')
    if (args.action === 'register') flightTime(etd, eta)
    const row = target(userId, args.action, args.action === 'register' ? args.route_id : args.alert_id)
    const proposal = args.action === 'register' ? { action: 'register', routeId: row.id, alertId: null,
      name: String(row.name ?? '').slice(0, 200), etd, eta, alertStartMinutes: args.alert_start_minutes ?? 360 }
      : { ...summary(row), action: 'cancel' }
    const db = database(), time = now(), expiresAt = new Date(time + REVIEW_TTL).toISOString()
    const confirmationToken = `confirm_${randomBytes(32).toString('hex')}`
    db.transaction(() => {
      // Expired pending proposals and old receipts can be forgotten safely:
      // unknown tokens never execute. No route/notification records are pruned.
      db.prepare("DELETE FROM ai_confirmations WHERE (state='pending' AND expires_at<=?) OR created_at<?")
        .run(new Date(time).toISOString(), new Date(time - RECEIPT_TTL).toISOString())
      if (db.prepare('SELECT COUNT(*) n FROM ai_confirmations WHERE user_id=?').get(userId).n >= 256) fail('TOO_MANY_CONFIRMATIONS', 429)
      db.prepare(`INSERT INTO ai_confirmations(token_hash,user_id,proposal,target_hash,state,expires_at,created_at)
        VALUES(?,?,?,?,'pending',?,?)`).run(hash(confirmationToken), userId, JSON.stringify(proposal), targetHash(row), expiresAt, new Date(time).toISOString())
    }).immediate()
    return envelope({ preparationState: 'awaiting_user_confirmation', proposal, expiresAt, confirmationToken,
      note: '변경안만 준비했습니다. 실제 확인 버튼을 눌러야 실행됩니다. 기본 감시 시작은 ETD 6시간 전이며 카드에 표시합니다. ETA 미지정이면 도착시각 평가가 제한됩니다. 기상 변화 감시 등록은 기기 푸시 권한/수신 보장이 아닙니다.' })
  }
  function confirm(input, owner) {
    const parsed = ConfirmAlertSchema.safeParse(input)
    if (!parsed.success) fail('INVALID_INPUT')
    const userId = actor(owner), db = database(), tokenHash = hash(parsed.data.confirmationToken)
    return db.transaction(() => {
      const review = db.prepare('SELECT * FROM ai_confirmations WHERE token_hash=? AND user_id=?').get(tokenHash, userId)
      if (!review) fail('CONFIRMATION_NOT_FOUND', 404)
      if (review.state === 'executed') return { ...JSON.parse(review.result), replayed: true }
      if (review.state === 'cancelled') {
        if (parsed.data.decision === 'cancel') return { status: 'cancelled', executed: false, replayed: true }
        fail('CONFIRMATION_CANCELLED', 409)
      }
      if (Date.parse(review.expires_at) <= now()) fail('CONFIRMATION_EXPIRED', 409)
      const completedAt = new Date(now()).toISOString()
      if (parsed.data.decision === 'cancel') {
        db.prepare("UPDATE ai_confirmations SET state='cancelled',completed_at=? WHERE token_hash=?").run(completedAt, tokenHash)
        return { status: 'cancelled', executed: false }
      }
      const proposal = JSON.parse(review.proposal)
      const row = target(userId, proposal.action, proposal.action === 'register' ? proposal.routeId : proposal.alertId)
      if (targetHash(row) !== review.target_hash) fail('TARGET_CHANGED', 409)
      let outcome, alertId = proposal.alertId
      if (proposal.action === 'register') {
        flightTime(proposal.etd, proposal.eta)
        const existing = enabled(userId).find((item) => sourceId(item) === proposal.routeId && Date.parse(item.etd) === Date.parse(proposal.etd))
        if (existing) {
          if ((existing.eta != null && !Number.isFinite(Date.parse(existing.eta)))
            || canonical(existing.eta) !== proposal.eta || existing.alert_start_min_before_etd !== proposal.alertStartMinutes
            || hash(JSON.stringify({ ...routeSnapshot(row), sourceBriefingId: row.id })) !== hash(existing.payload ?? '')) fail('FLIGHT_ALREADY_REGISTERED', 409)
          alertId = existing.id; outcome = 'already_registered'
        } else {
          try { alertId = registerPersonalAlert(db, userId, { templateId: proposal.routeId, etd: proposal.etd,
            eta: proposal.eta, alertStartMinBeforeEtd: proposal.alertStartMinutes }, { now: now() }).id }
          catch (error) {
            if (error.code === 'too_many_routes') fail('TOO_MANY_ROUTES')
            if (error.code === 'etd_must_be_future') fail('ETD_MUST_BE_FUTURE')
            throw error
          }
          outcome = 'registered'
        }
      } else outcome = cancelPersonalAlert(db, userId, proposal.alertId, { now: now() }).outcome
      const result = { status: 'executed', action: proposal.action, outcome, alertId, routeId: proposal.routeId,
        etd: proposal.etd, eta: proposal.eta, completedAt, replayed: false }
      db.prepare("UPDATE ai_confirmations SET state='executed',result=?,completed_at=? WHERE token_hash=?")
        .run(JSON.stringify(result), completedAt, tokenHash)
      return result
    }).immediate()
  }
  return {
    confirm,
    async call(name, args, owner, signal) {
      try {
        if (signal?.aborted) fail('CANCELLED')
        if (name === 'list_my_flight_alerts') return list(args, owner)
        if (name === 'prepare_flight_alert') return prepare(args, owner)
        fail('INVALID_TOOL_INPUT')
      } catch (error) { return { status: 'error', error: { code: errorCodes.has(error.code) ? error.code : 'ALERT_PREPARATION_FAILED' } } }
    },
  }
}
