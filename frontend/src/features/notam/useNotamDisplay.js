import { useEffect, useMemo, useRef, useState } from 'react'
import { filterNotamTime, deriveNotamTime, NOTAM_CATEGORIES } from './lib/notamViewModel.js'

export function useNotamDisplay(payload, referenceNowMs) {
  const anchor = useRef({ reference: referenceNowMs, at: Date.now() })
  if (anchor.current.reference !== referenceNowMs) anchor.current = { reference: referenceNowMs, at: Date.now() }
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const nowMs = Number.isFinite(referenceNowMs) ? referenceNowMs + Date.now() - anchor.current.at : Date.now()
  const [categoryFilter, setCategoryFilter] = useState(() => NOTAM_CATEGORIES.map(category => category.id))
  const [locationFilter, setLocationFilter] = useState('all')
  const [activeOnly, setActiveOnly] = useState(false)
  const visibleItems = filterNotamTime(payload?.items, nowMs, activeOnly)
  const visibleIds = visibleItems.map(item => item.id).join('|')
  const visiblePayload = useMemo(() => ({ ...payload, items: visibleItems }), [payload, visibleIds])
  const timeRevision = visibleItems.map(item => `${item.id}:${deriveNotamTime(item, nowMs).state}`).join('|')
  const uncertainCount = useMemo(() => (payload?.items || []).filter(item =>
    categoryFilter.includes(item.category) && (locationFilter === 'all' || item.location === locationFilter)
    && deriveNotamTime(item, nowMs).state === 'conditional').length, [payload, nowMs, categoryFilter, locationFilter])
  return { payload: visiblePayload, nowMs, timeRevision, categoryFilter, setCategoryFilter, locationFilter, setLocationFilter, activeOnly, setActiveOnly, uncertainCount }
}
