import crypto from 'node:crypto'

export const ORGANIZATION_ROLES = Object.freeze(['admin', 'planner', 'member'])
export const PLANNING_ROLES = Object.freeze(['admin', 'planner'])

export class OrganizationError extends Error {
  constructor(status, code, details = null) {
    super(code)
    this.name = 'OrganizationError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function json(value, fallback) {
  if (value == null || value === '') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]))
  }
  return value
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function nowIso(now = Date.now()) {
  return new Date(now).toISOString()
}

export function validInstant(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return null
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new OrganizationError(400, 'invalid_input', { field, reason: 'timezone_required' })
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new OrganizationError(400, 'invalid_input', { field })
  return new Date(parsed).toISOString()
}

export function integerId(value, field = 'id') {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new OrganizationError(400, 'invalid_input', { field })
  return id
}

export function expectedVersion(value) {
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new OrganizationError(400, 'expected_version_required')
  }
  return version
}

export function requireText(value, field, max = 200) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > max) throw new OrganizationError(400, 'invalid_input', { field })
  return text
}

export function optionalText(value, field, max = 3000) {
  if (value == null) return ''
  if (typeof value !== 'string' || value.length > max) throw new OrganizationError(400, 'invalid_input', { field })
  return value.trim()
}

export function assertRole(role) {
  if (!ORGANIZATION_ROLES.includes(role)) throw new OrganizationError(400, 'invalid_role')
  return role
}

export function assertVersion(current, expected) {
  if (Number(current) !== expectedVersion(expected)) {
    throw new OrganizationError(409, 'version_conflict', { expectedVersion: Number(expected), currentVersion: Number(current) })
  }
}

export function handleOrganizationError(res, error) {
  if (error instanceof OrganizationError) {
    return res.status(error.status).json({ error: error.code, ...(error.details ? { details: error.details } : {}) })
  }
  if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'invalid_reference' })
  console.error('[organizations]', error)
  return res.status(500).json({ error: 'organization_operation_failed' })
}
