import { createAdminQuerySession } from './lib/adminQuery.js'

// 관리자 콘솔 API. GET은 화면 수명 scope와 세대를 함께 보내며 응답 본문과 조회
// 상태를 반환한다. 변경 요청은 기존처럼 payload만 반환한다.
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

const legacyQueries = createAdminQuerySession()
const query = (session, url) => (session || legacyQueries).get(url)
export const createAdminQueryClient = () => createAdminQuerySession()

export const getMetrics = (range, session) => query(session, `${base}/metrics?range=${range}`)
export const getTraffic = (session) => query(session, `${base}/traffic`)
export const getDataHealth = (session) => query(session, `${base}/data-health`)
export const getServerHealth = (session) => query(session, `${base}/server-health`)
export const getApiHubUsage = (session) => query(session, `${base}/api-hub-usage`)
export const getTrends = (granularity, session) => query(session, `${base}/trends?granularity=${granularity}`)
export const getAlertWatches = (session) => query(session, `${base}/alert-watches`)
export const getUsers = (session) => query(session, `${base}/users`)
export const getPending = (session) => query(session, `${base}/pending`)
export const getRuntimeCapabilities = () => fetch('/api/health', { credentials: 'include' }).then(j).then((health) => ({
  // 테스트 조작은 서버가 명시한 capability만 신뢰한다. 과거 testMode(DISABLE_COLLECTION)는
  // 수집 상태일 뿐 권한 증거가 아니므로 fallback으로 사용하지 않는다.
  testMutations: health?.capabilities?.testMutations === true,
}))
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
