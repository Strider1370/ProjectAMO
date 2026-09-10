import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchKimNwpField,
  fetchKimNwpIndex,
  fetchKimSurfaceWind,
} from '../../../api/weatherApi.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'

function getLowPowerState() {
  if (typeof window === 'undefined') return false
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const saveData = navigator.connection?.saveData
  return !!(reducedMotion || saveData)
}

export function selectKimNwpAvailability(index, selection) {
  if (!index || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  return index.availability?.[selection.level]?.[String(selection.hf)] || null
}

function getSelectableTimes(times = [], nowMs = null) {
  if (!Number.isFinite(nowMs)) return times
  const futureTimes = []
  let nearestPast = null
  for (const time of times) {
    const validMs = Date.parse(time?.validTime)
    if (!Number.isFinite(validMs)) continue
    if (validMs >= nowMs) {
      futureTimes.push(time)
    } else if (!nearestPast || validMs > nearestPast.validMs) {
      nearestPast = { time, validMs }
    }
  }
  return nearestPast ? [nearestPast.time, ...futureTimes] : futureTimes
}

export function selectDefaultKimNwp(index, nowMs = null) {
  const preferredLevel = index?.levels?.[0]
  if (!preferredLevel) return null
  const time = getSelectableTimes(index.times, nowMs).find((candidate) =>
    selectKimNwpAvailability(index, { level: preferredLevel.id, hf: candidate.hf }))
  return time ? { tmfc: index.latestRun, level: preferredLevel.id, hf: time.hf } : null
}

export function selectFallbackKimNwpSelection(index, currentSelection, nowMs = null) {
  if (!index) return null
  if (selectKimNwpAvailability(index, currentSelection)) {
    const currentTime = (index.times || []).find((time) => Number(time.hf) === Number(currentSelection.hf))
    if (getSelectableTimes(index.times, nowMs).some((time) => Number(time.hf) === Number(currentTime?.hf))) {
      return { ...currentSelection, tmfc: index.latestRun }
    }
  }
  const currentLevel = currentSelection?.level
  if (currentLevel) {
    const time = getSelectableTimes(index.times, nowMs).find((candidate) =>
      selectKimNwpAvailability(index, { level: currentLevel, hf: candidate.hf }))
    if (time) return { tmfc: index.latestRun, level: currentLevel, hf: time.hf }
  }
  return selectDefaultKimNwp(index, nowMs)
}

export function normalizeKimNwpIndex(index, nowMs = null) {
  return {
    windIndex: index || null,
    availableLevels: index?.levels || [],
    availableTimes: index?.times || [],
    defaultSelection: selectDefaultKimNwp(index, nowMs),
  }
}

function selectionKey(selection) {
  if (!selection?.tmfc || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  const base = `${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
  return selection.mode === 'pinned'
    ? `${selection.bundleId || 'bundle'}:${base}:${selection.revision || 'missing-revision'}`
    : base
}

export function getKimNwpFieldForSelection(field, fieldKey, selection, suffix = '') {
  if (!field) return null
  const key = selectionKey(selection)
  const expectedKey = suffix ? `${key}:${suffix}` : key
  return expectedKey && fieldKey === expectedKey ? field : null
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function useKimSurfaceWind(enabled, controlledSelection = null, onSelectionChange = null, { dataMode = 'live' } = {}) {
  const [windField, setWindField] = useState(null)
  const [windIndex, setWindIndex] = useState(null)
  const [internalSelection, setInternalSelection] = useState(null)
  const [windFieldKey, setWindFieldKey] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const lowPower = useMemo(() => getLowPowerState(), [])
  const cacheRef = useRef(new Map())
  const requestTokenRef = useRef(0)
  const metaHashRef = useRef(null)
  const pinned = dataMode === 'pinned'
  const snapshotMeta = useKimSnapshotMeta(enabled && !pinned)
  const selection = controlledSelection || internalSelection
  const setSelection = onSelectionChange || setInternalSelection

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return undefined
    }
    if (pinned) {
      setWindIndex(null)
      setWindField(null)
      setWindFieldKey(null)
      setMeta(selection ? { hash: selection.revision, tmfc: selection.tmfc, hf: selection.hf } : null)
      setStatus(selection?.revision ? 'loading' : 'unsupported')
      return undefined
    }

    const controller = new AbortController()
    let cancelled = false

    async function loadIndex() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      try {
        const index = await fetchKimNwpIndex({ signal: controller.signal })
        if (cancelled) return
        const normalized = normalizeKimNwpIndex(index)
        setWindIndex(index)
        setMeta({
          hash: index?.content_hash || null,
          tmfc: index?.latestRun || null,
          updated_at: index?.updated_at || null,
        })
        metaHashRef.current = index?.content_hash || metaHashRef.current
        setSelection((prev) => {
          const nextSelection = selectFallbackKimNwpSelection(index, prev) || normalized.defaultSelection
          if (!nextSelection) setStatus('error')
          return nextSelection
        })
        setError(null)
      } catch (loadError) {
        if (cancelled || isAbortError(loadError)) return
        try {
          const field = await fetchKimSurfaceWind()
          if (cancelled) return
          setWindField(field)
          setWindFieldKey(null)
          setWindIndex(null)
          setSelection(null)
          setMeta({
            hash: field?.content_hash || null,
            tmfc: field?.time?.tmfc || null,
            hf: field?.time?.hf ?? null,
            updated_at: field?.fetched_at || null,
          })
          metaHashRef.current = field?.content_hash || metaHashRef.current
          setError(null)
          setStatus('ready')
        } catch (fallbackError) {
          if (cancelled || isAbortError(fallbackError)) return
          setError(fallbackError)
          setStatus('error')
        }
      }
    }

    loadIndex()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled, refreshToken, pinned, selection?.bundleId, selection?.revision])

  useEffect(() => {
    if (!enabled || !selection) return undefined
    const key = selectionKey(selection)
    if (!key) return undefined

    const token = requestTokenRef.current + 1
    requestTokenRef.current = token

    if (cacheRef.current.has(key)) {
      setWindField(cacheRef.current.get(key))
      setWindFieldKey(key)
      setStatus('ready')
      return undefined
    }

    const controller = new AbortController()

    async function loadField() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setWindFieldKey(null)
      try {
        const field = await fetchKimNwpField(selection, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, field)
        setWindField(field)
        setWindFieldKey(key)
        setMeta({
          hash: field?.content_hash || meta?.hash || null,
          tmfc: field?.time?.tmfc || null,
          hf: field?.time?.hf ?? null,
          updated_at: field?.fetched_at || null,
        })
        setError(null)
        setStatus('ready')
      } catch (loadError) {
        if (isAbortError(loadError) || requestTokenRef.current !== token) return
        setWindField(null)
        setWindFieldKey(null)
        setError(loadError)
        setStatus('error')
      }
    }

    loadField()
    return () => controller.abort()
  }, [enabled, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId])

  useEffect(() => {
    if (!enabled || pinned || !snapshotMeta) return
    const baseMeta = snapshotMeta?.kimNwp || snapshotMeta?.kim_nwp || snapshotMeta?.kimSurfaceWind || snapshotMeta?.kim_surface_wind || null
    const nextMeta = baseMeta?.variables?.uv?.hash
      ? { ...baseMeta, hash: baseMeta.variables.uv.hash }
      : baseMeta
    if (!nextMeta?.hash) return
    if (nextMeta.hash !== metaHashRef.current) {
      metaHashRef.current = nextMeta.hash
      cacheRef.current.clear()
      setRefreshToken((value) => value + 1)
    } else {
      setMeta(nextMeta)
    }
  }, [enabled, pinned, snapshotMeta])

  const normalized = normalizeKimNwpIndex(windIndex)

  return {
    windField: windIndex ? getKimNwpFieldForSelection(windField, windFieldKey, selection) : windField,
    windIndex: normalized.windIndex,
    selection,
    setSelection,
    availableLevels: normalized.availableLevels,
    availableTimes: normalized.availableTimes,
    status,
    error,
    meta,
    lowPower,
  }
}

export default useKimSurfaceWind
