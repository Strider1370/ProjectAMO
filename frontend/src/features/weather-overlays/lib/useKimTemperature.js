import { useEffect, useRef, useState } from 'react'
import {
  fetchKimTemperatureField,
  fetchKimTemperatureIndex,
} from '../../../api/weatherApi.js'
import {
  normalizeKimNwpIndex,
  getKimNwpFieldForSelection,
  selectFallbackKimNwpSelection,
  selectKimNwpAvailability,
} from './useKimSurfaceWind.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'
import { kimFieldCache } from './kimFieldCache.js'
import { prefetchKimNeighbors } from './kimNeighborPrefetch.js'
import { pressureKimIndex } from './cloudIcingModel.js'

function selectionKey(selection) {
  if (!selection?.tmfc || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  // 확대 영역(ea) 회차는 같은 발표시각의 한반도 회차와 다른 자료라 키를 나눈다. 한반도 키는 그대로 둔다.
  const scope = selection.domain && selection.domain !== 'kr' ? `${selection.domain}:` : ''
  const base = `${scope}${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
  return selection.mode === 'pinned'
    ? `${selection.bundleId || 'bundle'}:${base}:${selection.revision || 'missing-revision'}:T`
    : `${base}:T`
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function useKimTemperature(enabled, selection, setSelection, { dataMode = 'live', pressureOnly = false } = {}) {
  const [temperatureField, setTemperatureField] = useState(null)
  const [temperatureFieldKey, setTemperatureFieldKey] = useState(null)
  const [temperatureIndex, setTemperatureIndex] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const cacheRef = useRef(kimFieldCache.view('temperature'))
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
      setTemperatureIndex(null)
      setTemperatureField(null)
      setTemperatureFieldKey(null)
      setStatus(selection?.revision ? 'loading' : 'unsupported')
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false

    async function loadIndex() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      try {
        const rawIndex = await fetchKimTemperatureIndex({ signal: controller.signal })
        const index = pressureOnly ? pressureKimIndex(rawIndex) : rawIndex
        if (cancelled) return
        setTemperatureIndex(index)
        setSelection?.((prev) => selectFallbackKimNwpSelection(index, prev) || null)
        if (!normalizeKimNwpIndex(index).defaultSelection && !selectFallbackKimNwpSelection(index, selection)) {
          setTemperatureField(null)
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
  }, [enabled, refreshToken, pinned, selection?.bundleId, selection?.revision, pressureOnly])

  useEffect(() => {
    if (!enabled || !selection) return undefined
    if (pressureOnly && !/^\d+(?:\.\d+)?hPa$/.test(selection.level)) {
      setTemperatureField(null)
      setTemperatureFieldKey(null)
      setStatus('unavailable')
      return undefined
    }
    if (!pinned && temperatureIndex && !selectKimNwpAvailability(temperatureIndex, selection)) {
      setTemperatureField(null)
      setStatus('unavailable')
      return undefined
    }
    const key = selectionKey(selection)
    if (!key) return undefined
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    if (cacheRef.current.has(key)) {
      setTemperatureField(cacheRef.current.get(key))
      setTemperatureFieldKey(key)
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()

    async function loadField() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setTemperatureFieldKey(null)
      try {
        const field = await fetchKimTemperatureField(selection, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, field)
        setTemperatureField(field)
        setTemperatureFieldKey(key)
        setError(null)
        setStatus('ready')
      } catch (loadError) {
        if (isAbortError(loadError) || requestTokenRef.current !== token) return
        setTemperatureField(null)
        setTemperatureFieldKey(null)
        setError(loadError)
        setStatus('error')
      }
    }

    loadField()
    return () => controller.abort()
  }, [enabled, pinned, selection?.domain, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId, temperatureIndex, pressureOnly])

  useEffect(() => {
    if (!enabled || pinned || !snapshotMeta) return
    const baseMeta = snapshotMeta?.kimNwp || snapshotMeta?.kim_nwp || null
    const nextHash = baseMeta?.variables?.T?.hash || baseMeta?.hash || null
    if (!nextHash) return
    if (nextHash !== metaHashRef.current) {
      metaHashRef.current = nextHash
      cacheRef.current.clear()
      setRefreshToken((value) => value + 1)
    }
  }, [enabled, pinned, snapshotMeta])

  const normalized = normalizeKimNwpIndex(temperatureIndex)

  // 지금 장이 다 뜨면 이웃 시각·고도를 미리 받아 둔다(kimNeighborPrefetch.js).
  useEffect(() => {
    if (!enabled || pinned || status !== 'ready') return
    prefetchKimNeighbors({ type: 'temp', index: temperatureIndex, selection, canRequest: (index, candidate) => !!selectKimNwpAvailability(index, candidate) && (!pressureOnly || /hPa$/.test(candidate.level)) })
  }, [enabled, pinned, status, temperatureIndex, selection?.domain, selection?.tmfc, selection?.hf, selection?.level])
  return {
    temperatureField: getKimNwpFieldForSelection(temperatureField, temperatureFieldKey, selection, 'T'),
    temperatureIndex: normalized.windIndex,
    availableLevels: normalized.availableLevels,
    availableTimes: normalized.availableTimes,
    status,
    error,
  }
}
