import {
  OrganizationError,
  assertRole,
  assertVersion,
  expectedVersion,
  integerId,
  json,
  nowIso,
  optionalText,
  requireText,
  validInstant,
} from './common.js'
import { isValidOrganizationGeometry } from './geometry.js'
import { validateOrganizationBlocks } from './content.js'

const stringify = (value, fallback) => JSON.stringify(value ?? fallback)

export function toOrganization(row) {
  return row && {
    id: row.id,
    name: row.name,
    version: row.version,
    settings: json(row.settings, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toMember(row) {
  return row && {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createOrganization(db, { name, adminUserId, actorUserId, settings = {} }) {
  const adminId = integerId(adminUserId, 'adminUserId')
  const actorId = integerId(actorUserId, 'actorUserId')
  const organizationName = requireText(name, 'name')
  const user = db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(adminId)
  if (!user) throw new OrganizationError(400, 'invalid_admin_user')
  return db.transaction(() => {
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organizations (name, settings, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run(organizationName, stringify(settings, {}), actorId, now, now)
    db.prepare(`INSERT INTO organization_members
      (organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, 'admin', 'active', ?, ?)`)
      .run(info.lastInsertRowid, adminId, now, now)
    return toOrganization(db.prepare('SELECT * FROM organizations WHERE id=?').get(info.lastInsertRowid))
  })()
}

export function listUserOrganizations(db, userId) {
  return db.prepare(`
    SELECT o.*, m.role AS member_role, m.version AS member_version
      FROM organizations o JOIN organization_members m ON m.organization_id=o.id
      JOIN users u ON u.id=m.user_id
     WHERE m.user_id=? AND m.status='active' AND u.status='active'
     ORDER BY o.name, o.id
  `).all(userId).map((row) => ({ ...toOrganization(row), role: row.member_role, memberVersion: row.member_version }))
}

export function getOrganization(db, organizationId) {
  const row = db.prepare('SELECT * FROM organizations WHERE id=?').get(organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return toOrganization(row)
}

export function updateOrganization(db, organizationId, body) {
  const row = db.prepare('SELECT * FROM organizations WHERE id=?').get(organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  assertVersion(row.version, body.expectedVersion)
  const name = body.name == null ? row.name : requireText(body.name, 'name')
  const settings = body.settings == null ? json(row.settings, {}) : body.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new OrganizationError(400, 'invalid_input', { field: 'settings' })
  const now = nowIso()
  const result = db.prepare(`UPDATE organizations SET name=?, settings=?, version=version+1, updated_at=?
    WHERE id=? AND version=?`).run(name, stringify(settings, {}), now, organizationId, row.version)
  if (result.changes !== 1) throw new OrganizationError(409, 'version_conflict')
  return getOrganization(db, organizationId)
}

export function listMembers(db, organizationId) {
  return db.prepare(`SELECT m.*, u.username, u.display_name FROM organization_members m
    JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.status, u.display_name, u.username`)
    .all(organizationId).map(toMember)
}

function activeAdminCount(db, organizationId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM organization_members
    WHERE organization_id=? AND role='admin' AND status='active'`).get(organizationId).n
}

export function putMember(db, organizationId, userId, body) {
  const id = integerId(userId, 'userId')
  const role = assertRole(body.role)
  const status = body.status ?? 'active'
  if (!['active', 'inactive'].includes(status)) throw new OrganizationError(400, 'invalid_input', { field: 'status' })
  const user = db.prepare('SELECT id, status FROM users WHERE id=?').get(id)
  if (!user) throw new OrganizationError(404, 'user_not_found')
  if (status === 'active' && user.status !== 'active') throw new OrganizationError(400, 'member_user_not_active')
  const existing = db.prepare('SELECT * FROM organization_members WHERE organization_id=? AND user_id=?').get(organizationId, id)
  const now = nowIso()
  if (!existing) {
    db.prepare(`INSERT INTO organization_members
      (organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
      .run(organizationId, id, role, status, now, now)
  } else {
    assertVersion(existing.version, body.expectedVersion)
    if (existing.role === 'admin' && existing.status === 'active' && (role !== 'admin' || status !== 'active')
      && activeAdminCount(db, organizationId) <= 1) throw new OrganizationError(409, 'last_organization_admin')
    const result = db.prepare(`UPDATE organization_members SET role=?,status=?,version=version+1,updated_at=?
      WHERE organization_id=? AND user_id=? AND version=?`)
      .run(role, status, now, organizationId, id, existing.version)
    if (result.changes !== 1) throw new OrganizationError(409, 'version_conflict')
  }
  return toMember(db.prepare(`SELECT m.*,u.username,u.display_name FROM organization_members m
    JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=?`).get(organizationId, id))
}

function flightRow(db, organizationId, flightId, version = null) {
  const row = db.prepare(`SELECT f.*, v.version AS version, v.name, v.etd, v.eta, v.snapshot, v.profile_request,
      v.blocks, v.annotations, v.material_refs, v.created_by AS version_created_by, v.created_at AS version_created_at,
      u.display_name AS assigned_display_name, u.username AS assigned_username
    FROM organization_flights f
    JOIN organization_flight_versions v ON v.flight_id=f.id AND v.version=COALESCE(?,f.current_version)
    LEFT JOIN users u ON u.id=f.assigned_user_id
    WHERE f.organization_id=? AND f.id=?`).get(version, organizationId, flightId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

export function toFlight(row) {
  return {
    id: row.id,
    orgId: row.organization_id,
    name: row.name,
    version: row.version,
    assignedUserId: row.assigned_user_id,
    assignedDisplayName: row.assigned_display_name ?? row.assigned_username ?? null,
    etd: row.etd,
    eta: row.eta,
    status: row.status,
    snapshot: json(row.snapshot, {}),
    profileRequest: json(row.profile_request, {}),
    blocks: json(row.blocks, []),
    annotations: json(row.annotations, []),
    materialRefs: json(row.material_refs, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versionCreatedAt: row.version_created_at,
  }
}

function rejectCreatedByMutation(body) {
  if (body && Object.prototype.hasOwnProperty.call(body, 'createdBy')) {
    throw new OrganizationError(400, 'invalid_input', { field: 'createdBy', reason: 'immutable' })
  }
}

function validateFlightInput(db, organizationId, body, prior = null) {
  rejectCreatedByMutation(body)
  const snapshot = body.snapshot ?? prior?.snapshot
  const profileRequest = body.profileRequest ?? prior?.profileRequest
  const geometry = snapshot?.routeGeometry ?? snapshot?.enrouteGeometry ?? profileRequest?.routeGeometry
  if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 3) {
    throw new OrganizationError(400, 'invalid_input', { field: 'snapshot', reason: 'v3_required' })
  }
  if (!isValidOrganizationGeometry(geometry, ['LineString'])) {
    throw new OrganizationError(400, 'invalid_input', { field: 'snapshot.routeGeometry' })
  }
  if (!profileRequest || typeof profileRequest !== 'object') throw new OrganizationError(400, 'invalid_input', { field: 'profileRequest' })
  const etd = validInstant(body.etd ?? prior?.etd, 'etd')
  const eta = validInstant(body.eta ?? prior?.eta, 'eta')
  if (Date.parse(eta) <= Date.parse(etd)) throw new OrganizationError(400, 'invalid_input', { field: 'eta', reason: 'must_follow_etd' })
  const assignedUserId = integerId(body.assignedUserId ?? prior?.assignedUserId, 'assignedUserId')
  const blocks = validateOrganizationBlocks(db, organizationId, body.blocks ?? prior?.blocks ?? [], {
    allowSpeakerNotes: true, maxBlocks: 500,
  })
  const annotations = body.annotations ?? prior?.annotations ?? []
  const materialRefs = body.materialRefs ?? prior?.materialRefs ?? []
  if (!Array.isArray(annotations) || !Array.isArray(materialRefs)
    || annotations.length > 500 || materialRefs.length > 500) {
    throw new OrganizationError(400, 'invalid_input', { field: 'linkedContent' })
  }
  return {
    name: requireText(body.name ?? prior?.name, 'name'),
    assignedUserId,
    etd,
    eta,
    status: body.status ?? prior?.status ?? 'scheduled',
    snapshot,
    profileRequest: { ...profileRequest, routeGeometry: profileRequest.routeGeometry ?? geometry },
    blocks,
    annotations,
    materialRefs,
  }
}

function validateAssignedMember(db, organizationId, userId) {
  const row = db.prepare(`SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=? AND m.user_id=? AND m.status='active' AND u.status='active'`).get(organizationId, userId)
  if (!row) throw new OrganizationError(400, 'assigned_user_not_active_member')
}

function resolveMaterialRefs(db, organizationId, refs) {
  if (!Array.isArray(refs)) throw new OrganizationError(400, 'invalid_input', { field: 'materialRefs' })
  if (refs.length > 500) throw new OrganizationError(400, 'invalid_input', { field: 'materialRefs', reason: 'too_many' })
  const seen = new Set()
  return refs.map((input) => {
    const id = integerId(typeof input === 'object' ? input.id ?? input.materialId : input, 'materialId')
    if (seen.has(id)) throw new OrganizationError(400, 'invalid_input', { field: 'materialRefs', reason: 'duplicate' })
    seen.add(id)
    const material = db.prepare(`SELECT current_version FROM organization_materials
      WHERE id=? AND organization_id=? AND deleted_at IS NULL`).get(id, organizationId)
    if (!material) throw new OrganizationError(400, 'invalid_material_reference')
    const version = input && typeof input === 'object' && (input.version ?? input.materialVersion) != null
      ? expectedVersion(input.version ?? input.materialVersion) : material.current_version
    const exists = db.prepare('SELECT 1 FROM organization_material_versions WHERE material_id=? AND version=?').get(id, version)
    if (!exists) throw new OrganizationError(400, 'invalid_material_reference')
    return { id, version }
  })
}

export function createFlight(db, organizationId, body, actorUserId) {
  const value = validateFlightInput(db, organizationId, body)
  validateAssignedMember(db, organizationId, value.assignedUserId)
  value.materialRefs = resolveMaterialRefs(db, organizationId, value.materialRefs)
  if (!['scheduled', 'cancelled', 'completed'].includes(value.status)) throw new OrganizationError(400, 'invalid_input', { field: 'status' })
  return db.transaction(() => {
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organization_flights
      (organization_id,assigned_user_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
      .run(organizationId, value.assignedUserId, value.status, actorUserId, now, now)
    db.prepare(`INSERT INTO organization_flight_versions
      (flight_id,version,name,etd,eta,snapshot,profile_request,blocks,annotations,material_refs,created_by,created_at)
      VALUES (?,1,?,?,?,?,?,?,?,?,?,?)`).run(info.lastInsertRowid, value.name, value.etd, value.eta,
      stringify(value.snapshot, {}), stringify(value.profileRequest, {}), stringify(value.blocks, []),
      stringify(value.annotations, []), stringify(value.materialRefs, []), actorUserId, now)
    return toFlight(flightRow(db, organizationId, info.lastInsertRowid))
  })()
}

export function shareSavedRoute(db, organizationId, body, actorUserId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new OrganizationError(400, 'invalid_input')
  }
  const allowed = new Set(['savedRouteId', 'name', 'etd', 'eta', 'cruiseAltitudeFt'])
  const unknown = Object.keys(body).find((key) => !allowed.has(key))
  if (unknown) throw new OrganizationError(400, 'invalid_input', { field: unknown })

  const savedRouteId = integerId(body.savedRouteId, 'savedRouteId')
  const row = db.prepare('SELECT id,name,payload FROM routes WHERE id=? AND user_id=?')
    .get(savedRouteId, integerId(actorUserId, 'actorUserId'))
  if (!row) throw new OrganizationError(404, 'saved_route_not_found')

  let source
  try { source = JSON.parse(row.payload) } catch { /* handled by the boundary validation below */ }
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || !['route', 'briefing'].includes(source.kind ?? 'route')) {
    throw new OrganizationError(400, 'invalid_saved_route')
  }

  const etd = body.etd ?? source.etd
  const eta = body.eta ?? source.eta
  const altitudeInput = body.cruiseAltitudeFt ?? source.cruiseAltitudeFt ?? source.profileRequest?.plannedCruiseAltitudeFt
  if (etd == null || etd === '') throw new OrganizationError(400, 'invalid_input', { field: 'etd', reason: 'required' })
  if (eta == null || eta === '') throw new OrganizationError(400, 'invalid_input', { field: 'eta', reason: 'required' })
  const cruiseAltitudeFt = Number(altitudeInput)
  if (!Number.isFinite(cruiseAltitudeFt) || cruiseAltitudeFt <= 0 || cruiseAltitudeFt > 60000) {
    throw new OrganizationError(400, 'invalid_input', { field: 'cruiseAltitudeFt' })
  }
  if (!source.profileRequest || typeof source.profileRequest !== 'object' || Array.isArray(source.profileRequest)) {
    throw new OrganizationError(400, 'invalid_input', { field: 'savedRouteId', reason: 'profile_request_required' })
  }

  const snapshot = {
    ...source,
    etd,
    eta,
    cruiseAltitudeFt,
  }
  return createFlight(db, organizationId, {
    name: body.name ?? row.name ?? '이름 없는 경로',
    assignedUserId: actorUserId,
    etd,
    eta,
    status: 'scheduled',
    snapshot,
    profileRequest: { ...source.profileRequest, plannedCruiseAltitudeFt: cruiseAltitudeFt },
    blocks: [],
    annotations: [],
    materialRefs: [],
  }, actorUserId)
}

export function listFlights(db, organizationId, { from = null, to = null, assignedUserId = null } = {}) {
  const clauses = ['f.organization_id=?']
  const params = [organizationId]
  if (from) { clauses.push('v.etd>=?'); params.push(validInstant(from, 'from')) }
  if (to) { clauses.push('v.etd<?'); params.push(validInstant(to, 'to')) }
  if (assignedUserId) { clauses.push('f.assigned_user_id=?'); params.push(integerId(assignedUserId, 'assignedUserId')) }
  return db.prepare(`SELECT f.*,v.version,v.name,v.etd,v.eta,v.snapshot,v.profile_request,v.blocks,v.annotations,
      v.material_refs,v.created_at AS version_created_at,u.display_name AS assigned_display_name,u.username AS assigned_username
    FROM organization_flights f JOIN organization_flight_versions v ON v.flight_id=f.id AND v.version=f.current_version
    LEFT JOIN users u ON u.id=f.assigned_user_id WHERE ${clauses.join(' AND ')} ORDER BY v.etd,f.id`)
    .all(...params).map(toFlight)
}

export function getFlight(db, organizationId, flightId, version = null) {
  return toFlight(flightRow(db, organizationId, integerId(flightId, 'flightId'), version == null ? null : expectedVersion(version)))
}

export function updateFlight(db, organizationId, flightId, body, actorUserId) {
  return db.transaction(() => {
    const current = toFlight(flightRow(db, organizationId, integerId(flightId, 'flightId')))
    assertVersion(current.version, body.expectedVersion)
    const value = validateFlightInput(db, organizationId, body, current)
    validateAssignedMember(db, organizationId, value.assignedUserId)
    value.materialRefs = resolveMaterialRefs(db, organizationId, value.materialRefs)
    if (!['scheduled', 'cancelled', 'completed'].includes(value.status)) throw new OrganizationError(400, 'invalid_input', { field: 'status' })
    const next = current.version + 1
    const now = nowIso()
    db.prepare(`INSERT INTO organization_flight_versions
      (flight_id,version,name,etd,eta,snapshot,profile_request,blocks,annotations,material_refs,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(current.id, next, value.name, value.etd, value.eta,
      stringify(value.snapshot, {}), stringify(value.profileRequest, {}), stringify(value.blocks, []),
      stringify(value.annotations, []), stringify(value.materialRefs, []), actorUserId, now)
    const result = db.prepare(`UPDATE organization_flights SET assigned_user_id=?,status=?,current_version=?,updated_at=?
      WHERE id=? AND organization_id=? AND current_version=?`)
      .run(value.assignedUserId, value.status, next, now, current.id, organizationId, current.version)
    if (result.changes !== 1) throw new OrganizationError(409, 'version_conflict')
    return toFlight(flightRow(db, organizationId, current.id))
  })()
}

function toInterest(row) {
  return row && {
    id: row.id, orgId: row.organization_id, kind: row.kind, name: row.name, icao: row.icao,
    geometry: json(row.geometry, null), lightningRadiusKm: row.lightning_radius_km,
    lightningWindowMinutes: row.lightning_window_minutes, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function interestInput(body, prior = null) {
  const kind = body.kind ?? prior?.kind
  if (!['airport', 'region'].includes(kind)) throw new OrganizationError(400, 'invalid_input', { field: 'kind' })
  const icao = kind === 'airport' ? requireText(body.icao ?? prior?.icao, 'icao', 4).toUpperCase() : null
  if (icao && !/^[A-Z]{4}$/.test(icao)) throw new OrganizationError(400, 'invalid_input', { field: 'icao' })
  const geometry = kind === 'region' ? (body.geometry ?? prior?.geometry) : null
  if (kind === 'region' && !isValidOrganizationGeometry(geometry, ['Polygon', 'MultiPolygon'])) {
    throw new OrganizationError(400, 'invalid_input', { field: 'geometry' })
  }
  const radiusInput = body.lightningRadiusKm ?? prior?.lightningRadiusKm
  const windowInput = body.lightningWindowMinutes ?? prior?.lightningWindowMinutes
  const radius = radiusInput == null ? null : Number(radiusInput)
  const windowMinutes = windowInput == null ? null : Number(windowInput)
  if ((radius != null && !(radius >= 1 && radius <= 500))
    || (windowMinutes != null && (!Number.isInteger(windowMinutes) || windowMinutes < 5 || windowMinutes > 240))) {
    throw new OrganizationError(400, 'invalid_input', { field: 'lightning' })
  }
  return { kind, name: requireText(body.name ?? prior?.name ?? icao, 'name'), icao, geometry, radius, windowMinutes }
}

export function listInterests(db, organizationId) {
  return db.prepare('SELECT * FROM organization_interests WHERE organization_id=? ORDER BY kind,name,id')
    .all(organizationId).map(toInterest)
}

export function createInterest(db, organizationId, body, actorUserId) {
  const value = interestInput(body)
  const now = nowIso()
  const info = db.prepare(`INSERT INTO organization_interests
    (organization_id,kind,name,icao,geometry,lightning_radius_km,lightning_window_minutes,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(organizationId, value.kind, value.name, value.icao,
    value.geometry ? stringify(value.geometry, null) : null, value.radius, value.windowMinutes, actorUserId, now, now)
  return toInterest(db.prepare('SELECT * FROM organization_interests WHERE id=?').get(info.lastInsertRowid))
}

export function updateInterest(db, organizationId, interestId, body) {
  const id = integerId(interestId, 'interestId')
  const row = db.prepare('SELECT * FROM organization_interests WHERE id=? AND organization_id=?').get(id, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  const prior = toInterest(row)
  assertVersion(prior.version, body.expectedVersion)
  const value = interestInput(body, prior)
  const result = db.prepare(`UPDATE organization_interests SET kind=?,name=?,icao=?,geometry=?,lightning_radius_km=?,
    lightning_window_minutes=?,version=version+1,updated_at=? WHERE id=? AND organization_id=? AND version=?`)
    .run(value.kind, value.name, value.icao, value.geometry ? stringify(value.geometry, null) : null,
      value.radius, value.windowMinutes, nowIso(), id, organizationId, prior.version)
  if (result.changes !== 1) throw new OrganizationError(409, 'version_conflict')
  return toInterest(db.prepare('SELECT * FROM organization_interests WHERE id=?').get(id))
}

export function deleteInterest(db, organizationId, interestId, body) {
  const id = integerId(interestId, 'interestId')
  const row = db.prepare('SELECT version FROM organization_interests WHERE id=? AND organization_id=?').get(id, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  assertVersion(row.version, body.expectedVersion)
  db.prepare('DELETE FROM organization_interests WHERE id=? AND organization_id=? AND version=?').run(id, organizationId, row.version)
}

function noticeRow(db, organizationId, noticeId, version = null) {
  const row = db.prepare(`SELECT n.*,v.version,v.title,v.body,v.starts_at,v.ends_at,v.created_at AS version_created_at,
      u.display_name AS author_display_name,u.username AS author_username
    FROM organization_notices n JOIN organization_notice_versions v
      ON v.notice_id=n.id AND v.version=COALESCE(?,n.current_version)
    JOIN users u ON u.id=v.created_by WHERE n.id=? AND n.organization_id=?`).get(version, noticeId, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

function toNotice(row) {
  return row && {
    id: row.id, orgId: row.organization_id, version: row.version, title: row.title, body: row.body,
    startsAt: row.starts_at, endsAt: row.ends_at, authorDisplayName: row.author_display_name ?? row.author_username,
    createdAt: row.created_at, updatedAt: row.updated_at, versionCreatedAt: row.version_created_at,
  }
}

function noticeInput(body, prior = null) {
  const startsAt = validInstant(body.startsAt ?? prior?.startsAt, 'startsAt', { optional: true })
  const endsAt = validInstant(body.endsAt ?? prior?.endsAt, 'endsAt', { optional: true })
  if (startsAt && endsAt && endsAt <= startsAt) throw new OrganizationError(400, 'invalid_input', { field: 'endsAt' })
  return { title: requireText(body.title ?? prior?.title, 'title'), body: optionalText(body.body ?? prior?.body, 'body', 20000), startsAt, endsAt }
}

export function listNotices(db, organizationId, { at = null } = {}) {
  const rows = db.prepare(`SELECT n.*,v.version,v.title,v.body,v.starts_at,v.ends_at,v.created_at AS version_created_at,
      u.display_name AS author_display_name,u.username AS author_username
    FROM organization_notices n JOIN organization_notice_versions v ON v.notice_id=n.id AND v.version=n.current_version
    JOIN users u ON u.id=v.created_by WHERE n.organization_id=? AND n.deleted_at IS NULL ORDER BY v.created_at DESC`).all(organizationId)
  const instant = at ? validInstant(at, 'at') : null
  return rows.filter((row) => !instant || ((!row.starts_at || row.starts_at <= instant) && (!row.ends_at || row.ends_at > instant))).map(toNotice)
}

export function createNotice(db, organizationId, body, actorUserId) {
  const value = noticeInput(body)
  return db.transaction(() => {
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organization_notices
      (organization_id,created_by,created_at,updated_at) VALUES (?,?,?,?)`).run(organizationId, actorUserId, now, now)
    db.prepare(`INSERT INTO organization_notice_versions
      (notice_id,version,title,body,starts_at,ends_at,created_by,created_at) VALUES (?,1,?,?,?,?,?,?)`)
      .run(info.lastInsertRowid, value.title, value.body, value.startsAt, value.endsAt, actorUserId, now)
    return toNotice(noticeRow(db, organizationId, info.lastInsertRowid))
  })()
}

export function updateNotice(db, organizationId, noticeId, body, actorUserId) {
  return db.transaction(() => {
    const current = toNotice(noticeRow(db, organizationId, integerId(noticeId, 'noticeId')))
    assertVersion(current.version, body.expectedVersion)
    const value = noticeInput(body, current)
    const next = current.version + 1
    const now = nowIso()
    db.prepare(`INSERT INTO organization_notice_versions
      (notice_id,version,title,body,starts_at,ends_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(current.id, next, value.title, value.body, value.startsAt, value.endsAt, actorUserId, now)
    const changed = db.prepare(`UPDATE organization_notices SET current_version=?,updated_at=?
      WHERE id=? AND organization_id=? AND current_version=?`).run(next, now, current.id, organizationId, current.version)
    if (changed.changes !== 1) throw new OrganizationError(409, 'version_conflict')
    return toNotice(noticeRow(db, organizationId, current.id))
  })()
}

export function deleteNotice(db, organizationId, noticeId, body) {
  const id = integerId(noticeId, 'noticeId')
  const row = db.prepare('SELECT current_version,deleted_at FROM organization_notices WHERE id=? AND organization_id=?').get(id, organizationId)
  if (!row || row.deleted_at) throw new OrganizationError(404, 'not_found')
  assertVersion(row.current_version, body.expectedVersion)
  db.prepare('UPDATE organization_notices SET deleted_at=?,updated_at=? WHERE id=? AND current_version=?')
    .run(nowIso(), nowIso(), id, row.current_version)
}

function briefingRow(db, organizationId, briefingId, version = null) {
  const row = db.prepare(`SELECT b.*,v.version,v.name,v.scheduled_at,v.flight_refs,v.material_refs,v.blocks,
      v.created_at AS version_created_at FROM organization_briefings b JOIN organization_briefing_versions v
      ON v.briefing_id=b.id AND v.version=COALESCE(?,b.current_version)
      WHERE b.id=? AND b.organization_id=?`).get(version, briefingId, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

function toBriefing(row) {
  return row && {
    id: row.id, orgId: row.organization_id, name: row.name, version: row.version, status: row.status,
    scheduledAt: row.scheduled_at, flightRefs: json(row.flight_refs, []),
    flightIds: json(row.flight_refs, []).map((ref) => ref.id), materialRefs: json(row.material_refs, []),
    blocks: json(row.blocks, []), createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function resolveFlightRefs(db, organizationId, refs) {
  if (!Array.isArray(refs)) throw new OrganizationError(400, 'invalid_input', { field: 'flightIds' })
  if (refs.length > 100) throw new OrganizationError(400, 'invalid_input', { field: 'flightIds', reason: 'too_many' })
  const seen = new Set()
  return refs.map((input) => {
    const id = integerId(typeof input === 'object' ? input.id : input, 'flightId')
    if (seen.has(id)) throw new OrganizationError(400, 'invalid_input', { field: 'flightIds', reason: 'duplicate' })
    seen.add(id)
    const requested = typeof input === 'object' ? input.version : null
    const flight = getFlight(db, organizationId, id, requested)
    return { id: flight.id, version: flight.version }
  })
}

function briefingInput(db, organizationId, body, prior = null) {
  const requestedRefs = body.flightRefs ?? body.flightIds ?? prior?.flightRefs ?? []
  const blocks = validateOrganizationBlocks(db, organizationId, body.blocks ?? prior?.blocks ?? [], {
    allowSpeakerNotes: true, maxBlocks: 1000,
  })
  return {
    name: requireText(body.name ?? prior?.name, 'name'),
    scheduledAt: validInstant(body.scheduledAt ?? prior?.scheduledAt, 'scheduledAt', { optional: true }),
    status: body.status ?? prior?.status ?? 'draft',
    flightRefs: resolveFlightRefs(db, organizationId, requestedRefs),
    materialRefs: resolveMaterialRefs(db, organizationId, body.materialRefs ?? prior?.materialRefs ?? []),
    blocks,
  }
}

export function listBriefings(db, organizationId) {
  return db.prepare(`SELECT b.*,v.version,v.name,v.scheduled_at,v.flight_refs,v.material_refs,v.blocks,
    v.created_at AS version_created_at FROM organization_briefings b JOIN organization_briefing_versions v
    ON v.briefing_id=b.id AND v.version=b.current_version WHERE b.organization_id=? ORDER BY v.scheduled_at DESC,b.id DESC`)
    .all(organizationId).map(toBriefing)
}

export function getBriefing(db, organizationId, briefingId, version = null) {
  return toBriefing(briefingRow(db, organizationId, integerId(briefingId, 'briefingId'), version == null ? null : expectedVersion(version)))
}

export function createBriefing(db, organizationId, body, actorUserId) {
  const value = briefingInput(db, organizationId, body)
  if (!['draft', 'ready', 'archived'].includes(value.status)) throw new OrganizationError(400, 'invalid_input', { field: 'status' })
  return db.transaction(() => {
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organization_briefings
      (organization_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?)`)
      .run(organizationId, value.status, actorUserId, now, now)
    db.prepare(`INSERT INTO organization_briefing_versions
      (briefing_id,version,name,scheduled_at,flight_refs,material_refs,blocks,created_by,created_at)
      VALUES (?,1,?,?,?,?,?,?,?)`).run(info.lastInsertRowid, value.name, value.scheduledAt,
      stringify(value.flightRefs, []), stringify(value.materialRefs, []), stringify(value.blocks, []), actorUserId, now)
    return getBriefing(db, organizationId, info.lastInsertRowid)
  })()
}

export function updateBriefing(db, organizationId, briefingId, body, actorUserId) {
  return db.transaction(() => {
    const current = getBriefing(db, organizationId, briefingId)
    assertVersion(current.version, body.expectedVersion)
    const value = briefingInput(db, organizationId, body, current)
    if (!['draft', 'ready', 'archived'].includes(value.status)) throw new OrganizationError(400, 'invalid_input', { field: 'status' })
    const now = nowIso()
    const next = current.version + 1
    db.prepare(`INSERT INTO organization_briefing_versions
      (briefing_id,version,name,scheduled_at,flight_refs,material_refs,blocks,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(current.id, next, value.name, value.scheduledAt,
      stringify(value.flightRefs, []), stringify(value.materialRefs, []), stringify(value.blocks, []), actorUserId, now)
    const changed = db.prepare(`UPDATE organization_briefings SET current_version=?,status=?,updated_at=?
      WHERE id=? AND organization_id=? AND current_version=?`).run(next, value.status, now, current.id, organizationId, current.version)
    if (changed.changes !== 1) throw new OrganizationError(409, 'version_conflict')
    return getBriefing(db, organizationId, current.id)
  })()
}

export function toRun(row, db = null) {
  if (!row) return null
  const pinnedSnapshot = json(row.pinned_snapshot, {})
  const applied = json(row.applied_snapshot, null)
  const events = db ? db.prepare(`SELECT * FROM organization_briefing_run_events
    WHERE run_id=? ORDER BY sequence`).all(row.id).map((event) => ({
      sequence: event.sequence, kind: event.kind, runVersion: event.run_version,
      flightId: event.flight_id, bundleId: event.bundle_id, payload: json(event.payload, {}),
      actorUserId: event.actor_user_id, createdAt: event.created_at,
    })) : []
  const latestByFlight = new Map()
  for (const event of events) if (event.kind === 'applied') {
    latestByFlight.set(Number(event.flightId), { flightId: event.flightId, bundleId: event.bundleId,
      bundle: event.payload, runVersion: event.runVersion, appliedAt: event.createdAt })
  }
  const fallbackBundles = applied && Object.keys(applied).length && row.active_flight_id != null
    ? [{ flightId: row.active_flight_id, bundleId: applied.bundleId ?? null, bundle: applied,
      runVersion: row.version, appliedAt: row.updated_at }] : []
  const terminationRecord = [...events].reverse().find((event) => event.kind === 'ended') ?? null
  return {
    id: row.id, orgId: row.organization_id, briefingId: row.briefing_id,
    briefingVersion: row.briefing_version, status: row.status, startedBy: row.started_by,
    flightRefs: (pinnedSnapshot.flights ?? []).map((flight) => ({ id: flight.id, version: flight.version })),
    materialRefs: pinnedSnapshot.materialRefs ?? [], activeFlightId: row.active_flight_id ?? null,
    pinnedSnapshot, appliedSnapshot: applied && Object.keys(applied).length ? applied : null,
    appliedBundles: events.length ? [...latestByFlight.values()] : fallbackBundles,
    applicationHistory: events.filter((event) => event.kind === 'applied'),
    terminationRecord, events,
    version: row.version, startedAt: row.started_at, updatedAt: row.updated_at, endedAt: row.ended_at,
  }
}

function runSnapshot(db, organizationId, briefing) {
  const flights = briefing.flightRefs.map((ref) => getFlight(db, organizationId, ref.id, ref.version))
  return {
    briefing: { id: briefing.id, version: briefing.version, name: briefing.name, blocks: briefing.blocks },
    flights: flights.map((flight) => ({
      id: flight.id, version: flight.version, name: flight.name, etd: flight.etd, eta: flight.eta,
      snapshot: flight.snapshot, profileRequest: flight.profileRequest, blocks: flight.blocks,
      annotations: flight.annotations, materialRefs: flight.materialRefs,
    })),
    materialRefs: briefing.materialRefs,
    capturedAt: nowIso(),
  }
}

export function currentBriefingRunSnapshot(db, organizationId, briefingId) {
  const briefing = getBriefing(db, organizationId, briefingId)
  const flights = briefing.flightRefs.map((ref) => getFlight(db, organizationId, ref.id))
  return {
    briefing: { id: briefing.id, version: briefing.version, name: briefing.name, blocks: briefing.blocks },
    flights: flights.map((flight) => ({
      id: flight.id, orgId: flight.orgId, version: flight.version, name: flight.name, etd: flight.etd, eta: flight.eta,
      snapshot: flight.snapshot, profileRequest: flight.profileRequest, blocks: flight.blocks,
      annotations: flight.annotations, materialRefs: flight.materialRefs,
    })),
    materialRefs: briefing.materialRefs,
    capturedAt: nowIso(),
  }
}

export function startBriefingRun(db, organizationId, briefingId, body, actorUserId) {
  const briefing = getBriefing(db, organizationId, briefingId)
  assertVersion(briefing.version, body.expectedVersion)
  return db.transaction(() => {
    const pinned = runSnapshot(db, organizationId, briefing)
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organization_briefing_runs
      (organization_id,briefing_id,briefing_version,started_by,pinned_snapshot,applied_snapshot,started_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(organizationId, briefing.id, briefing.version, actorUserId,
      stringify(pinned, {}), stringify({}, {}), now, now)
    return toRun(db.prepare('SELECT * FROM organization_briefing_runs WHERE id=?').get(info.lastInsertRowid), db)
  })()
}

export function getBriefingRun(db, organizationId, briefingId, runId) {
  const row = db.prepare(`SELECT * FROM organization_briefing_runs
    WHERE id=? AND organization_id=? AND briefing_id=?`).get(integerId(runId, 'runId'), organizationId, integerId(briefingId, 'briefingId'))
  if (!row) throw new OrganizationError(404, 'not_found')
  return toRun(row, db)
}

function activeRun(db, organizationId, briefingId, runId, actorUserId) {
  const row = db.prepare(`SELECT * FROM organization_briefing_runs
    WHERE id=? AND organization_id=? AND briefing_id=?`).get(integerId(runId, 'runId'), organizationId, integerId(briefingId, 'briefingId'))
  if (!row) throw new OrganizationError(404, 'not_found')
  if (Number(row.started_by) !== Number(actorUserId)) throw new OrganizationError(403, 'run_owner_required')
  if (row.status !== 'active') throw new OrganizationError(409, 'run_ended')
  return row
}

export function saveBriefingRunCandidate(db, organizationId, briefingId, runId, bundle, actorUserId) {
  const row = activeRun(db, organizationId, briefingId, runId, actorUserId)
  if (!bundle?.bundleId || !bundle?.flight?.id || !bundle?.flightRevision) {
    throw new OrganizationError(500, 'invalid_generated_bundle')
  }
  const pinned = bundle.organizationSnapshot ?? json(row.pinned_snapshot, {})
  if (Number(pinned.briefing?.id ?? briefingId) !== Number(briefingId)) throw new OrganizationError(409, 'candidate_snapshot_invalid')
  const expected = (pinned.flights ?? []).find((flight) => Number(flight.id) === Number(bundle.flight.id))
  if (!expected || Number(expected.version) !== Number(bundle.flightRevision)) {
    throw new OrganizationError(409, 'flight_not_pinned_in_run')
  }
  const payload = stringify(bundle, {})
  const existing = db.prepare(`SELECT payload FROM organization_briefing_run_candidates
    WHERE run_id=? AND bundle_id=?`).get(row.id, bundle.bundleId)
  if (existing && existing.payload !== payload) throw new OrganizationError(409, 'bundle_id_conflict')
  if (!existing) db.prepare(`INSERT INTO organization_briefing_run_candidates
    (run_id,bundle_id,flight_id,flight_version,payload,created_at) VALUES (?,?,?,?,?,?)`)
    .run(row.id, bundle.bundleId, expected.id, expected.version, payload, nowIso())
  return bundle
}

export function applyBriefingRun(db, organizationId, briefingId, runId, body, actorUserId) {
  const row = activeRun(db, organizationId, briefingId, runId, actorUserId)
  assertVersion(row.version, body.expectedRunVersion)
  const flightId = integerId(body.flightId, 'flightId')
  const bundleId = requireText(body.bundleId, 'bundleId', 128)
  const candidate = db.prepare(`SELECT * FROM organization_briefing_run_candidates
    WHERE run_id=? AND bundle_id=? AND flight_id=?`).get(row.id, bundleId, flightId)
  if (!candidate) throw new OrganizationError(409, 'candidate_not_found')
  const candidatePayload = json(candidate.payload, {})
  const organizationSnapshot = candidatePayload.organizationSnapshot ?? json(row.pinned_snapshot, {})
  const snapshotBriefingVersion = Number(organizationSnapshot.briefing?.version ?? row.briefing_version)
  if (Number(organizationSnapshot.briefing?.id ?? row.briefing_id) !== Number(row.briefing_id)
    || !(organizationSnapshot.flights ?? []).some((flight) => Number(flight.id) === flightId
      && Number(flight.version) === Number(candidate.flight_version))) {
    throw new OrganizationError(409, 'candidate_snapshot_invalid')
  }
  return db.transaction(() => {
    const now = nowIso()
    const changed = db.prepare(`UPDATE organization_briefing_runs SET active_flight_id=?,applied_snapshot=?,pinned_snapshot=?,briefing_version=?,version=version+1,updated_at=?
      WHERE id=? AND version=? AND status='active'`).run(flightId, candidate.payload, stringify(organizationSnapshot, {}),
      snapshotBriefingVersion, now, row.id, row.version)
    if (changed.changes !== 1) throw new OrganizationError(409, 'version_conflict')
    const sequence = db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM organization_briefing_run_events WHERE run_id=?').get(row.id).next
    db.prepare(`INSERT INTO organization_briefing_run_events
      (run_id,sequence,kind,run_version,flight_id,bundle_id,payload,actor_user_id,created_at)
      VALUES (?,?,\'applied\',?,?,?,?,?,?)`).run(row.id, sequence, row.version + 1, flightId, bundleId,
      candidate.payload, actorUserId, now)
    return toRun(db.prepare('SELECT * FROM organization_briefing_runs WHERE id=?').get(row.id), db)
  })()
}

export function endBriefingRun(db, organizationId, briefingId, runId, body, actorUserId) {
  const row = activeRun(db, organizationId, briefingId, runId, actorUserId)
  assertVersion(row.version, body.expectedRunVersion)
  return db.transaction(() => {
    const now = nowIso()
    const changed = db.prepare(`UPDATE organization_briefing_runs SET status='ended',version=version+1,updated_at=?,ended_at=?
      WHERE id=? AND version=? AND status='active'`).run(now, now, row.id, row.version)
    if (changed.changes !== 1) throw new OrganizationError(409, 'version_conflict')
    const sequence = db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM organization_briefing_run_events WHERE run_id=?').get(row.id).next
    db.prepare(`INSERT INTO organization_briefing_run_events
      (run_id,sequence,kind,run_version,payload,actor_user_id,created_at)
      VALUES (?,?,\'ended\',?,?,?,?)`).run(row.id, sequence, row.version + 1,
      stringify({ endedAt: now }, {}), actorUserId, now)
    return toRun(db.prepare('SELECT * FROM organization_briefing_runs WHERE id=?').get(row.id), db)
  })()
}

function toAlert(row) {
  if (!row) return null
  const payload = json(row.payload, {})
  const hidden = row.hidden_until && Date.parse(row.hidden_until) > Date.now()
  return {
    id: row.id, orgId: row.organization_id, eventKey: row.event_key, kind: row.kind,
    interestId: row.interest_id, payload, sourceRevision: row.source_revision,
    title: payload.title ?? null, summary: payload.description ?? null, targetName: payload.targetName ?? null,
    observedAt: payload.observedAt ?? payload.issuedAt ?? null, validFrom: payload.validFrom ?? null, validTo: payload.validTo ?? null,
    severity: payload.severity ?? null,
    version: row.version, acknowledgedBy: row.acknowledged_by, acknowledgedAt: row.acknowledged_at,
    changedSinceAcknowledgement: Boolean(row.acknowledged_version && row.version > row.acknowledged_version),
    active: Boolean(row.active), readAt: row.read_at ?? null, hiddenUntil: row.hidden_until ?? null,
    status: !row.active ? 'expired' : hidden ? 'snoozed' : row.acknowledged_at ? 'acknowledged' : 'new',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function listAlerts(db, organizationId, userId, { includeInactive = 'false' } = {}) {
  return db.prepare(`SELECT a.*,s.read_at,s.hidden_until FROM organization_alerts a
    LEFT JOIN organization_alert_user_states s ON s.alert_id=a.id AND s.user_id=?
    WHERE a.organization_id=? ${includeInactive === 'true' ? '' : 'AND a.active=1'} ORDER BY a.updated_at DESC,a.id DESC`)
    .all(userId, organizationId).map(toAlert)
}

export function updateAlertState(db, organizationId, alertId, userId, body) {
  const id = integerId(alertId, 'alertId')
  const row = db.prepare('SELECT * FROM organization_alerts WHERE id=? AND organization_id=?').get(id, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  assertVersion(row.version, body.expectedVersion)
  const now = nowIso()
  if (body.acknowledged === true) {
    db.prepare(`UPDATE organization_alerts SET acknowledged_by=?,acknowledged_at=?,acknowledged_version=version+1,version=version+1,updated_at=?
      WHERE id=? AND version=?`).run(userId, now, now, id, row.version)
  }
  const readAt = body.read === true ? now : null
  const snoozeMinutes = body.snoozeMinutes == null ? null : Number(body.snoozeMinutes)
  if (snoozeMinutes != null && (!Number.isFinite(snoozeMinutes) || snoozeMinutes < 1 || snoozeMinutes > 240)) {
    throw new OrganizationError(400, 'invalid_input', { field: 'snoozeMinutes' })
  }
  const hiddenUntil = snoozeMinutes == null ? null
    : new Date(Date.now() + snoozeMinutes * 60_000).toISOString()
  if (body.read !== undefined || body.snoozeMinutes !== undefined) {
    db.prepare(`INSERT INTO organization_alert_user_states
      (organization_id,alert_id,user_id,read_at,hidden_until,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(alert_id,user_id) DO UPDATE SET
        read_at=COALESCE(excluded.read_at,organization_alert_user_states.read_at),
        hidden_until=excluded.hidden_until,updated_at=excluded.updated_at`)
      .run(organizationId, id, userId, readAt, hiddenUntil, now)
  }
  return toAlert(db.prepare(`SELECT a.*,s.read_at,s.hidden_until FROM organization_alerts a
    LEFT JOIN organization_alert_user_states s ON s.alert_id=a.id AND s.user_id=? WHERE a.id=?`).get(userId, id))
}

function normalizeAnnotation(input, actorUserId, previous = null) {
  const shapeType = input.shapeType !== undefined
    ? input.shapeType
    : ((input.circle ? 'Circle' : input.geometry ? input.geometry.type : null) ?? previous?.shapeType ?? null)
  const geometry = input.geometry === undefined ? previous?.geometry ?? null : input.geometry
  if (shapeType && !['Point', 'LineString', 'Polygon', 'Circle'].includes(shapeType)) {
    throw new OrganizationError(400, 'invalid_input', { field: 'shapeType' })
  }
  if (shapeType === 'Circle') {
    const circle = input.circle ?? (geometry?.center ? { center: geometry.center, radiusMeters: geometry.radiusMeters ?? geometry.radiusM } : previous?.circle)
    const center = circle?.center
    const radiusM = Number(circle?.radiusMeters)
    if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)
      || center[0] < -180 || center[0] > 180 || center[1] < -90 || center[1] > 90
      || !Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 1_000_000) {
      throw new OrganizationError(400, 'invalid_input', { field: 'geometry' })
    }
  } else if (shapeType && (geometry?.type !== shapeType || !isValidOrganizationGeometry(geometry, [shapeType]))) {
    throw new OrganizationError(400, 'invalid_input', { field: 'geometry' })
  }
  if (!shapeType && geometry != null) throw new OrganizationError(400, 'invalid_input', { field: 'geometry' })
  const altitudeMinFt = input.altitudeMinFt === undefined ? previous?.altitudeMinFt ?? null : input.altitudeMinFt
  const altitudeMaxFt = input.altitudeMaxFt === undefined ? previous?.altitudeMaxFt ?? null : input.altitudeMaxFt
  if ((altitudeMinFt == null) !== (altitudeMaxFt == null)
    || (altitudeMinFt != null && (!Number.isFinite(Number(altitudeMinFt)) || !Number.isFinite(Number(altitudeMaxFt))
      || Number(altitudeMinFt) < 0 || Number(altitudeMaxFt) > 60000 || Number(altitudeMinFt) >= Number(altitudeMaxFt)))) {
    throw new OrganizationError(400, 'invalid_input', { field: 'altitude' })
  }
  return {
    id: previous?.id ?? `annotation-${cryptoRandomId()}`,
    title: requireText(input.title ?? previous?.title, 'title', 100),
    description: optionalText(input.description ?? previous?.description, 'description'),
    shapeType,
    geometry: shapeType === 'Circle' ? null : geometry,
    circle: shapeType === 'Circle' ? {
      center: input.circle?.center ?? geometry?.center ?? previous?.circle?.center,
      radiusMeters: Number(input.circle?.radiusMeters ?? geometry?.radiusMeters ?? geometry?.radiusM ?? previous?.circle?.radiusMeters),
    } : null,
    altitudeMinFt: altitudeMinFt == null ? null : Number(altitudeMinFt),
    altitudeMaxFt: altitudeMaxFt == null ? null : Number(altitudeMaxFt),
    altitude: altitudeMinFt == null ? null : { minFt: Number(altitudeMinFt), maxFt: Number(altitudeMaxFt), reference: 'AMSL' },
    authorUserId: previous?.authorUserId ?? actorUserId,
    updatedByUserId: actorUserId,
  }
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function mutateFlightAnnotations(db, organizationId, flightId, body, actorUserId, annotationId = null, remove = false) {
  const current = getFlight(db, organizationId, flightId)
  assertVersion(current.version, body.expectedVersion)
  const annotations = [...current.annotations]
  const index = annotationId == null ? -1 : annotations.findIndex((item) => item.id === annotationId)
  if (annotationId != null && index < 0) throw new OrganizationError(404, 'not_found')
  if (remove) annotations.splice(index, 1)
  else if (index < 0) annotations.push(normalizeAnnotation(body, actorUserId))
  else annotations[index] = normalizeAnnotation(body, actorUserId, annotations[index])
  return updateFlight(db, organizationId, flightId, { annotations, expectedVersion: current.version }, actorUserId)
}
