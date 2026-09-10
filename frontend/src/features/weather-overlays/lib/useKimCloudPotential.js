import { useEffect, useRef, useState } from 'react'
import {
  fetchKimCloudPotentialField,
  fetchKimCloudPotentialIndex,
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

export function makeKimCloudSelectionKey(selection) {
  if (!selection?.tmfc || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  const base = `${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
  return selection.mode === 'pinned'
    ? `${selection.bundleId || 'bundle'}:${base}:${selection.revision || 'missing-revision'}:cloud`
    : `${base}:cloud`
}

export function selectCloudFallbackSelection(index, currentSelection, nowMs = null) {
  return selectFallbackKimNwpSelection(index, currentSelection, nowMs)
}

export function getKimCloudSnapshotHash(snapshot) {
  const baseMeta = snapshot?.kimNwp || snapshot?.kim_nwp || null
  return baseMeta?.variables?.cloud?.hash || baseMeta?.hash || null
}

export function getKimCloudFieldForSelection(field, fieldKey, selection) {
  return getKimNwpFieldForSelection(field, fieldKey, selection, 'cloud')
}

export function canRequestKimCloudField(index, selection) {
  return !!(index && selection && selectKimNwpAvailability(index, selection))
}

export function useKimCloudPotential(enabled, selection, setSelection, { dataMode = 'live' } = {}) {
  const [cloudField, setCloudField] = useState(null)
  const [cloudFieldKey, setCloudFieldKey] = useState(null)
  const [cloudIndex, setCloudIndex] = useState(null)
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
      setCloudIndex(null)
      setCloudField(null)
      setCloudFieldKey(null)
      setStatus(selection?.revision ? 'loading' : 'unsupported')
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false

    async function loadIndex() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      try {
        const index = await fetchKimCloudPotentialIndex({ signal: controller.signal })
        if (cancelled) return
        const fallbackSelection = selectCloudFallbackSelection(index, selection)
        setCloudIndex(index)
        setSelection?.((prev) => selectCloudFallbackSelection(index, prev) || null)
        if (!normalizeKimNwpIndex(index).defaultSelection && !fallbackSelection) {
          setCloudField(null)
          setCloudFieldKey(null)
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
    if (!pinned && !cloudIndex) return undefined
    if (!pinned && !canRequestKimCloudField(cloudIndex, selection)) {
      setCloudField(null)
      setCloudFieldKey(null)
      setStatus('unavailable')
      return undefined
    }
    const key = makeKimCloudSelectionKey(selection)
    if (!key) return undefined
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    if (cacheRef.current.has(key)) {
      setCloudField(cacheRef.current.get(key))
      setCloudFieldKey(key)
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()

    async function loadField() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setCloudFieldKey(null)
      try {
        const field = await fetchKimCloudPotentialField(selection, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, field)
        setCloudField(field)
        setCloudFieldKey(key)
        setError(null)
        setStatus('ready')
      } catch (loadError) {
        if (isAbortError(loadError) || requestTokenRef.current !== token) return
        setCloudField(null)
        setCloudFieldKey(null)
        setError(loadError)
        setStatus('error')
      }
    }

    loadField()
    return () => controller.abort()
  }, [enabled, pinned, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId, cloudIndex])

  useEffect(() => {
    if (!enabled || pinned || !snapshotMeta) return
    const nextHash = getKimCloudSnapshotHash(snapshotMeta)
    if (!nextHash) return
    if (nextHash !== metaHashRef.current) {
      metaHashRef.current = nextHash
      cacheRef.current.clear()
      setRefreshToken((value) => value + 1)
    }
  }, [enabled, pinned, snapshotMeta])

  const normalized = normalizeKimNwpIndex(cloudIndex)
  return {
    cloudField: getKimCloudFieldForSelection(cloudField, cloudFieldKey, selection),
    cloudIndex: normalized.windIndex,
    availableLevels: normalized.availableLevels,
    availableTimes: normalized.availableTimes,
    status,
    error,
  }
}

export default useKimCloudPotential
