import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildSnapshotMetaFromData,
  fetchSnapshotMeta,
  loadChangedWeatherData,
  loadDeferredWeatherData,
  loadWeatherData,
} from '../api/weatherApi.js'
import { detectSnapshotChanges, hasSnapshotChanges } from './snapshotMeta.js'
import { hasIncompletePollingData, mergePollingData } from './pollingData.js'

const REFRESH_INTERVAL_MS = 60_000

// A request may still settle after abort(), so cancellation alone is not a commit
// guard.  Keep a view epoch for complete reloads and a generation for every data
// key that can be written by polling or a deferred panel request.
export function createPollingRequestGate() {
  let viewEpoch = 0
  const generations = new Map()
  const active = new Map()

  const abort = (controller) => controller?.abort()

  return {
    invalidateView() {
      viewEpoch += 1
      new Set([...active.values()].map((entry) => entry.controller)).forEach(abort)
      active.clear()
      return viewEpoch
    },
    begin(keys) {
      const controller = new AbortController()
      const entries = [...new Set(keys)].map((key) => {
        const previous = active.get(key)
        abort(previous?.controller)
        const generation = (generations.get(key) || 0) + 1
        generations.set(key, generation)
        const entry = { key, generation, controller }
        active.set(key, entry)
        return entry
      })
      return { epoch: viewEpoch, entries, controller }
    },
    isCurrent(token) {
      return token.epoch === viewEpoch && token.entries.every((entry) => {
        const current = active.get(entry.key)
        return current?.generation === entry.generation && current.controller === entry.controller
      })
    },
    release(token) {
      token.entries.forEach((entry) => {
        const current = active.get(entry.key)
        if (current?.generation === entry.generation && current.controller === entry.controller) {
          active.delete(entry.key)
        }
      })
    },
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function useSnapshotPolling(options) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialError, setInitialError] = useState(null)
  const snapshotRef = useRef(null)
  const pollingRef = useRef(null)
  const mountedRef = useRef(false)
  const gateRef = useRef(null)
  const initialRetryTimerRef = useRef(null)
  if (!gateRef.current) gateRef.current = createPollingRequestGate()

  const isCurrent = useCallback((token) => (
    mountedRef.current && gateRef.current.isCurrent(token)
  ), [])

  const clearInitialRetry = useCallback(() => {
    if (initialRetryTimerRef.current !== null) {
      window.clearTimeout(initialRetryTimerRef.current)
      initialRetryTimerRef.current = null
    }
  }, [])

  const fetchInitialData = useCallback(async () => {
    const {
      loadInitialData, selectInitialData, onInitialData, buildSnapshot,
      initialErrorMode = 'silent', logPrefix = '[App]',
      initialRetryDelayMs,
    } = optionsRef.current
    gateRef.current.invalidateView()
    const token = gateRef.current.begin(['initial'])
    try {
      const result = await loadInitialData({ signal: token.controller.signal })
      if (!isCurrent(token)) return false
      const initialData = selectInitialData(result)
      setData(initialData)
      snapshotRef.current = buildSnapshot(initialData)
      onInitialData?.(result)
      setInitialError(null)
      clearInitialRetry()
      return true
    } catch (err) {
      if (!isCurrent(token)) return false
      if (initialErrorMode === 'state') {
        setInitialError(err.message)
      } else {
        console.warn(`${logPrefix} Initial data fetch failed:`, err.message)
      }
      if (Number.isFinite(initialRetryDelayMs) && initialRetryDelayMs > 0) {
        clearInitialRetry()
        initialRetryTimerRef.current = window.setTimeout(() => {
          initialRetryTimerRef.current = null
          if (mountedRef.current) fetchInitialData()
        }, initialRetryDelayMs)
      }
      return false
    } finally {
      const current = isCurrent(token)
      gateRef.current.release(token)
      if (current) setLoading(false)
    }
  }, [clearInitialRetry, isCurrent])

  const pollChangedData = useCallback(async () => {
    if (pollingRef.current) return
    if (!snapshotRef.current) {
      await fetchInitialData()
      return
    }
    const { fetchSnapshot, detectChanges, hasChanges, loadChangedData, advanceSnapshot, logPrefix = '[App]' } = optionsRef.current
    const snapshotToken = gateRef.current.begin(['snapshot'])
    pollingRef.current = snapshotToken
    try {
      const latestSnapshot = await fetchSnapshot({ signal: snapshotToken.controller.signal })
      if (!isCurrent(snapshotToken) || !latestSnapshot) return

      const changes = detectChanges(latestSnapshot, snapshotRef.current)
      if (!hasChanges(changes)) return

      gateRef.current.release(snapshotToken)
      const changedKeys = Object.keys(changes).filter((key) => changes[key])
      const changedToken = gateRef.current.begin(changedKeys)
      const changedData = await loadChangedData(changes, { signal: changedToken.controller.signal })
      if (!isCurrent(changedToken)) return

      setData((prev) => {
        if (!isCurrent(changedToken)) return prev
        const mergedData = mergePollingData(prev, changedData)
        if (!hasIncompletePollingData(changedData)) {
          snapshotRef.current = advanceSnapshot({
            latestSnapshot, changedData, previousSnapshot: snapshotRef.current, mergedData,
          })
        }
        return mergedData
      })
    } catch (err) {
      if (!isAbortError(err)) console.warn(`${logPrefix} Incremental fetch failed:`, err.message)
    } finally {
      if (pollingRef.current === snapshotToken) pollingRef.current = null
      gateRef.current.release(snapshotToken)
    }
  }, [fetchInitialData, isCurrent])

  useEffect(() => {
    mountedRef.current = true
    fetchInitialData()
    return () => {
      mountedRef.current = false
      clearInitialRetry()
      gateRef.current.invalidateView()
    }
  }, [clearInitialRetry, fetchInitialData])

  useEffect(() => {
    const { intervalMs } = optionsRef.current
    if (intervalMs === null || intervalMs === undefined) return undefined
    const timer = window.setInterval(pollChangedData, intervalMs)
    return () => window.clearInterval(timer)
  }, [options.intervalMs, pollChangedData])

  useEffect(() => {
    const refreshView = () => fetchInitialData()
    window.addEventListener('projectamo:data-view-changed', refreshView)
    return () => window.removeEventListener('projectamo:data-view-changed', refreshView)
  }, [fetchInitialData])

  const applyData = useCallback((updater, computeSnapshot, token = null) => {
    setData((prev) => {
      if (token && !isCurrent(token)) return prev
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (computeSnapshot) snapshotRef.current = computeSnapshot(next, snapshotRef.current)
      return next
    })
  }, [isCurrent])

  return { data, loading, initialError, applyData, beginRequest: (keys) => gateRef.current.begin(keys), isRequestCurrent: isCurrent }
}

