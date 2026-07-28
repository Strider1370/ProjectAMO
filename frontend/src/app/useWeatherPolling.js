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

export function useSnapshotPolling(options) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialError, setInitialError] = useState(null)
  const snapshotRef = useRef(null)
  const pollingRef = useRef(false)
  const mountedRef = useRef(false)

  const fetchInitialData = useCallback(async () => {
    const {
      loadInitialData, selectInitialData, onInitialData, buildSnapshot,
      initialErrorMode = 'silent', logPrefix = '[App]',
    } = optionsRef.current
    try {
      const result = await loadInitialData()
      if (!mountedRef.current) return
      const initialData = selectInitialData(result)
      setData(initialData)
      snapshotRef.current = buildSnapshot(initialData)
      onInitialData?.(result)
    } catch (err) {
      if (!mountedRef.current) return
      if (initialErrorMode === 'state') {
        setInitialError(err.message)
      } else {
        console.warn(`${logPrefix} Initial data fetch failed:`, err.message)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  const pollChangedData = useCallback(async () => {
    if (pollingRef.current) return
    if (!snapshotRef.current) {
      await fetchInitialData()
      return
    }
    const { fetchSnapshot, detectChanges, hasChanges, loadChangedData, advanceSnapshot, logPrefix = '[App]' } = optionsRef.current
    pollingRef.current = true
    try {
      const latestSnapshot = await fetchSnapshot()
      if (!mountedRef.current || !latestSnapshot) return

      const changes = detectChanges(latestSnapshot, snapshotRef.current)
      if (!hasChanges(changes)) return

      const changedData = await loadChangedData(changes)
      if (!mountedRef.current) return

      setData((prev) => {
        const mergedData = mergePollingData(prev, changedData)
        if (!hasIncompletePollingData(changedData)) {
          snapshotRef.current = advanceSnapshot({
            latestSnapshot, changedData, previousSnapshot: snapshotRef.current, mergedData,
          })
        }
        return mergedData
      })
    } catch (err) {
      console.warn(`${logPrefix} Incremental fetch failed:`, err.message)
    } finally {
      pollingRef.current = false
    }
  }, [fetchInitialData])

  useEffect(() => {
    mountedRef.current = true
    fetchInitialData()
    return () => { mountedRef.current = false }
  }, [fetchInitialData])

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

  const applyData = useCallback((updater, computeSnapshot) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (computeSnapshot) snapshotRef.current = computeSnapshot(next)
      return next
    })
  }, [])

  return { data, loading, initialError, applyData }
}

function useWeatherPolling() {
  const loadedDeferredKeysRef = useRef(new Set())

  const { data: weatherData, applyData } = useSnapshotPolling({
    loadInitialData: loadWeatherData,
    selectInitialData: (data) => data,
    fetchSnapshot: fetchSnapshotMeta,
    buildSnapshot: buildSnapshotMetaFromData,
    detectChanges: (latest, saved) => detectSnapshotChanges(saved, latest),
    hasChanges: hasSnapshotChanges,
    loadChangedData: (changes) => loadChangedWeatherData(changes, { deferredKeys: loadedDeferredKeysRef.current }),
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

    try {
      const deferredData = await loadDeferredWeatherData(missingKeys)
      applyData((prev) => ({ ...(prev || {}), ...deferredData }), buildSnapshotMetaFromData)
    } catch (err) {
      missingKeys.forEach((key) => loadedDeferredKeysRef.current.delete(key))
      console.warn('[App] Weather deferred fetch failed:', err.message)
    }
  }, [applyData])

  return { weatherData, requestDeferredWeatherData }
}

export default useWeatherPolling
