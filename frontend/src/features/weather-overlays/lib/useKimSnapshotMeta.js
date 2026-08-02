import { useEffect, useState } from 'react'
import { fetchSnapshotMeta } from '../../../api/weatherApi.js'

const REFRESH_INTERVAL_MS = 60_000

export function createKimSnapshotMetaPoller({
  fetchSnapshotMeta: fetcher,
  setInterval: setIntervalFn = globalThis.setInterval?.bind(globalThis),
  clearInterval: clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  intervalMs = REFRESH_INTERVAL_MS,
} = {}) {
  const listeners = new Set()
  let latestSnapshot = null
  let timer = null
  let inFlight = null

  function notify(snapshot) {
    for (const listener of listeners) listener(snapshot)
  }

  async function refresh() {
    if (inFlight) return inFlight
    inFlight = Promise.resolve()
      .then(() => fetcher())
      .then((snapshot) => {
        latestSnapshot = snapshot
        notify(snapshot)
        return snapshot
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  function start() {
    if (!timer && listeners.size > 0 && typeof setIntervalFn === 'function') {
      timer = setIntervalFn(() => {
        refresh().catch(() => {})
      }, intervalMs)
      // Cold start: don't make the first subscriber wait a full intervalMs
      // for data. refresh() already coalesces via inFlight, so this can't
      // race a subscriber's own manual refresh(). Swallow rejection here
      // since nothing else awaits this fire-and-forget call.
      refresh().catch(() => {})
    }
  }

  function stopIfIdle() {
    if (listeners.size === 0 && timer && typeof clearIntervalFn === 'function') {
      clearIntervalFn(timer)
      timer = null
    }
  }

  function subscribe(listener) {
    listeners.add(listener)
    if (latestSnapshot) listener(latestSnapshot)
    start()
    return () => {
      listeners.delete(listener)
      stopIfIdle()
    }
  }

  return { subscribe, refresh }
}

const sharedKimSnapshotMetaPoller = createKimSnapshotMetaPoller({ fetchSnapshotMeta })

export function useKimSnapshotMeta(enabled) {
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    return sharedKimSnapshotMetaPoller.subscribe(setSnapshot)
  }, [enabled])

  return snapshot
}

export default useKimSnapshotMeta
