import { useEffect, useRef, useState } from 'react'
import { fetchKtgGrid, fetchKtgIndex } from '../../../api/weatherApi.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'

const DEFAULT_ALT_FT = 3000

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function useKtgTurbulence(enabled, selection) {
  const [altLevelsFt, setAltLevelsFt] = useState([])
  const [selectedAltFt, setSelectedAltFtState] = useState(DEFAULT_ALT_FT)
  const [hours, setHours] = useState([])
  const [defaultHf, setDefaultHf] = useState(null)
  const [ktgGrid, setKtgGrid] = useState(null)
  const [ktgGridKey, setKtgGridKey] = useState(null)
  const [status, setStatus] = useState('idle')
  const cacheRef = useRef(new Map())
  const requestTokenRef = useRef(0)

  const snapshot = useKimSnapshotMeta(enabled)
  const ktgHash = snapshot?.ktg?.hash ?? null

  // 예보시간: 메인 타임라인이 세팅한 공유 selection.hf를 읽음(NWP와 시간축 공유).
  // 그 hf가 KTG에 없거나 selection이 없으면 nearest 기본값으로.
  const availableHfs = hours.map((h) => Number(h.hf))
  const selHf = Number(selection?.hf)
  const effectiveHf = Number.isFinite(selHf) && availableHfs.includes(selHf) ? selHf : defaultHf

  // Invalidate grid cache when backend data changes.
  useEffect(() => {
    if (!enabled) return
    cacheRef.current.clear()
  }, [enabled, ktgHash])

  // Fetch index to get available altitude levels.
  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false
    async function loadIndex() {
      try {
        const index = await fetchKtgIndex({ signal: controller.signal })
        if (cancelled) return
        const levels = index?.altLevelsFt ?? []
        setAltLevelsFt(levels)
        setHours(index?.hours ?? [])
        setDefaultHf(Number.isFinite(Number(index?.hf)) ? Number(index.hf) : (index?.hours?.[0]?.hf ?? null))
        if (levels.length === 0) {
          setStatus('unavailable')
          return
        }
        // If the current selection is not in the list, pick the closest level.
        if (levels.length > 0) {
          setSelectedAltFtState((prev) => {
            if (levels.includes(prev)) return prev
            return levels.reduce((best, ft) => (Math.abs(ft - prev) < Math.abs(best - prev) ? ft : best))
          })
        }
      } catch (err) {
        if (cancelled || isAbortError(err)) return
        setStatus('error')
      }
    }
    loadIndex()
    return () => { cancelled = true; controller.abort() }
  }, [enabled, ktgHash])

  // Fetch grid for selected altitude + effective forecast hour.
  useEffect(() => {
    if (!enabled || !selectedAltFt || effectiveHf == null) return undefined
    const key = `ktg:${selectedAltFt}:${effectiveHf}`
    if (cacheRef.current.has(key)) {
      setKtgGrid(cacheRef.current.get(key))
      setKtgGridKey(key)
      setStatus('ready')
      return undefined
    }
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    const controller = new AbortController()
    async function loadGrid() {
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'))
      setKtgGridKey(null)
      try {
        const data = await fetchKtgGrid({ altFt: selectedAltFt, hf: effectiveHf }, { signal: controller.signal })
        if (requestTokenRef.current !== token || controller.signal.aborted) return
        cacheRef.current.set(key, data)
        setKtgGrid(data)
        setKtgGridKey(key)
        setStatus('ready')
      } catch (err) {
        if (isAbortError(err) || requestTokenRef.current !== token) return
        setKtgGrid(null)
        setKtgGridKey(null)
        setStatus('error')
      }
    }
    loadGrid()
    return () => controller.abort()
  }, [enabled, selectedAltFt, effectiveHf])

  function setSelectedAltFt(altFt) {
    setSelectedAltFtState(altFt)
  }

  return {
    ktgGrid: ktgGridKey ? ktgGrid : null,
    altLevelsFt,
    selectedAltFt,
    setSelectedAltFt,
    status,
    // 메인 타임라인이 난류 켜졌을 때 쓸 예보시간 목록.
    availableTimes: hours,
  }
}

export default useKtgTurbulence
