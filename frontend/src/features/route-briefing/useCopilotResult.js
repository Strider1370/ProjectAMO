import { useEffect, useRef, useState } from 'react'
import { createBriefingProvider, createBriefingRequestGate } from './lib/briefingProvider.js'
import { copilotResultContext } from './lib/copilotResult.js'

// A read-only result overlays, but does not mutate, the user's applied route/draft.
export function useCopilotResult({ ownerId, routeState, activePanel, ready, canOpen = () => true }) {
  const [bundle, setBundle] = useState(null)
  const gate = useRef(createBriefingRequestGate())
  const current = useRef(null)
  const activeRef = useRef(false)
  const screenKey = JSON.stringify([routeState.routeForm, routeState.routeDraftText, routeState.routeResult,
    routeState.selectedRouteDesignId, routeState.activeAppliedDesignId, routeState.etd, routeState.eta,
    routeState.cruiseAltitudeFt, routeState.nwpTimeSelection, routeState.briefingContext,
    routeState.selectedSid, routeState.selectedStar, routeState.selectedIapKey])
  current.current = { ownerId, screenKey, ready, activePanel, canOpen }
  activeRef.current = Boolean(bundle)
  function close() { gate.current.cancel(); activeRef.current = false; setBundle(null) }
  useEffect(() => { close() }, [ownerId, screenKey])
  const previousPanel = useRef(activePanel)
  useEffect(() => {
    // Opening mobile chat hides the briefing sheet, not its route context. Cancel
    // pending navigation, but preserve the displayed frozen route until Close.
    if (previousPanel.current !== activePanel) gate.current.cancel()
    previousPanel.current = activePanel
  }, [activePanel])
  useEffect(() => () => gate.current.cancel(), [])
  async function open(reference) {
    if (!current.current.ready) throw new Error('MAP_NOT_READY')
    if (!current.current.canOpen()) throw new Error('MAP_EDIT_ACTIVE')
    if (!current.current.ownerId) throw new Error('AUTH_REQUIRED')
    const start = current.current
    const request = gate.current.begin()
    let value
    try { value = await createBriefingProvider({ kind: 'copilot', reference }).load({ signal: request.signal }) }
    catch (error) {
      if (!request.isCurrent()) throw new Error('RESULT_OPEN_CANCELLED')
      throw error
    }
    if (!request.isCurrent() || start.ownerId !== current.current.ownerId || start.screenKey !== current.current.screenKey
      || start.activePanel !== current.current.activePanel
      || !current.current.ready || !current.current.canOpen()) throw new Error('RESULT_OPEN_CANCELLED')
    setBundle(value)
    return value
  }
  return { bundle, open, close, activeRef, getContext: () => copilotResultContext(bundle) }
}
