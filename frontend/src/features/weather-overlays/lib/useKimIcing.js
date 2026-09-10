import { useEffect, useRef, useState } from 'react'
import {
  fetchKimIcingField,
  fetchKimIcingIndex,
} from '../../../api/weatherApi.js'
import {
  getKimNwpFieldForSelection,
  normalizeKimNwpIndex,
  selectFallbackKimNwpSelection,
  selectKimNwpAvailability,
} from './useKimSurfaceWind.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function makeKimIcingSelectionKey(selection) {
  if (!selection?.tmfc || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  const base = `${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
  return selection.mode === 'pinned'
    ? `${selection.bundleId || 'bundle'}:${base}:${selection.revision || 'missing-revision'}:icing`
    : `${base}:icing`
}

export function selectIcingFallbackSelection(index, currentSelection, nowMs = null) {
  return selectFallbackKimNwpSelection(index, currentSelection, nowMs)
}

export function getKimIcingSnapshotHash(snapshot) {
  const baseMeta = snapshot?.kimNwp || snapshot?.kim_nwp || null
  return baseMeta?.variables?.icing?.hash || baseMeta?.hash || null
}

export function getKimIcingFieldForSelection(field, fieldKey, selection) {
  return getKimNwpFieldForSelection(field, fieldKey, selection, 'icing')
}

export function canRequestKimIcingField(index, selection) {
  return !!(index && selection && selectKimNwpAvailability(index, selection))
}

export function useKimIcing(enabled, selection, setSelection, { dataMode = 'live' } = {}) {
  const [icingField, setIcingField] = useState(null)
  const [icingFieldKey, setIcingFieldKey] = useState(null)
  const [icingIndex, setIcingIndex] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const cacheRef = useRef(new Map())
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
      setIcingIndex(null)
      setIcingField(null)
      setIcingFieldKey(null)
      setStatus(selection?.revision ? 'loading' : 'unsupported')
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false

    async function loadIndex() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      try {
        const index = await fetchKimIcingIndex({ signal: controller.signal })
        if (cancelled) return
        const fallbackSelection = selectIcingFallbackSelection(index, selection)
        setIcingIndex(index)
        setSelection?.((prev) => selectIcingFallbackSelection(index, prev) || null)
        if (!normalizeKimNwpIndex(index).defaultSelection && !fallbackSelection) {
          setIcingField(null)
          setIcingFieldKey(null)
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
    if (!pinned && !icingIndex) return undefined
    if (!pinned && !canRequestKimIcingField(icingIndex, selection)) {
      setIcingField(null)
      setIcingFieldKey(null)
      setStatus('unavailable')
      return undefined
    }
    const key = makeKimIcingSelectionKey(selection)
    if (!key) return undefined
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    if (cacheRef.current.has(key)) {
      setIcingField(cacheRef.current.get(key))
      setIcingFieldKey(key)
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()

    async function loadField() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setIcingFieldKey(null)
      try {
        const field = await fetchKimIcingField(selection, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, field)
        setIcingField(field)
        setIcingFieldKey(key)
        setError(null)
        setStatus('ready')
      } catch (loadError) {
        if (isAbortError(loadError) || requestTokenRef.current !== token) return
        setIcingField(null)
        setIcingFieldKey(null)
        setError(loadError)
        setStatus('error')
      }
    }

    loadField()
    return () => controller.abort()
  }, [enabled, pinned, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId, icingIndex])

  useEffect(() => {
    if (!enabled || pinned || !snapshotMeta) return
    const nextHash = getKimIcingSnapshotHash(snapshotMeta)
    if (!nextHash) return
    if (nextHash !== metaHashRef.current) {
      metaHashRef.current = nextHash
      cacheRef.current.clear()
      setRefreshToken((value) => value + 1)
    }
  }, [enabled, pinned, snapshotMeta])

  const normalized = normalizeKimNwpIndex(icingIndex)
  return {
    icingField: getKimIcingFieldForSelection(icingField, icingFieldKey, selection),
    icingIndex: normalized.windIndex,
    availableLevels: normalized.availableLevels,
    availableTimes: normalized.availableTimes,
    status,
    error,
  }
}

export default useKimIcing
