import { requireAuth } from '../auth/middleware.js'
import { getDb } from '../db/index.js'
import { handleOrganizationError, integerId } from './common.js'

export function organizationMember(db, organizationId, userId) {
  return db.prepare(`
    SELECT m.organization_id AS organizationId, m.user_id AS userId, m.role, m.status,
           m.version, u.status AS userStatus, o.name AS organizationName, o.version AS organizationVersion
      FROM organization_members m
      JOIN users u ON u.id = m.user_id
      JOIN organizations o ON o.id = m.organization_id
     WHERE m.organization_id = ? AND m.user_id = ?
  `).get(organizationId, userId)
}

export function requireOrganizationMember({ db = null } = {}) {
  const database = () => db || getDb()
  return (req, res, next) => {
    requireAuth(req, res, () => {
      try {
        const organizationId = integerId(req.params.orgId, 'orgId')
        const member = organizationMember(database(), organizationId, req.session.userId)
        if (!member || member.status !== 'active' || member.userStatus !== 'active') {
          return res.status(403).json({ error: 'organization_forbidden' })
        }
        req.organizationId = organizationId
        req.organization = { id: organizationId, name: member.organizationName }
        req.organizationMember = member
        next()
      } catch (error) {
        handleOrganizationError(res, error)
      }
    })
  }
}

export function requireOrganizationRole(roles) {
  const allowed = new Set(Array.isArray(roles) ? roles : [roles])
  return (req, res, next) => {
    if (!req.organizationMember || !allowed.has(req.organizationMember.role)) {
      return res.status(403).json({ error: 'organization_forbidden' })
    }
    next()
  }
}

export function requireTrustedMutationOrigin({ allowedOrigins = null } = {}) {
  const configured = new Set((allowedOrigins ?? [process.env.FRONTEND_ORIGIN]).filter(Boolean))
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const raw = req.get('origin')
    if (!raw) return res.status(403).json({ error: 'untrusted_origin' })
    let origin
    try { origin = new URL(raw) } catch { return res.status(403).json({ error: 'untrusted_origin' }) }
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim()
    const protocol = forwardedProto || req.protocol
    const sameOrigin = origin.origin === `${protocol}://${req.get('host')}`
    if (!sameOrigin && !configured.has(origin.origin)) return res.status(403).json({ error: 'untrusted_origin' })
    next()
  }
}

export function assertOrganizationEntity(row, organizationId) {
  if (!row || Number(row.organization_id ?? row.organizationId) !== Number(organizationId)) {
    throw new OrganizationError(404, 'not_found')
  }
  return row
}