function useWeatherPolling() {
  const loadedDeferredKeysRef = useRef(new Set())

  const { data: weatherData, applyData, beginRequest, isRequestCurrent } = useSnapshotPolling({
    loadInitialData: loadWeatherData,
    selectInitialData: (data) => data,
    fetchSnapshot: fetchSnapshotMeta,
    buildSnapshot: buildSnapshotMetaFromData,
    detectChanges: (latest, saved) => {
      const changes = detectSnapshotChanges(saved, latest)
      for (const key of ['adsb', 'groundOverview', 'environment', 'airportInfo']) {
        if (!loadedDeferredKeysRef.current.has(key)) changes[key] = false
      }
      return changes
    },
    hasChanges: hasSnapshotChanges,
    loadChangedData: (changes, requestOptions) => loadChangedWeatherData(changes, {
      deferredKeys: loadedDeferredKeysRef.current,
      ...requestOptions,
    }),
    advanceSnapshot: ({ latestSnapshot, mergedData }) => ({
      ...buildSnapshotMetaFromData(mergedData),
      viewRevision: latestSnapshot.viewRevision,
    }),
    intervalMs: REFRESH_INTERVAL_MS,
    initialErrorMode: 'silent',
    logPrefix: '[App]',
  })

  const requestDeferredWeatherData = useCallback(async (keys = []) => {
    const missingKeys = keys.filter((key) => !loadedDeferredKeysRef.current.has(key))
    if (missingKeys.length === 0) return
    missingKeys.forEach((key) => loadedDeferredKeysRef.current.add(key))
    const token = beginRequest(missingKeys)

    try {
      const deferredData = await loadDeferredWeatherData(missingKeys, { signal: token.controller.signal })
      if (!isRequestCurrent(token)) return
      applyData(
        (prev) => ({ ...(prev || {}), ...deferredData }),
        (next, previousSnapshot) => ({
          ...buildSnapshotMetaFromData(next),
          viewRevision: previousSnapshot?.viewRevision,
        }),
        token,
      )
    } catch (err) {
      if (isRequestCurrent(token)) {
        missingKeys.forEach((key) => loadedDeferredKeysRef.current.delete(key))
        if (!isAbortError(err)) console.warn('[App] Weather deferred fetch failed:', err.message)
      }
    }
  }, [applyData, beginRequest, isRequestCurrent])

  return { weatherData, requestDeferredWeatherData }
}

export default useWeatherPolling
