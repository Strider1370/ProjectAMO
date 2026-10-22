import { useEffect, useMemo, useState } from 'react'
import { fetchAirportHistory } from '../../api/airportHistoryApi.js'
import { historyEntries } from './airportHistoryModel.js'

// 공항 METAR·TAF 이력 줄 상태: 보이면 바로 받는다(몇 건이 있는지·추세를 한눈에 보이려고).
// selected = 고른 칸(기본 = 최신). latest·latestTime은 화면에 이미 있는 최신 보고.
export function useAirportHistory(icao, type, { latest = null, latestTime = null, latestKind = null } = {}) {
  const [state, setState] = useState({ status: 'idle', items: [] })
  const [selectedKey, setSelectedKey] = useState('latest')
  useEffect(() => {
    setSelectedKey('latest')
    if (!icao) { setState({ status: 'idle', items: [] }); return undefined }
    const controller = new AbortController()
    setState({ status: 'loading', items: [] })
    fetchAirportHistory(icao, type, { signal: controller.signal })
      .then(({ items }) => setState({ status: 'ready', items }))
      .catch((error) => { if (error?.name !== 'AbortError') setState({ status: 'error', items: [] }) })
    return () => controller.abort()
  }, [icao, type])

  const entries = useMemo(() => historyEntries(type, state.items, { latest, latestTime, latestKind, icao }), [type, state.items, latest, latestTime, latestKind, icao])
  const selected = entries.find((entry) => entry.key === selectedKey) ?? entries.at(-1) ?? null
  return { status: state.status, entries, selected, select: setSelectedKey }
}
