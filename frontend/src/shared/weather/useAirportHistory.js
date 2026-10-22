import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAirportHistory } from '../../api/airportHistoryApi.js'

// 공항 METAR·TAF 과거 보기 상태: 처음 ◀를 누를 때 한 번 받는다(카드·패널마다 미리 받지 않게).
// offset 0 = 최신(화면에 이미 있는 것), 1 = 한 건 전 …. items는 최신순 보관 보고(서버 airport-history.js).
// currentTime이 있으면 그보다 새것은 빼고 센다 — 화면의 "최신"과 보관본의 첫 항목이 같은 보고일 때 한 칸이 헛돌지 않게.
export function useAirportHistory(icao, type, { currentTime = null } = {}) {
  const [state, setState] = useState({ status: 'idle', items: [] })
  const [offset, setOffset] = useState(0)
  const controllerRef = useRef(null)
  useEffect(() => { setOffset(0); setState({ status: 'idle', items: [] }) }, [icao, type])
  useEffect(() => () => controllerRef.current?.abort(), [])

  const load = useCallback(async () => {
    if (state.status === 'loading' || state.status === 'ready') return state.items
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'loading', items: [] })
    try {
      const { items } = await fetchAirportHistory(icao, type, { signal: controller.signal })
      setState({ status: 'ready', items })
      return items
    } catch (error) {
      if (error?.name !== 'AbortError') setState({ status: 'error', items: [] })
      return []
    }
  }, [icao, type, state])

  const current = Date.parse(currentTime)
  const past = state.items.filter((item) => !Number.isFinite(current) || Date.parse(item.time) < current)
  const older = async () => {
    const items = state.status === 'ready' ? state.items : await load()
    const available = items.filter((item) => !Number.isFinite(current) || Date.parse(item.time) < current).length
    setOffset((value) => Math.min(value + 1, available))
  }
  return {
    offset,
    item: offset > 0 ? past[offset - 1] ?? null : null,
    // 아직 받지 않았으면 ◀를 열어 둔다(누르면 받아서 판단).
    canOlder: state.status !== 'ready' ? state.status !== 'error' : offset < past.length,
    canNewer: offset > 0,
    status: state.status,
    older,
    newer: () => setOffset((value) => Math.max(0, value - 1)),
    latest: () => setOffset(0),
  }
}
