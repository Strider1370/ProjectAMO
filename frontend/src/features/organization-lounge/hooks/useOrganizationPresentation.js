import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { organizationRequest } from '../api.js'
import {
  activeRunFlightIndex,
  acceptCandidateResponse,
  appliedBundlesFromRun,
  candidateBundle,
  hydratePresentationBundle,
  presentationFlight,
  runFlights,
} from '../lib/presentationModel.js'

function isAbort(error) { return error?.name === 'AbortError' }
function storageKey(orgId, sessionId) { return `projectamo:organization-presentation:${orgId}:${sessionId}` }

export default function useOrganizationPresentation({ orgId, sessionId }) {
  const [session, setSession] = useState(null)
  const [run, setRun] = useState(null)
  const [displayedBundles, setDisplayedBundles] = useState({})
  const [candidates, setCandidates] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestTokensRef = useRef(new Map())
  const requestEpochRef = useRef(0)
  const runRef = useRef(null)
  const mountedRef = useRef(true)
  useEffect(() => { runRef.current = run }, [run])
  useEffect(() => () => { mountedRef.current = false }, [])

  const flights = useMemo(() => runFlights(session, run), [session, run])
  const currentPinnedFlight = flights[currentIndex] || flights[0] || null
  const currentBundle = currentPinnedFlight ? displayedBundles[String(currentPinnedFlight.id)] || null : null
  const currentFlight = presentationFlight(currentPinnedFlight, currentBundle)
  const currentCandidate = currentPinnedFlight ? candidates[String(currentPinnedFlight.id)] || null : null

  const applyCandidate = useCallback(async (candidate, targetRun = runRef.current) => {
    const bundle = candidate?.bundle || candidateBundle(candidate)
    const flightId = candidate?.flightId ?? bundle?.flight?.id ?? bundle?.flightId
    if (!targetRun || !bundle?.bundleId || flightId == null) return null
    setBusy(true); setError('')
    try {
      const result = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(targetRun.id)}/apply`, {
        method: 'POST',
        body: { expectedRunVersion: targetRun.version, flightId, bundleId: bundle.bundleId },
      })
      if (!mountedRef.current || String(runRef.current?.id) !== String(targetRun.id)) return null
      const nextRun = result.run || result
      requestEpochRef.current += 1
      requestTokensRef.current.clear()
      runRef.current = nextRun
      setRun(nextRun)
      setDisplayedBundles((previous) => ({ ...previous, [String(flightId)]: hydratePresentationBundle(bundle, nextRun) }))
      // A refreshed organization snapshot can reorder flights and invalidates every
      // candidate prepared against the prior run snapshot.
      setCandidates({})
      const appliedIndex = runFlights(null, nextRun).findIndex((flight) => String(flight.id) === String(flightId))
      if (appliedIndex >= 0) setCurrentIndex(appliedIndex)
      return nextRun
    } catch (reason) {
      if (!isAbort(reason)) setError(reason.status === 409 ? '발표 상태가 변경되었습니다. 표시 자료와 후보는 유지했으므로 다시 준비해 주세요.' : reason.message)
      return null
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [orgId, sessionId])

  const prepareCandidate = useCallback(async (flight, {
    applyImmediately = false,
    refreshOrganization = true,
    targetRun = runRef.current,
  } = {}) => {
    if (!flight?.id || !targetRun?.id) return null
    const flightId = String(flight.id)
    const requestEpoch = requestEpochRef.current
    const token = (requestTokensRef.current.get(flightId) || 0) + 1
    requestTokensRef.current.set(flightId, token)
    try {
      const response = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(targetRun.id)}/candidates`, {
        method: 'POST',
        body: { flightId: flight.id, flightVersion: flight.version, refreshOrganization },
      })
      const accepted = acceptCandidateResponse({ expectedRunId: targetRun.id, expectedFlightId: flight.id, response })
      if (!mountedRef.current || requestEpochRef.current !== requestEpoch
        || requestTokensRef.current.get(flightId) !== token
        || String(runRef.current?.id) !== String(targetRun.id)
        || Number(runRef.current?.version) !== Number(targetRun.version) || !accepted) return null
      const hydrated = { ...accepted, bundle: hydratePresentationBundle(accepted.bundle, targetRun) }
      if (applyImmediately) return applyCandidate(hydrated, runRef.current)
      setCandidates((previous) => ({ ...previous, [flightId]: hydrated }))
      return hydrated
    } catch (reason) {
      if (!isAbort(reason) && mountedRef.current) setError(reason.message)
      return null
    }
  }, [applyCandidate, orgId, sessionId])

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    async function initialize() {
      setLoading(true); setError('')
      try {
        const sessionResult = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        const nextSession = sessionResult.briefing || sessionResult
        setSession(nextSession)
        let nextRun = null
        const savedRunId = sessionStorage.getItem(storageKey(orgId, sessionId))
        if (savedRunId) {
          try {
            const restored = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(savedRunId)}`, { signal: controller.signal })
            nextRun = restored.run || restored
            if (nextRun.status !== 'active') nextRun = null
          } catch (reason) {
            if (reason.status !== 404 && reason.code !== 'run_ended') throw reason
            sessionStorage.removeItem(storageKey(orgId, sessionId))
          }
        }
        if (!nextRun) {
          const started = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}/runs`, {
            method: 'POST', body: { expectedVersion: nextSession.version }, signal: controller.signal,
          })
          nextRun = started.run || started
          sessionStorage.setItem(storageKey(orgId, sessionId), String(nextRun.id))
        }
        if (controller.signal.aborted) return
        runRef.current = nextRun
        setRun(nextRun)
        const restoredIndex = activeRunFlightIndex(nextSession, nextRun)
        setCurrentIndex(restoredIndex)
        const restoredBundles = appliedBundlesFromRun(nextRun)
        setDisplayedBundles(restoredBundles)
        const firstFlight = runFlights(nextSession, nextRun)[restoredIndex]
        if (firstFlight && !restoredBundles[String(firstFlight.id)]) {
          await prepareCandidate(firstFlight, { applyImmediately: true, refreshOrganization: false, targetRun: nextRun })
        }
      } catch (reason) {
        if (!isAbort(reason)) setError(reason.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    initialize()
    return () => controller.abort()
  }, [orgId, sessionId, prepareCandidate])

  useEffect(() => {
    if (!run?.id || run.status !== 'active' || !currentPinnedFlight?.id) return undefined
    const timer = window.setInterval(() => prepareCandidate(currentPinnedFlight), 60_000)
    return () => window.clearInterval(timer)
  }, [run?.id, run?.status, currentPinnedFlight?.id, currentPinnedFlight?.version, prepareCandidate])

  useEffect(() => {
    // initialize() owns the first candidate and auto-apply. Starting a second
    // request here would supersede its request token and leave the first screen empty.
    if (loading || !run?.id || run.status !== 'active' || !currentPinnedFlight?.id || currentBundle || currentCandidate) return
    prepareCandidate(currentPinnedFlight)
  }, [loading, run?.id, run?.status, currentPinnedFlight?.id, currentPinnedFlight?.version, currentBundle, currentCandidate, prepareCandidate])

  useEffect(() => {
    if (!session?.id) return undefined
    const timer = window.setInterval(async () => {
      try {
        const result = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}`)
        const next = result.briefing || result
        if (mountedRef.current) setSession(next)
      } catch { /* the current immutable run remains usable */ }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [orgId, sessionId, session?.id])

  const move = useCallback((delta) => {
    setCurrentIndex((index) => {
      if (!flights.length) return 0
      return (index + delta + flights.length) % flights.length
    })
  }, [flights.length])

  const end = useCallback(async () => {
    const targetRun = runRef.current
    if (!targetRun) return false
    setBusy(true); setError('')
    try {
      const result = await organizationRequest(orgId, `/briefings/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(targetRun.id)}/end`, {
        method: 'POST', body: { expectedRunVersion: targetRun.version },
      })
      const ended = result.run || result
      runRef.current = ended
      setRun(ended)
      sessionStorage.removeItem(storageKey(orgId, sessionId))
      return true
    } catch (reason) {
      setError(reason.status === 409 ? '이미 종료되었거나 발표 버전이 변경되었습니다.' : reason.message)
      return false
    } finally { if (mountedRef.current) setBusy(false) }
  }, [orgId, sessionId])

  return {
    session, run, flights, currentFlight, currentPinnedFlight, currentBundle, currentCandidate,
    currentIndex, loading, busy, error, setError, move,
    organizationChanged: Boolean(session?.version && run?.pinnedSnapshot?.briefing?.version
      && Number(session.version) !== Number(run.pinnedSnapshot.briefing.version)),
    prepareCurrent: () => prepareCandidate(currentPinnedFlight),
    applyCurrent: () => applyCandidate(currentCandidate),
    end,
  }
}
