import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_FILTERS } from './trafficFilter.js'
import { STORAGE_KEY, parseStoredFilters, serializeFilters } from './trafficStorage.js'

// 필터 상태 + 브라우저 저장. 켜기/끄기는 여기 없다(다른 지도 레이어와 같이 저장하지 않는다).
export default function useTrafficFilters() {
  const [filters, setFiltersState] = useState(() => {
    try { return parseStoredFilters(window.localStorage.getItem(STORAGE_KEY)) } catch { return { ...DEFAULT_FILTERS } }
  })

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, serializeFilters(filters)) } catch { /* 저장 실패는 무시 — 필터는 계속 동작한다 */ }
  }, [filters])

  const setFilters = useCallback((patch) => {
    setFiltersState((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState({ ...DEFAULT_FILTERS })
  }, [])

  return { filters, setFilters, resetFilters }
}
