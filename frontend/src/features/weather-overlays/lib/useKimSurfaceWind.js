import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchKimNwpField,
  fetchKimNwpIndex,
  fetchKimSurfaceWind,
} from '../../../api/weatherApi.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'
import { kimFieldCache } from './kimFieldCache.js'
import { prefetchKimNeighbors } from './kimNeighborPrefetch.js'

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

// KIM 레이어(바람·착빙·난류)를 처음 켤 때의 고도. 이 고도에 자료가 없으면 목록의 첫 고도를 쓴다.
export const KIM_DEFAULT_LEVEL = '700hPa'

export function selectDefaultKimNwp(index, nowMs = null) {
  const levels = index?.levels || []
  const candidates = [levels.find((level) => level.id === KIM_DEFAULT_LEVEL), levels[0]].filter(Boolean)
  for (const level of candidates) {
    const time = getSelectableTimes(index.times, nowMs).find((candidate) =>
      selectKimNwpAvailability(index, { level: level.id, hf: candidate.hf }))
    if (time) return withDomain(index, { tmfc: index.latestRun, level: level.id, hf: time.hf })
  }
  return null
}

// 목록이 정한 KIM 영역(한반도 kr·확대 ea)을 선택값에 싣는다. 필드 요청·캐시 키가 이 값을 따른다.
function withDomain(index, selection) {
  return index?.domain && index.domain !== 'kr' ? { ...selection, domain: index.domain } : (({ domain, ...rest }) => rest)(selection)
}

export function selectFallbackKimNwpSelection(index, currentSelection, nowMs = null) {
  if (!index) return null
  if (selectKimNwpAvailability(index, currentSelection)) {
    const currentTime = (index.times || []).find((time) => Number(time.hf) === Number(currentSelection.hf))
    if (getSelectableTimes(index.times, nowMs).some((time) => Number(time.hf) === Number(currentTime?.hf))) {
      return withDomain(index, { ...currentSelection, tmfc: index.latestRun })
    }
  }
  const currentLevel = currentSelection?.level
  if (currentLevel) {
    const time = getSelectableTimes(index.times, nowMs).find((candidate) =>
      selectKimNwpAvailability(index, { level: currentLevel, hf: candidate.hf }))
    if (time) return withDomain(index, { tmfc: index.latestRun, level: currentLevel, hf: time.hf })
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
  // 확대 영역(ea) 회차는 같은 발표시각의 한반도 회차와 다른 자료라 키를 나눈다. 한반도 키는 그대로 둔다.
  const scope = selection.domain && selection.domain !== 'kr' ? `${selection.domain}:` : ''
  const base = `${scope}${selection.tmfc}:${Number(selection.hf)}:${selection.level}`
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
  const cacheRef = useRef(kimFieldCache.view('wind'))
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
  }, [enabled, selection?.domain, selection?.tmfc, selection?.hf, selection?.level, selection?.revision, selection?.bundleId])

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


  // 지금 장이 다 뜨면 이웃 시각·고도를 미리 받아 둔다(kimNeighborPrefetch.js).
  useEffect(() => {
    if (!enabled || pinned || status !== 'ready') return
    prefetchKimNeighbors({ type: 'wind', index: windIndex, selection, canRequest: (index, candidate) => !!selectKimNwpAvailability(index, candidate) })
  }, [enabled, pinned, status, windIndex, selection?.domain, selection?.tmfc, selection?.hf, selection?.level])
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
