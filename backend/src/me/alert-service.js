import { routeSnapshot } from './route-reader.js'

export const ALERT_EXPIRE_MS = 3 * 60 * 60 * 1000
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }) }

// Shared mutations for the existing account UI and the separately confirmed AI
// workflow. No scheduler/send calls: registration only creates a monitoring row.
export function registerPersonalAlert(db, userId, { templateId, etd, eta = null, alertStartMinBeforeEtd = 360 }, { now = Date.now() } = {}) {
  const etdMs = Date.parse(etd), etaMs = eta == null ? null : Date.parse(eta)
  if (!Number.isFinite(etdMs) || etdMs <= now) fail('etd_must_be_future')
  if (eta != null && (!Number.isFinite(etaMs) || etaMs <= etdMs)) fail('eta_after_etd')
  const tpl = db.prepare('SELECT name, payload FROM routes WHERE id=? AND user_id=?').get(templateId, userId)
  if (!tpl) fail('template_not_found', 404)
  if (db.prepare('SELECT COUNT(*) n FROM routes WHERE user_id=?').get(userId).n >= 100) fail('too_many_routes')
  const nowIso = new Date(now).toISOString()
  const payload = JSON.stringify({ ...(routeSnapshot(tpl) ?? {}), sourceBriefingId: templateId })
  const info = db.prepare(`INSERT INTO routes
    (user_id,name,etd,eta,payload,alert_enabled,alert_start_min_before_etd,send_no_change_confirm,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,0,?,?,?)`).run(userId, tpl.name, etd, eta, payload, alertStartMinBeforeEtd,
    new Date(etdMs + ALERT_EXPIRE_MS).toISOString(), nowIso, nowIso)
  return { id: Number(info.lastInsertRowid) }
}

export function cancelPersonalAlert(db, userId, id, { now = Date.now() } = {}) {
  try {
    const deleted = db.prepare('DELETE FROM routes WHERE id=? AND user_id=? AND alert_enabled=1').run(id, userId)
    return { ok: true, outcome: deleted.changes ? 'deleted' : 'not_active' }
  } catch (error) {
    // Preserve notification history on FK failure, not on unrelated DB errors.
    if (error.code !== 'SQLITE_CONSTRAINT_FOREIGNKEY') throw error
    db.prepare('UPDATE routes SET alert_enabled=0, updated_at=? WHERE id=? AND user_id=? AND alert_enabled=1')
      .run(new Date(now).toISOString(), id, userId)
    return { ok: true, outcome: 'disabled' }
  }
}
