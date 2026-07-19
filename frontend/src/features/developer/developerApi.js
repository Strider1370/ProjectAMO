// /dev 개발자 콘솔 전용 fetch 래퍼. 모든 dev 엔드포인트는 백엔드에서 DISABLE_COLLECTION(테스트 인스턴스)일 때만 마운트됨.
const post = (body) => ({ method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })

async function j(res) {
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(d.hint || d.error || `HTTP ${res.status}`), { data: d, status: res.status })
  return d
}
const get = (url) => fetch(url, { credentials: 'include' }).then(j)

export const getHealth = () => get('/api/health')
export const getRoutes = () => get('/api/me/routes')
export const getNotifications = () => get('/api/me/notifications')
export const getSnapshotMeta = () => get('/api/snapshot-meta')
export const getVitals = () => get('/api/dev/vitals')
export const getRequestLog = (limit = 100) => get(`/api/dev/request-log?limit=${limit}`)
export const getProcessorLog = (limit = 30) => get(`/api/dev/processor-log?limit=${limit}`)
export const getStoreStats = () => get('/api/dev/store-stats')

export const inject = (routeId, scenario) => fetch('/api/dev/inject', post({ routeId, scenario })).then(j)
export const reset = () => fetch('/api/dev/reset', post()).then(j)
export const tick = () => fetch('/api/dev/tick', post()).then(j)
export const clearAlerts = () => fetch('/api/dev/clear-alerts', post()).then(j)
export const setRole = (role) => fetch('/api/dev/role', post({ role })).then(j)

export const getVapidPublicKey = () => get('/api/me/push/vapid-public-key')
export const subscribePush = (subscription) => fetch('/api/me/push/subscribe', post(subscription)).then(j)
export const sendTestPush = () => fetch('/api/me/push/test', post()).then(j)
