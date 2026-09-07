import { useEffect, useRef, useState } from 'react'
import { fetchModelComparison } from '../../api/modelComparisonApi.js'

export function useModelComparison(icao, { refreshMs = 60_000 } = {}) {
  const [state, setState] = useState({ icao, data: null, loading: !!icao, error: null, refreshing: false })
  const sequence = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    const normalized = String(icao || '').toUpperCase()
    const controller = new AbortController()
    let inFlight = false
    active.current = true
    const request = async (refreshing = false) => {
      if (!normalized || inFlight) return
      inFlight = true
      const requestId = ++sequence.current
      setState(current => current.icao === normalized
        ? { ...current, loading: !current.data, refreshing: !!current.data && refreshing }
        : { icao: normalized, data: null, loading: true, error: null, refreshing: false })
      try {
        const data = await fetchModelComparison(normalized, { signal: controller.signal })
        if (active.current && requestId === sequence.current) setState({ icao: normalized, data, loading: false, error: null, refreshing: false })
      } catch (error) {
        if (error?.name !== 'AbortError' && active.current && requestId === sequence.current) {
          setState(current => ({ icao: normalized, data: current.icao === normalized ? current.data : null, loading: false, error, refreshing: false }))
        }
      } finally { inFlight = false }
    }
    request(false)
    const timer = setInterval(() => request(true), refreshMs)
    return () => { active.current = false; sequence.current += 1; controller.abort(); clearInterval(timer) }
  }, [icao, refreshMs])

  return state.icao === String(icao || '').toUpperCase()
    ? state
    : { icao, data: null, loading: !!icao, error: null, refreshing: false }
}

export default useModelComparison
