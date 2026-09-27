const SKIP_INTRO_KEY = 'projectamo:skip-intro'
const DASHBOARD_SESSION_KEY = 'projectamo:dashboard-session'

function readFlag(storage, key) {
  try { return storage?.getItem(key) === '1' } catch { return false }
}

function writeFlag(storage, key) {
  try { storage?.setItem(key, '1') } catch { /* Storage can be disabled in private browsing. */ }
}

export function shouldShowIntro(location, localStorage, sessionStorage) {
  if (location.pathname !== '/' || location.search || location.hash) return false
  return !readFlag(localStorage, SKIP_INTRO_KEY) && !readFlag(sessionStorage, DASHBOARD_SESSION_KEY)
}

export function rememberDashboardEntry({ skipFuture = false, localStorage, sessionStorage }) {
  writeFlag(sessionStorage, DASHBOARD_SESSION_KEY)
  if (skipFuture) writeFlag(localStorage, SKIP_INTRO_KEY)
}
