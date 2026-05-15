import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchVerticalProfile } from '../../api/briefingApi.js'
import { getProcedures, KNOWN_AIRPORTS } from './lib/procedureData.js'
import { buildBriefingRoute, buildVfrRoute, canBuildBriefingRoutePath, loadIapData, loadNavpoints, loadRouteDirectionMetadata } from './lib/routePlanner.js'
import { relabeledWaypoints } from './lib/routePreview.js'
import { buildVerticalProfileRequest } from './lib/verticalProfileRequest.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  buildBoundaryFixOptions,
  buildIapCandidates,
  buildInitialVfrWaypoints,
  buildRoutePreviewModel,
  buildVisibleSidOptions,
  chooseIapKeyForRunway,
  filterProceduresByRunway,
  getCurrentRouteLineString,
  getVfrAirportAltitudeFt,
  getWindDirection,
  pickBestRunwayGroup,
} from './lib/routeBriefingModel.js'

export const initialRouteForm = {
  flightRule: 'IFR',
  departureAirport: '', entryFix: '',
  exitFix: '', arrivalAirport: '', routeType: 'RNAV',
}
export const DEFAULT_CRUISE_ALTITUDE_FT = 9000

export function useRouteBriefing({ activePanel, airports = [], metarData = null }) {
  const [routeForm, setRouteForm] = useState(initialRouteForm)
  const [routeResult, setRouteResult] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(DEFAULT_CRUISE_ALTITUDE_FT)
  const [verticalProfile, setVerticalProfile] = useState(null)
  const [verticalProfileLoading, setVerticalProfileLoading] = useState(false)
  const [verticalProfileError, setVerticalProfileError] = useState(null)
  const [verticalProfileStale, setVerticalProfileStale] = useState(false)
  const [verticalProfileWindowOpen, setVerticalProfileWindowOpen] = useState(false)
  const [editingVfrAltitudeIndex, setEditingVfrAltitudeIndex] = useState(null)
  const [vfrWaypoints, setVfrWaypoints] = useState([])
  const [hoveredWpInfo, setHoveredWpInfo] = useState(null)
  const [sidOptions, setSidOptions] = useState([])
  const [availableSidIds, setAvailableSidIds] = useState(null)
  const [starOptions, setStarOptions] = useState([])
  const [selectedSid, setSelectedSid] = useState(null)
  const [selectedStar, setSelectedStar] = useState(null)
  const [iapData, setIapData] = useState(null)
  const [iapCandidates, setIapCandidates] = useState([])
  const [selectedIapKey, setSelectedIapKey] = useState(null)
  const [firInOptions, setFirInOptions] = useState([])
  const [firExitOptions, setFirExitOptions] = useState([])
  const [navpointsById, setNavpointsById] = useState({})
  const [autoRecommendRequested, setAutoRecommendRequested] = useState(false)
  const [fitBoundsRequest, setFitBoundsRequest] = useState(null)

  const vfrWaypointsRef = useRef([])
  const hideTimerRef = useRef(null)
  const sidRequestRef = useRef(0)
  const starRequestRef = useRef(0)
  const iapRequestRef = useRef(0)
  const sidFilterRequestRef = useRef(0)
  const routeSearchRequestRef = useRef(0)
  const verticalProfileRequestRef = useRef(0)
  const fitBoundsRequestRef = useRef(0)

  const isFirInMode = routeForm.flightRule === 'IFR' && routeForm.departureAirport === FIR_IN_AIRPORT
  const isFirExitMode = routeForm.flightRule === 'IFR' && routeForm.arrivalAirport === FIR_EXIT_AIRPORT
  const selectedIap = iapData?.iapRoutes?.[selectedIapKey] ?? null
  const visibleSidOptions = useMemo(() => buildVisibleSidOptions(sidOptions, availableSidIds), [availableSidIds, sidOptions])
  const routePreviewModel = useMemo(() => buildRoutePreviewModel({
    routeForm,
    routeResult,
    vfrWaypoints,
    selectedSid,
    selectedStar,
    selectedIap,
    navpointsById,
  }), [navpointsById, routeForm, routeResult, selectedIap, selectedSid, selectedStar, vfrWaypoints])

  useEffect(() => { vfrWaypointsRef.current = vfrWaypoints }, [vfrWaypoints])

  function clearRouteDisplay() {
    routeSearchRequestRef.current += 1
    verticalProfileRequestRef.current += 1
    setRouteResult(null)
    setRouteError(null)
    setRouteLoading(false)
    setVerticalProfile(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    setVfrWaypoints([])
    setFitBoundsRequest(null)
  }

  useEffect(() => {
    const airport = routeForm.departureAirport
    const requestId = ++sidRequestRef.current
    if (!KNOWN_AIRPORTS.includes(airport)) { setSidOptions([]); setSelectedSid(null); return }
    getProcedures(airport, 'SID').then((procs) => {
      if (requestId !== sidRequestRef.current) return
      setSidOptions(procs)
      setSelectedSid(null)
    })
  }, [routeForm.departureAirport])

  useEffect(() => {
    const requestId = ++sidFilterRequestRef.current

    if (routeForm.flightRule !== 'IFR' || !routeForm.exitFix) {
      setAvailableSidIds(null)
      return
    }

    Promise.all(
      sidOptions.map(async (proc) => {
        const allowed = await canBuildBriefingRoutePath({
          entryFix: proc.enrouteFix,
          exitFix: routeForm.exitFix,
          routeType: routeForm.routeType,
        })
        return allowed ? proc.id : null
      }),
    )
      .then((ids) => {
        if (requestId !== sidFilterRequestRef.current) return
        const filteredIds = ids.filter(Boolean)
        setAvailableSidIds(filteredIds.length > 0 ? filteredIds : null)
        if (filteredIds.length > 0 && selectedSid && !filteredIds.includes(selectedSid.id)) {
          setSelectedSid(null)
        }
      })
      .catch(() => {
        if (requestId === sidFilterRequestRef.current) setAvailableSidIds(null)
      })
  }, [routeForm.flightRule, routeForm.exitFix, routeForm.routeType, sidOptions, selectedSid])

  useEffect(() => {
    const airport = routeForm.arrivalAirport
    const requestId = ++starRequestRef.current
    if (!KNOWN_AIRPORTS.includes(airport)) { setStarOptions([]); setSelectedStar(null); return }
    getProcedures(airport, 'STAR').then((procs) => {
      if (requestId !== starRequestRef.current) return
      setStarOptions(procs)
      setSelectedStar(null)
    })
  }, [routeForm.arrivalAirport])

  useEffect(() => {
    let cancelled = false

    loadRouteDirectionMetadata()
      .then((metadata) => {
        if (cancelled) return
        const options = buildBoundaryFixOptions(metadata)
        setFirInOptions(options.firInOptions)
        setFirExitOptions(options.firExitOptions)
      })
      .catch(() => {
        if (!cancelled) {
          setFirInOptions([])
          setFirExitOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadNavpoints()
      .then((navpoints) => {
        if (!cancelled) setNavpointsById(navpoints ?? {})
      })
      .catch(() => {
        if (!cancelled) setNavpointsById({})
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const airport = routeForm.arrivalAirport
    const requestId = ++iapRequestRef.current
    if (KNOWN_AIRPORTS.includes(airport)) {
      loadIapData(airport).then((data) => {
        if (requestId === iapRequestRef.current) setIapData(data)
      })
    } else {
      setIapData(null)
      setIapCandidates([])
      setSelectedIapKey(null)
    }
  }, [routeForm.arrivalAirport])

  useEffect(() => {
    if (!selectedStar || !iapData) {
      setIapCandidates([])
      setSelectedIapKey(null)
      return
    }
    const { candidates } = buildIapCandidates(selectedStar, iapData)
    setIapCandidates(candidates)
    setSelectedIapKey((current) => buildIapCandidates(selectedStar, iapData, current).selectedIapKey)
  }, [selectedStar, iapData])

  useEffect(() => {
    if (verticalProfile) {
      setVerticalProfileStale(true)
    }
  }, [selectedSid, selectedStar, selectedIapKey, vfrWaypoints])

  useEffect(() => {
    let cancelled = false

    if (
      activePanel !== 'route-check' ||
      routeForm.flightRule !== 'IFR' ||
      !autoRecommendRequested
    ) {
      return () => {
        cancelled = true
      }
    }

    const isDomesticDeparture = KNOWN_AIRPORTS.includes(routeForm.departureAirport)
    const isDomesticArrival = KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)

    if (isFirInMode && !routeForm.entryFix) {
      return () => {
        cancelled = true
      }
    }

    if (isFirExitMode && !routeForm.exitFix) {
      return () => {
        cancelled = true
      }
    }

    if (
      !isFirInMode &&
      !isFirExitMode &&
      (!isDomesticDeparture || !isDomesticArrival || sidOptions.length === 0 || starOptions.length === 0 || !iapData)
    ) {
      return () => {
        cancelled = true
      }
    }

    if (isFirInMode && (!isDomesticArrival || starOptions.length === 0 || !iapData)) {
      return () => {
        cancelled = true
      }
    }

    if (isFirExitMode && (!isDomesticDeparture || sidOptions.length === 0)) {
      return () => {
        cancelled = true
      }
    }

    const departureCandidates = isFirInMode
      ? [{ sid: null, entryFix: routeForm.entryFix }]
      : filterProceduresByRunway(
          sidOptions,
          pickBestRunwayGroup(
            sidOptions.flatMap((proc) => proc.runways ?? []),
            getWindDirection(metarData, routeForm.departureAirport),
          ),
        ).map((sid) => ({ sid, entryFix: sid.enrouteFix ?? '' }))

    const arrivalRunwayGroup = pickBestRunwayGroup(
      starOptions
        .map((star) => iapData?.starToIapCandidates?.[star.id]?.runways ?? [])
        .flat(),
      getWindDirection(metarData, routeForm.arrivalAirport),
    )

    const arrivalCandidates = isFirExitMode
      ? [{ star: null, iapKey: null, exitFix: routeForm.exitFix }]
      : filterProceduresByRunway(
          starOptions
            .map((star) => {
              const entry = iapData.starToIapCandidates?.[star.id]
              return { star, entry, runways: entry?.runways ?? [] }
            })
            .filter(({ entry }) => entry),
          arrivalRunwayGroup,
        ).map(({ star, entry }) => ({
          star,
          iapKey: chooseIapKeyForRunway(entry, iapData, arrivalRunwayGroup),
          exitFix: star.startFix ?? '',
        }))

    Promise.all(
      departureCandidates.flatMap(({ sid, entryFix }) =>
        arrivalCandidates.map(async ({ star, iapKey, exitFix }) => {
          try {
            const result = await buildBriefingRoute({
              departureAirport: routeForm.departureAirport,
              arrivalAirport: routeForm.arrivalAirport,
              entryFix,
              exitFix,
              routeType: routeForm.routeType,
            })

            return {
              sid,
              star,
              iapKey,
              entryFix,
              exitFix,
              distanceNm: Number(result?.distanceNm) || Number.POSITIVE_INFINITY,
            }
          } catch {
            return null
          }
        }),
      ),
    ).then((results) => {
      if (cancelled) return

      const valid = results.filter(Boolean).sort((a, b) => a.distanceNm - b.distanceNm)
      const fallbackSid = departureCandidates[0] ?? null
      const fallbackArrival = arrivalCandidates[0] ?? null
      const best = valid[0] ?? (fallbackSid && fallbackArrival
        ? {
            sid: fallbackSid.sid ?? null,
            star: fallbackArrival.star,
            iapKey: fallbackArrival.iapKey,
            entryFix: fallbackSid.entryFix,
            exitFix: fallbackArrival.exitFix,
          }
        : null)

      if (!best) return

      setAutoRecommendRequested(false)
      setSelectedSid(best.sid ?? null)
      setSelectedStar(best.star ?? null)
      setSelectedIapKey(best.iapKey ?? null)
      setRouteForm((prev) => ({
        ...prev,
        entryFix: best.entryFix ?? prev.entryFix,
        exitFix: best.exitFix ?? prev.exitFix,
      }))
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [
    activePanel,
    iapData,
    isFirInMode,
    isFirExitMode,
    metarData,
    routeForm.arrivalAirport,
    routeForm.departureAirport,
    routeForm.entryFix,
    routeForm.exitFix,
    routeForm.flightRule,
    routeForm.routeType,
    sidOptions,
    starOptions,
    autoRecommendRequested,
  ])

  useEffect(() => {
    if (activePanel === 'route-check') return
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
  }, [activePanel])

  function updateRouteField(field, value) {
    setRouteForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleDepartureAirportChange(value) {
    clearRouteDisplay()
    updateRouteField('departureAirport', value)
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)

    if (value === FIR_IN_AIRPORT) {
      updateRouteField('entryFix', '')
    }
  }

  function handleArrivalAirportChange(value) {
    clearRouteDisplay()
    updateRouteField('arrivalAirport', value)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)

    if (value === FIR_EXIT_AIRPORT) {
      updateRouteField('exitFix', '')
    }
  }

  function handleEntryFixChange(value) {
    clearRouteDisplay()
    updateRouteField('entryFix', value)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleExitFixChange(value) {
    clearRouteDisplay()
    updateRouteField('exitFix', value)
    setSelectedSid(null)
    setAutoRecommendRequested(true)
  }

  function switchFlightRule(rule) {
    setRouteForm((prev) => ({ ...prev, flightRule: rule }))
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleAutoRecommend() {
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleSidChange(proc) {
    clearRouteDisplay()
    setAutoRecommendRequested(false)
    setSelectedSid(proc)
    if (proc) updateRouteField('entryFix', proc.enrouteFix ?? '')
  }

  function handleStarChange(proc) {
    clearRouteDisplay()
    setAutoRecommendRequested(false)
    setSelectedStar(proc)
    if (proc) updateRouteField('exitFix', proc.startFix ?? '')
  }

  function handleIapChange(key) {
    clearRouteDisplay()
    setAutoRecommendRequested(false)
    setSelectedIapKey(key || null)
  }

  function handleRouteReset() {
    clearRouteDisplay()
    setRouteForm((prev) => ({ ...initialRouteForm, flightRule: prev.flightRule }))
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAvailableSidIds(null)
    setAutoRecommendRequested(false)
  }

  function deleteVfrWaypoint(idx) {
    const next = relabeledWaypoints(vfrWaypoints.filter((_, i) => i !== idx))
    setVfrWaypoints(next)
    setHoveredWpInfo(null)
  }

  async function handleRouteSearch(e) {
    e.preventDefault()
    const requestId = ++routeSearchRequestRef.current
    setRouteLoading(true)
    setRouteError(null)
    setVerticalProfile(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    try {
      const result = routeForm.flightRule === 'VFR'
        ? await buildVfrRoute(routeForm)
        : await buildBriefingRoute(routeForm)
      if (requestId !== routeSearchRequestRef.current) return
      setRouteResult(result)
      if (result.flightRule === 'VFR') {
        const initialWaypoints = buildInitialVfrWaypoints(result, airports)
        setVfrWaypoints(initialWaypoints)
        const coords = initialWaypoints.map((wp) => [wp.lon, wp.lat])
        if (coords.length > 0) {
          setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: coords, maxZoom: 8 })
        }
      } else {
        setVfrWaypoints([])
        const routeGeometry = getCurrentRouteLineString({
          routeResult: result,
          vfrWaypoints: [],
          selectedSid,
          selectedStar,
          selectedIap,
        })
        const coords = routeGeometry?.coordinates ?? []
        if (coords.length > 0) {
          setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: coords, maxZoom: 8 })
        }
      }
    } catch (err) {
      if (requestId !== routeSearchRequestRef.current) return
      setRouteResult(null)
      setRouteError(err.message)
    } finally {
      if (requestId === routeSearchRequestRef.current) setRouteLoading(false)
    }
  }

  function updateVfrWaypointAltitude(idx, value) {
    setVfrWaypoints((prev) => prev.map((wp, i) => (
      i === idx ? { ...wp, altitudeFt: value } : wp
    )))
  }

  function applyCruiseAltitudeToVfrWaypoints() {
    const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt)
    if (!Number.isFinite(plannedCruiseAltitudeFt) || plannedCruiseAltitudeFt <= 0) return
    setVfrWaypoints((prev) => prev.map((wp) => {
      if (!wp.fixed) return { ...wp, altitudeFt: Math.round(plannedCruiseAltitudeFt) }
      const airportElevationFt = getVfrAirportAltitudeFt(airports, wp)
      return { ...wp, airportElevationFt, altitudeFt: airportElevationFt }
    }))
  }

  async function handleVerticalProfileRequest() {
    const routeGeometry = getCurrentRouteLineString({
      routeResult,
      vfrWaypoints,
      selectedSid,
      selectedStar,
      selectedIap,
    })
    const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt)

    if (!routeGeometry) {
      setVerticalProfileError('\uc5f0\uc9c1\ub2e8\uba74\ub3c4\ub97c \uc0dd\uc131\ud560 \uacbd\ub85c\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.')
      return
    }

    if (!Number.isFinite(plannedCruiseAltitudeFt) || plannedCruiseAltitudeFt <= 0) {
      setVerticalProfileError('\uc21c\ud56d\uace0\ub3c4\ub97c 0\ubcf4\ub2e4 \ud070 ft \uac12\uc73c\ub85c \uc785\ub825\ud574\uc8fc\uc138\uc694.')
      return
    }

    const requestId = ++verticalProfileRequestRef.current
    setVerticalProfileLoading(true)
    setVerticalProfileError(null)
    try {
      const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
        routeGeometry,
        routeResult,
        selectedSid,
        selectedStar,
        selectedIap,
        vfrWaypoints,
        plannedCruiseAltitudeFt,
      }))
      if (requestId !== verticalProfileRequestRef.current) return
      setVerticalProfile(profile)
      setVerticalProfileStale(false)
      setVerticalProfileWindowOpen(true)
    } catch (err) {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileError(err.message)
    } finally {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileLoading(false)
    }
  }

  return {
    state: {
      routeForm,
      routeResult,
      routeError,
      routeLoading,
      cruiseAltitudeFt,
      verticalProfile,
      verticalProfileLoading,
      verticalProfileError,
      verticalProfileStale,
      verticalProfileWindowOpen,
      editingVfrAltitudeIndex,
      vfrWaypoints,
      hoveredWpInfo,
      sidOptions,
      availableSidIds,
      starOptions,
      selectedSid,
      selectedStar,
      iapData,
      iapCandidates,
      selectedIapKey,
      firInOptions,
      firExitOptions,
      navpointsById,
      autoRecommendRequested,
      fitBoundsRequest,
    },
    refs: {
      vfrWaypointsRef,
      hideTimerRef,
    },
    derived: {
      isFirInMode,
      isFirExitMode,
      selectedIap,
      visibleSidOptions,
    },
    actions: {
      updateRouteField,
      handleDepartureAirportChange,
      handleArrivalAirportChange,
      handleEntryFixChange,
      handleExitFixChange,
      switchFlightRule,
      handleAutoRecommend,
      handleSidChange,
      handleStarChange,
      handleIapChange,
      handleRouteReset,
      deleteVfrWaypoint,
      handleRouteSearch,
      updateVfrWaypointAltitude,
      applyCruiseAltitudeToVfrWaypoints,
      handleVerticalProfileRequest,
      setHoveredWpInfo,
      setEditingVfrAltitudeIndex,
      setVerticalProfileWindowOpen,
      setCruiseAltitudeFt,
      setVfrWaypoints,
    },
    routePreviewModel,
  }
}
