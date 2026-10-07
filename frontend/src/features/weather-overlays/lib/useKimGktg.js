import { useEffect, useRef, useState } from 'react'
import {
  fetchKimGktgField,
  fetchKimGktgIndex,
} from '../../../api/weatherApi.js'
import {
  normalizeKimNwpIndex,
  selectFallbackKimNwpSelection,
  selectKimNwpAvailability,
} from './useKimSurfaceWind.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'
import { kimFieldCache } from './kimFieldCache.js'

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function makeKimGktgSelectionKey(selection) {
  if (!selection?.tmfc || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  const base = `${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
  return selection.mode === 'pinned'
    ? `${selection.bundleId || 'bundle'}:${base}:${selection.revision || 'missing-revision'}:gktg`
    : `${base}:${selection.revision || 'missing-revision'}:gktg`
}

export function selectGktgFallbackSelection(index, currentSelection, nowMs = null) {
  return selectFallbackKimNwpSelection(index, currentSelection, nowMs)
}

export function getKimGktgSnapshotHash(snapshot) {
  const baseMeta = snapshot?.kimNwp || snapshot?.kim_nwp || null
  return baseMeta?.variables?.gktg?.hash || null
}

export function getKimGktgFieldForSelection(field, fieldKey, selection) {
  return field && fieldKey === makeKimGktgSelectionKey(selection) ? field : null
}

export function canRequestKimGktgField(index, selection) {
  return !!(index && selection?.tmfc === index.latestRun && selectKimNwpAvailability(index, selection))
}

export function useKimGktg(enabled, selection, setSelection, { dataMode = 'live' } = {}) {
  const [gktgField, setGktgField] = useState(null)
  const [gktgFieldKey, setGktgFieldKey] = useState(null)
  const [gktgIndex, setGktgIndex] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const cacheRef = useRef(kimFieldCache.view('gktg'))
  const requestTokenRef = useRef(0)
  const metaHashRef = useRef(null)
  const pinned = dataMode === 'pinned'
  const snapshotMeta = useKimSnapshotMeta(enabled && !pinned)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return undefined
    }
    if (pinned) {
      setGktgIndex(null)
      setGktgField(null)
      setGktgFieldKey(null)
      setStatus(selection?.revision ? 'loading' : 'unsupported')
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false

    async function loadIndex() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      try {
        const index = await fetchKimGktgIndex({ signal: controller.signal })
        if (cancelled) return
        const fallbackSelection = selectGktgFallbackSelection(index, selection)
        setGktgIndex(index)
        setSelection?.((prev) => selectGktgFallbackSelection(index, prev) || null)
        if (!normalizeKimNwpIndex(index).defaultSelection && !fallbackSelection) {
          setGktgField(null)
          setGktgFieldKey(null)
          setStatus('unavailable')
        }
        setError(null)
      } catch (loadError) {
        if (cancelled || isAbortError(loadError)) return
        setError(loadError)
        setStatus('error')
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
    if (!pinned && !gktgIndex) return undefined
    if (!pinned && !canRequestKimGktgField(gktgIndex, selection)) {
      setGktgField(null)
      setGktgFieldKey(null)
      setStatus('unavailable')
      return undefined
    }
    const requested = pinned ? selection : { ...selection, revision: selectKimNwpAvailability(gktgIndex, selection)?.hashes?.gktg }
    const key = makeKimGktgSelectionKey(requested)
    if (!key) return undefined
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    if (cacheRef.current.has(key)) {
      setGktgField(cacheRef.current.get(key))
      setGktgFieldKey(key)
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()

    async function loadField() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setGktgFieldKey(null)
      try {
        const field = await fetchKimGktgField(requested, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, field)
        setGktgField(field)
        setGktgFieldKey(key)
        setError(null)
        setStatus('ready')
      } catch (loadError) {
        if (isAbortError(loadError) || requestTokenRef.current !== token) return
        setGktgField(null)
        setGktgFieldKey(null)
        setError(loadError)
        setStatus('error')
      }
    }

    loadField()
    return () => controller.abort()
  }, [enabled, pinned, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId, gktgIndex])

  useEffect(() => {
    if (!enabled || pinned || !snapshotMeta) return
    const nextHash = getKimGktgSnapshotHash(snapshotMeta)
    if (!nextHash) return
    if (nextHash !== metaHashRef.current) {
      metaHashRef.current = nextHash
      cacheRef.current.clear()
      setRefreshToken((value) => value + 1)
    }
  }, [enabled, pinned, snapshotMeta])

  const normalized = normalizeKimNwpIndex(gktgIndex)
  return {
    gktgField: getKimGktgFieldForSelection(gktgField, gktgFieldKey, pinned ? selection : { ...selection, revision: selectKimNwpAvailability(gktgIndex, selection)?.hashes?.gktg }),
    gktgIndex: normalized.windIndex,
    availableLevels: normalized.availableLevels,
    availableTimes: normalized.availableTimes,
    status,
    error,
  }
}

export default useKimGktg
