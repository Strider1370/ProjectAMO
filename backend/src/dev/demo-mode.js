import { activateLiveView, getActiveDataContext } from './data-view.js'

export function isDemoMode() {
  return getActiveDataContext().mode === 'demo'
}

export function getDemoNow() {
  return getActiveDataContext().referenceTime
}

export function getEffectiveNow() {
  const referenceTime = getActiveDataContext().referenceTime
  return referenceTime ? new Date(referenceTime) : new Date()
}

// Compatibility adapter for operational recovery scripts. Enabling demo requires
// a named, inspected snapshot and is intentionally available only through the session.
export function setDemoMode(on) {
  if (on) throw new Error('demo_snapshot_required')
  activateLiveView()
  return false
}

export function setDemoNow() {
  throw new Error('demo_time_owned_by_active_view')
}

const MAX_LOG = 50
const log = []

export function recordDemoEvent(action, detail) {
  log.unshift({ at: new Date().toISOString(), action, detail })
  if (log.length > MAX_LOG) log.length = MAX_LOG
}

export function getDemoEvents() {
  return log
}
