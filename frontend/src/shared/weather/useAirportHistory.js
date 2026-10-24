import { useEffect, useMemo, useState } from 'react'
import { fetchAirportHistory } from '../../api/airportHistoryApi.js'
import { historyEntries } from './airportHistoryModel.js'

const CACHE_MS = 60_000
const historyCache = new Map()

function cachedItems(key) {
  const entry = historyCache.get(key)
  if (!entry || Date.now() - entry.fetchedAt >= CACHE_MS) return null
  return entry.items
}

// 최신 보고는 즉시 표시하고, 보관 이력은 별도 요청한다. 같은 공항을 다시 열면 최근 응답을 먼저 보여준다.
// selected = 고른 칸(기본 = 최신). latest·latestTime은 화면에 이미 있는 최신 보고.
export function useAirportHistory(icao, type, { latest = null, latestTime = null, latestKind = null } = {}) {
  const key = icao ? `${icao}:${type}:${latestTime ?? 'none'}` : null
  const [state, setState] = useState(() => {
    const cached = cachedItems(key)
    return { key, status: cached ? 'ready' : 'idle', items: cached ?? [] }
  })
  const [selectedKey, setSelectedKey] = useState('latest')
  useEffect(() => {
    setSelectedKey('latest')
    if (!icao) { setState({ key: null, status: 'idle', items: [] }); return undefined }
    const controller = new AbortController()
    const cached = cachedItems(key)
    setState({ key, status: cached ? 'ready' : 'loading', items: cached ?? [] })
    fetchAirportHistory(icao, type, { signal: controller.signal })
      .then(({ items }) => {
        historyCache.set(key, { items, fetchedAt: Date.now() })
        if (historyCache.size > 40) historyCache.delete(historyCache.keys().next().value)
        setState({ key, status: 'ready', items })
      })
      .catch((error) => { if (error?.name !== 'AbortError') setState({ key, status: 'error', items: cached ?? [] }) })
    return () => controller.abort()
  }, [icao, type, key])

  const items = state.key === key ? state.items : cachedItems(key) ?? []
  const entries = useMemo(() => historyEntries(type, items, { latest, latestTime, latestKind, icao }), [type, items, latest, latestTime, latestKind, icao])
  const selected = entries.find((entry) => entry.key === selectedKey) ?? entries.at(-1) ?? null
  return { status: state.key === key ? state.status : 'loading', entries, selected, select: setSelectedKey }
}
