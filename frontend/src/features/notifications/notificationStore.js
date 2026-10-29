const FEED = '/api/me/notifications'
const emptyState = () => ({ notifications: [], unreadCount: 0, loading: false, initialized: false })

// The bell, inbox and popup share one snapshot for the signed-in user.
export function createNotificationStore(request = (...args) => fetch(...args), enabled = true) {
  let state = emptyState()
  let revision = 0
  let pendingWrites = 0
  let reconcileNeeded = false
  const listeners = new Set()
  const publish = (next) => {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }
  async function refresh() {
    if (!enabled || pendingWrites) return
    const version = ++revision
    publish({ loading: true })
    try {
      const response = await request(FEED, { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        if (version === revision) publish({ notifications: data.notifications || [], unreadCount: data.unreadCount || 0, initialized: true })
      }
    } catch { /* Preserve the last usable feed while offline. */ }
    finally { if (version === revision) publish({ loading: false }) }
  }
  async function writeRead(path, method, update) {
    if (!enabled) return
    ++revision // An older poll must not undo the optimistic read.
    ++pendingWrites
    publish({ ...update, loading: false })
    try {
      const response = await request(path, { method, credentials: 'include' })
      if (!response.ok) reconcileNeeded = true
    } catch { reconcileNeeded = true }
    finally { --pendingWrites }
    if (!pendingWrites && reconcileNeeded) {
      reconcileNeeded = false
      await refresh()
    }
  }
  function markRead(id) {
    const item = state.notifications.find((notification) => notification.id === id)
    if (item?.readAt) return Promise.resolve()
    // A push deep link can open an event before the feed loads or beyond its limit.
    if (!item) return writeRead(`${FEED}/${id}/read`, 'PATCH', {}).then(refresh)
    const readAt = new Date().toISOString()
    return writeRead(`${FEED}/${id}/read`, 'PATCH', {
      notifications: state.notifications.map((notification) => notification.id === id ? { ...notification, readAt } : notification),
      unreadCount: Math.max(0, state.unreadCount - (item.active ? 1 : 0)),
    })
  }
  function markAllRead() {
    const readAt = new Date().toISOString()
    return writeRead(`${FEED}/read-all`, 'POST', {
      notifications: state.notifications.map((item) => item.readAt ? item : { ...item, readAt }),
      unreadCount: 0,
    })
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    refresh, markRead, markAllRead,
  }
}

let ownerId
let currentStore
export function getNotificationStore(userId) {
  if (!currentStore || ownerId !== userId) {
    ownerId = userId
    currentStore = createNotificationStore(undefined, userId != null)
  }
  return currentStore
}
