// Shared authenticated reads. Caller supplies the session user, never a model
// argument. Storage identity wins over arbitrary fields inside a saved payload.
export function routeSnapshot(row) {
  try {
    const value = JSON.parse(row.payload || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch { return null }
}

export function routeEntry(row) {
  return { ...(routeSnapshot(row) ?? {}), id: row.id, name: row.name, savedAt: Date.parse(row.created_at) || 0 }
}

export function createOwnedRouteReader(database) {
  function user(value) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('AUTH_REQUIRED')
    return value
  }
  const columns = 'id, name, created_at, updated_at, payload, alert_enabled'
  return {
    list(userId) {
      return database().prepare(`SELECT ${columns} FROM routes WHERE user_id = ? ORDER BY created_at DESC, id DESC`).all(user(userId))
    },
    get(userId, id) {
      if (!Number.isSafeInteger(id) || id <= 0) return null
      return database().prepare(`SELECT ${columns} FROM routes WHERE user_id = ? AND id = ?`).get(user(userId), id) ?? null
    },
  }
}
