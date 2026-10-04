import { useEffect, useMemo, useState } from 'react'
import { airportWarningState } from './airportWarningModel.js'
import { animateAirportWarnings } from './airportWarningLayers.js'

export function useAirportWarningOverlay({ mapRef, isStyleReady, styleRevision, warningData, airports, nowMs = null }) {
  const [clockRevision, setClockRevision] = useState(0)
  const state = useMemo(() => airportWarningState(warningData, nowMs ?? Date.now()), [warningData, nowMs, clockRevision])
  const hasWarnings = airports.some((airport) => state.warnedAirports.includes(airport.icao)
    && Number.isFinite(airport.lon) && Number.isFinite(airport.lat))

  useEffect(() => {
    if (nowMs !== null || !Number.isFinite(state.nextChangeAtMs)) return undefined
    const timer = setTimeout(() => setClockRevision((value) => value + 1),
      Math.min(2_147_483_647, Math.max(1, state.nextChangeAtMs - Date.now() + 1)))
    return () => clearTimeout(timer)
  }, [state.nextChangeAtMs, clockRevision, nowMs])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    return animateAirportWarnings(map, { hasWarnings })
  }, [mapRef, isStyleReady, styleRevision, hasWarnings])

  return state
}
