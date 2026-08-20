// 관리자 콘솔 API. 모든 요청 세션쿠키 동반. 401/403이면 상태코드를 Error에 담아 던짐.
const base = '/api/admin'
const j = async (r) => {
  if (!r.ok) {
    const e = new Error(String(r.status))
    e.status = r.status
    try { e.body = await r.json() } catch { /* 빈 응답 */ }
    throw e
  }
  return r.json()
}

export const getMetrics = (range) => fetch(`${base}/metrics?range=${range}`, { credentials: 'include' }).then(j)
export const getTraffic = () => fetch(`${base}/traffic`, { credentials: 'include' }).then(j)
export const getDataHealth = () => fetch(`${base}/data-health`, { credentials: 'include' }).then(j)
export const getServerHealth = () => fetch(`${base}/server-health`, { credentials: 'include' }).then(j)
export const getApiHubUsage = () => fetch(`${base}/api-hub-usage`, { credentials: 'include' }).then(j)
export const getTrends = (granularity) => fetch(`${base}/trends?granularity=${granularity}`, { credentials: 'include' }).then(j)
export const getAlertWatches = () => fetch(`${base}/alert-watches`, { credentials: 'include' }).then(j)
export const getUsers = () => fetch(`${base}/users`, { credentials: 'include' }).then(j)
export const getPending = () => fetch(`${base}/pending`, { credentials: 'include' }).then(j)
export const approve = (id) => fetch(`${base}/users/${id}/approve`, { method: 'POST', credentials: 'include' }).then(j)
export const reject = (id) => fetch(`${base}/users/${id}/reject`, { method: 'POST', credentials: 'include' }).then(j)
export const createForecaster = (body) => fetch(`${base}/forecasters`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(j)
export const getDemoMode = () => fetch(`${base}/demo-mode`, { credentials: 'include' }).then(j)
export const revertDemoMode = () => fetch(`${base}/demo-mode/revert`, { method: 'POST', credentials: 'include' }).then(j)
export const getDemoModeLog = () => fetch(`${base}/demo-mode/log`, { credentials: 'include' }).then(j)

export const listSnapshots = () => fetch(`${base}/snapshot/list`, { credentials: 'include' }).then(j)
export const saveSnapshot = (name) => fetch(`${base}/snapshot/save`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
}).then(j)
export const loadSnapshot = (name) => fetch(`${base}/snapshot/load`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
}).then(j)
