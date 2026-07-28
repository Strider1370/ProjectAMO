import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchVerticalProfile, fetchCrossSection, fetchRouteBriefing, fetchRouteExposure, fetchRouteExposureBatch, fetchAltitudeComparison } from '../../api/briefingApi.js'
import { getProcedures, KNOWN_AIRPORTS } from './lib/procedureData.js'
import { buildBriefingRoute, buildManualIfrRoute, buildManualVfrRoute, buildVfrRoute, canBuildBriefingRoutePath, formatRouteString, loadIapData, loadNavpoints, loadOverseasLinks, loadRouteDirectionMetadata, resolveNearestNavpoint } from './lib/routePlanner.js'
import { formatCoordinateToken, formatManualRouteString, formatVfrDraftText, parseManualRouteString, parseVfrDraftText } from './lib/manualRouteInput.js'
import { calcVfrDistance } from './lib/routePreview.js'
import { computeEtaIso } from './lib/etaCalc.js'
import { getPerformanceForRule, setPerformanceForRule } from './lib/aircraftProfiles.js'
import { initialBearingDeg, magneticCourse, nearestVfrCruiseAltitude } from './lib/altitude.js'
import { buildCrossSectionRequest, buildVerticalProfileRequest } from './lib/verticalProfileRequest.js'
import { buildCommonRouteModel } from '../../../../shared/route-model.js'
import { recommendProcedures } from './lib/recommendProcedures.js'
import { createRouteDesign, duplicateRouteDesign, removeRouteDesign, snapshotRouteDesign } from './lib/routeDesigns.js'
import { normalizeRouteSnapshot } from './lib/routeStore.js'
import { resolveDemoEtd, selectEffectiveEtd } from './lib/demoTime.js'
import { createRouteEditor, editorFromBase, emptyEditorForContext, replaceEditorProcedures, updateEditorContext as updateEditor } from './lib/routeEditor.js'
import { parseRouteFile, extractRoutePaths, simplifyRoute, snapEndpointsToAirports, isWithinKoreaFir } from './lib/routeImport.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  buildBoundaryFixOptions,
  buildIapCandidates,
  buildIfrDistanceBreakdown,
  buildInitialVfrWaypoints,
  buildVfrWaypointsFromRouteResult,
  buildRoutePreviewModel,
  buildVisibleSidOptions,
  getCurrentRouteLineString,
} from './lib/routeBriefingModel.js'

export const initialRouteForm = {
  flightRule: 'IFR',
  departureAirport: '', entryFix: '',
  exitFix: '', arrivalAirport: '', routeType: 'ALL',
}
export const DEFAULT_CRUISE_ALTITUDE_FT = 31000
// 경로 임포트 시 초기고도 자동설정용 지형 여유 마진. 항공안전법 시행규칙 §199(최저비행고도):
// 밀집지역 300m(1,000ft)/일반지역 150m(500ft) — 혼잡 여부를 지형데이터만으로 판단 못 하므로
// 보수적으로 밀집지역 기준(1,000ft)을 항상 적용한다.

export function useRouteBriefing({ activePanel, airports = [], metarData = null, demoMode = false, demoNowMs = null }) {
  const [routeEditor, setRouteEditor] = useState(() => emptyEditorForContext(initialRouteForm))
  const routeForm = routeEditor.routeForm
  const selectedSid = routeEditor.procedures.sid
  const selectedStar = routeEditor.procedures.star
  const selectedIapKey = routeEditor.procedures.iapKey
  const routeDraftText = routeEditor.rawText
  const routeDraftResult = routeEditor.preview
  const pendingRouteEdit = routeEditor.pendingIntent
  const setRouteForm = (next) => setRouteEditor((editor) => ({ ...editor, routeForm: typeof next === 'function' ? next(editor.routeForm) : next }))
  const setSelectedSid = (next) => setRouteEditor((editor) => replaceEditorProcedures(editor, { sid: typeof next === 'function' ? next(editor.procedures.sid) : next }))
  const setSelectedStar = (next) => setRouteEditor((editor) => replaceEditorProcedures(editor, { star: typeof next === 'function' ? next(editor.procedures.star) : next }))
  const setSelectedIapKey = (next) => setRouteEditor((editor) => replaceEditorProcedures(editor, { iapKey: typeof next === 'function' ? next(editor.procedures.iapKey) : next }))
  const setRouteDraftText = (rawText) => setRouteEditor((editor) => ({ ...editor, rawText }))
  const setRouteDraftResult = (preview) => setRouteEditor((editor) => ({ ...editor, preview }))
  const setPendingRouteEdit = (pendingIntent) => setRouteEditor((editor) => ({ ...editor, pendingIntent }))
  const [routeResult, setRouteResult] = useState(null)
  const [routeDesigns, setRouteDesigns] = useState([])
  const [selectedRouteDesignId, setSelectedRouteDesignId] = useState(null)
  const [hiddenRouteDesignIds, setHiddenRouteDesignIds] = useState(() => new Set())
  const [activeAppliedDesignId, setActiveAppliedDesignId] = useState('base')
  const [routeExposure, setRouteExposure] = useState(null)
  const [altitudeComparison, setAltitudeComparison] = useState(null)
  const [altitudeComparisonLoading, setAltitudeComparisonLoading] = useState(false)
  const [altitudeComparisonError, setAltitudeComparisonError] = useState(null)
  const [altitudeDraftFt, setAltitudeDraftFt] = useState(() => getPerformanceForRule(initialRouteForm.flightRule).altitudeFt)
  const [workflowStep, setWorkflowStep] = useState('settings')
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(() => getPerformanceForRule(initialRouteForm.flightRule).altitudeFt)
  const [verticalProfile, setVerticalProfile] = useState(null)
  const [crossSection, setCrossSection] = useState(null)
  const [crossSectionHourLoading, setCrossSectionHourLoading] = useState(false)
  const [verticalProfileLoading, setVerticalProfileLoading] = useState(false)
  const [verticalProfileError, setVerticalProfileError] = useState(null)
  const [verticalProfileStale, setVerticalProfileStale] = useState(false)
  const [verticalProfileWindowOpen, setVerticalProfileWindowOpen] = useState(false)
  // leg(경유점 i→i+1)별 최고 지형고도(ft), 키 = `from→to`. 가벼운 /vertical-profile로 미리 채움.
  const [vfrLegTerrain, setVfrLegTerrain] = useState({})
  const [, setVfrUndoStack] = useState([])
  const [importCandidates, setImportCandidates] = useState([]) // 다중 경로 파일일 때 사용자 선택 대기 목록
  const [importWarning, setImportWarning] = useState(null)
  const [importError, setImportError] = useState(null)
  // 되돌리기: 패널에서의 경유점 편집(추가/삭제/순서/전체고도) 직전 스냅샷 스택.
  const [hoveredWpInfo, setHoveredWpInfo] = useState(null)
  const [sidOptions, setSidOptions] = useState([])
  const [availableSidIds, setAvailableSidIds] = useState(null)
  const [starOptions, setStarOptions] = useState([])
  const [iapData, setIapData] = useState(null)
  const [iapCandidates, setIapCandidates] = useState([])
  const [firInOptions, setFirInOptions] = useState([])
  const [firExitOptions, setFirExitOptions] = useState([])
  const [navpointsById, setNavpointsById] = useState({})
  const [autoRecommendRequested, setAutoRecommendRequested] = useState(false)
  const [autoApplyPending, setAutoApplyPending] = useState(false) // 자동 생성 → 경로 적용까지 이어서
  const [fitBoundsRequest, setFitBoundsRequest] = useState(null)
  const [mapInteractionMode, setMapInteractionMode] = useState(null)
  const [pendingContextChange, setPendingContextChange] = useState(null)

  const vfrWaypointsRef = useRef([])
  const lastVfrKeyRef = useRef('') // 자동 VFR 경로생성: 마지막으로 생성한 출발>도착 (중복 생성·경유점 리셋 방지)
  const hideTimerRef = useRef(null)
  const sidRequestRef = useRef(0)
  const starRequestRef = useRef(0)
  const iapRequestRef = useRef(0)
  const sidFilterRequestRef = useRef(0)
  const routeSearchRequestRef = useRef(0)
  const routeResetVersionRef = useRef(0)
  const vfrPreviewRequestRef = useRef(0)
  const draftPreviewRequestRef = useRef(0)
  const routeExposureRequestRef = useRef(0)
  const altitudeComparisonRequestRef = useRef(0)
  const verticalProfileRequestRef = useRef(0)
  const fitBoundsRequestRef = useRef(0)
  const mapInteractionModeRef = useRef(null)
  const mapInteractionActionRef = useRef(null)
  const mapInteractionStatusRef = useRef(null)
  const vfrWaypointDropRef = useRef(null)
  const designWaypointDropRef = useRef(null)
  const isComparisonRef = useRef(false)
  isComparisonRef.current = workflowStep === 'compare' && routeDesigns.length > 1
  mapInteractionModeRef.current = workflowStep === 'settings' ? mapInteractionMode : null

  const isFirInMode = routeForm.flightRule === 'IFR' && routeForm.departureAirport === FIR_IN_AIRPORT
  const isFirExitMode = routeForm.flightRule === 'IFR' && routeForm.arrivalAirport === FIR_EXIT_AIRPORT

  // 해외 공항이 출발/도착에 끼면 경로 검색은 전체(ALL) 유형으로.
  // 해외 항로(테스트=X-Plane 2012)는 대부분 재래식(ATS)이라 RNAV 전용이면 경로가 없어 자동검색이 실패함.
  const isOverseasRoute =
    (!!routeForm.departureAirport && !KNOWN_AIRPORTS.includes(routeForm.departureAirport) && !isFirInMode) ||
    (!!routeForm.arrivalAirport && !KNOWN_AIRPORTS.includes(routeForm.arrivalAirport) && !isFirExitMode)
  const effectiveRouteType = isOverseasRoute ? 'ALL' : routeForm.routeType
  const selectedIap = iapData?.iapRoutes?.[selectedIapKey] ?? null
  const [alternateAirport, setAlternateAirport] = useState('')
  const [storedEtd, setStoredEtd] = useState(() => {
    // Absolute UTC instant; the ETD field renders/edits it in the app timezone.
    const d = new Date()
    d.setUTCSeconds(0, 0)
    return d.toISOString().replace('.000Z', 'Z')
  })
  const [etdUserEdited, setEtdUserEdited] = useState(false)
  const etd = selectEffectiveEtd({
    storedEtd,
    demoOn: demoMode,
    demoNowMs,
    userEdited: etdUserEdited,
  })
  const setEtd = (next) => {
    setEtdUserEdited(true)
    setStoredEtd((current) => typeof next === 'function' ? next(current) : next)
  }
  const lastAppliedDemoNowRef = useRef(null)
  useEffect(() => {
    if (!demoMode) {
      if (lastAppliedDemoNowRef.current !== null) {
        const liveNow = new Date()
        liveNow.setUTCSeconds(0, 0)
        setStoredEtd(liveNow.toISOString().replace('.000Z', 'Z'))
        setEtdUserEdited(false)
      }
      lastAppliedDemoNowRef.current = null
      return
    }
    if (!Number.isFinite(demoNowMs)) return
    setStoredEtd((currentEtd) => resolveDemoEtd({
      currentEtd,
      demoOn: demoMode,
      lastAppliedDemoNowMs: lastAppliedDemoNowRef.current,
      demoNowMs,
    }))
    setEtdUserEdited(false)
    lastAppliedDemoNowRef.current = demoNowMs
  }, [demoMode, demoNowMs])
  const [tasKt, setTasKt] = useState(() => getPerformanceForRule(initialRouteForm.flightRule).tasKt)
  const [eta, setEta] = useState(null)
  const [briefing, setBriefing] = useState(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState(null)

  function updateTasKt(value) {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    setTasKt(next)
    setPerformanceForRule(routeForm.flightRule, { tasKt: next })
  }

  function updateCruiseAltitudeFt(value) {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    setCruiseAltitudeFt(next)
    setPerformanceForRule(routeForm.flightRule, { altitudeFt: next })
  }

  const visibleSidOptions = useMemo(() => buildVisibleSidOptions(sidOptions, availableSidIds), [availableSidIds, sidOptions])
  const selectedAppliedDesign = routeDesigns.find((design) => design.id === activeAppliedDesignId) ?? null
  const appliedProcedures = selectedAppliedDesign?.procedures ?? { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey }
  const appliedIap = iapData?.iapRoutes?.[appliedProcedures.iapKey] ?? null
  const baselinePreview = useMemo(() => {
    if (routeResult) return null
    const departure = airports.find((airport) => airport.icao === routeForm.departureAirport)
    const arrival = airports.find((airport) => airport.icao === routeForm.arrivalAirport)
    if (!Number.isFinite(departure?.lon) || !Number.isFinite(departure?.lat) || !Number.isFinite(arrival?.lon) || !Number.isFinite(arrival?.lat)) return null
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { role: 'route-baseline' },
        geometry: { type: 'LineString', coordinates: [[departure.lon, departure.lat], [arrival.lon, arrival.lat]] },
      }],
    }
  }, [airports, routeDraftResult, routeForm.arrivalAirport, routeForm.departureAirport, routeResult])
  const appliedVfrWaypoints = useMemo(() => routeResult?.flightRule === 'VFR'
    ? buildVfrWaypointsFromRouteResult(routeResult, airports)
    : [], [airports, routeResult])
  const draftVfrWaypoints = useMemo(() => routeDraftResult?.flightRule === 'VFR'
    ? buildVfrWaypointsFromRouteResult(routeDraftResult, airports)
    : [], [airports, routeDraftResult])
  const routePreviewModel = useMemo(() => buildRoutePreviewModel({
    routeForm,
    routeResult,
    routeDesigns,
    selectedRouteDesignId,
    activeAppliedDesignId,
    workflowStep,
    hiddenRouteDesignIds,
    appliedVfrWaypoints,
    draftVfrWaypoints,
    selectedSid: appliedProcedures.sid,
    selectedStar: appliedProcedures.star,
    selectedIap: appliedIap,
    navpointsById,
    baselinePreview,
    pendingRouteResult: routeDraftResult,
    pendingSid: selectedSid,
    pendingStar: selectedStar,
    pendingIap: selectedIap,
  }), [activeAppliedDesignId, appliedIap, appliedProcedures.sid, appliedProcedures.star, appliedVfrWaypoints, baselinePreview, draftVfrWaypoints, hiddenRouteDesignIds, navpointsById, routeDesigns, routeDraftResult, routeForm, routeResult, selectedIap, selectedRouteDesignId, selectedSid, selectedStar, workflowStep])

  useEffect(() => {
    vfrWaypointsRef.current = draftVfrWaypoints.length >= 2 ? draftVfrWaypoints : appliedVfrWaypoints
  }, [appliedVfrWaypoints, draftVfrWaypoints])

  function clearRouteDisplay({ clearEditor = true } = {}) {
    routeSearchRequestRef.current += 1
    routeExposureRequestRef.current += 1
    altitudeComparisonRequestRef.current += 1
    verticalProfileRequestRef.current += 1
    setRouteResult(null)
    setRouteDesigns([])
    setSelectedRouteDesignId(null)
    setActiveAppliedDesignId('base')
    setRouteExposure(null)
    setAltitudeComparison(null)
    setAltitudeComparisonLoading(false)
    setAltitudeComparisonError(null)
    setAltitudeDraftFt(getPerformanceForRule(routeForm.flightRule).altitudeFt)
    setWorkflowStep('settings')
    setEta(null)
    setRouteError(null)
    setRouteLoading(false)
    setVerticalProfile(null)
    setCrossSection(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    setVfrUndoStack([])
    setFitBoundsRequest(null)
    setBriefing(null)
    setBriefingError(null)
    if (clearEditor) setRouteEditor((editor) => ({ ...editor, rawText: '', preview: null, pendingIntent: null }))
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
          routeType: effectiveRouteType,
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
  }, [selectedSid, selectedStar, selectedIapKey, appliedVfrWaypoints])

  useEffect(() => {
    let cancelled = false
    const resetVersion = routeResetVersionRef.current

    if (
      activePanel !== 'route-check' ||
      routeForm.flightRule !== 'IFR' ||
      !autoRecommendRequested
    ) {
      return () => {
        cancelled = true
      }
    }

    recommendProcedures({
      routeForm,
      sidOptions,
      starOptions,
      iapData,
      metarData,
      isFirInMode,
      isFirExitMode,
      effectiveRouteType,
      loadOverseasLinks,
      buildBriefingRoute,
    }).then(async (best) => {
      if (cancelled || resetVersion !== routeResetVersionRef.current) return
      if (!best) {
        // 추천할 절차를 못 찾았다 — 초안이 안 생기므로 자동 적용도 취소한다.
        setAutoRecommendRequested(false)
        setAutoApplyPending(false)
        return
      }

      const nextForm = {
        ...routeForm,
        entryFix: best.entryFix ?? routeForm.entryFix,
        exitFix: best.exitFix ?? routeForm.exitFix,
      }
      try {
        const result = await buildBriefingRoute({
          ...nextForm,
          routeType: effectiveRouteType,
        })
        if (cancelled || resetVersion !== routeResetVersionRef.current) return
        const generatedEditor = await buildEditorPreview(
          createRouteEditor({
            routeForm: { ...nextForm, routeType: effectiveRouteType },
            procedures: { sid: best.sid ?? null, star: best.star ?? null, iapKey: best.iapKey ?? null },
          }),
          formatRouteString(result),
        )
        if (cancelled || resetVersion !== routeResetVersionRef.current) return
        setRouteEditor(generatedEditor.editor)
        setRouteError(null)
        setAutoRecommendRequested(false)
      } catch (error) {
        if (!cancelled && resetVersion === routeResetVersionRef.current) {
          setAutoRecommendRequested(false)
          setAutoApplyPending(false) // 생성이 실패했으면 적용까지 이어가지 않는다.
          setRouteError(error.message)
        }
      }
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

  function updateRouteField(field, value) {
    setRouteForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateEditorContext(changes, options) {
    vfrPreviewRequestRef.current += 1
    setRouteEditor((editor) => updateEditor(editor, { ...options, routeForm: { ...changes, ...(options?.routeForm ?? {}) } }))
    setRouteError(null)
    setAutoRecommendRequested(false)
  }

  function requestContextChange(changes, label) {
    if (routeDesigns.length > 0) {
      setPendingContextChange({ changes, label })
      return true
    }
    return false
  }

  function handleDepartureAirportChange(value) {
    const changes = { departureAirport: value, ...(value === FIR_IN_AIRPORT ? { entryFix: '' } : {}) }
    if (requestContextChange(changes, '출발 공항')) return
    setIapCandidates([])
    updateEditorContext(changes, { procedures: { sid: null, star: null, iapKey: null }, resetDraft: true })
  }

  function handleArrivalAirportChange(value) {
    const changes = { arrivalAirport: value, ...(value === FIR_EXIT_AIRPORT ? { exitFix: '' } : {}) }
    if (requestContextChange(changes, '도착 공항')) return
    setIapCandidates([])
    updateEditorContext(changes, { procedures: { sid: null, star: null, iapKey: null }, resetDraft: true })
  }

  function swapRouteAirports() {
    const changes = { departureAirport: routeForm.arrivalAirport, arrivalAirport: routeForm.departureAirport }
    if (requestContextChange(changes, '출발·도착 공항')) return
    setIapCandidates([])
    updateEditorContext(changes, { procedures: { sid: null, star: null, iapKey: null }, resetDraft: true })
  }

  function handleEntryFixChange(value) {
    updateEditorContext({ entryFix: value }, { procedures: { sid: null } })
  }

  function handleExitFixChange(value) {
    updateEditorContext({ exitFix: value }, { procedures: { star: null } })
  }

  function switchFlightRule(rule) {
    if (requestContextChange({ flightRule: rule }, '비행 규칙')) return
    const performance = getPerformanceForRule(rule)
    setTasKt(performance.tasKt)
    setCruiseAltitudeFt(performance.altitudeFt)
    setAltitudeDraftFt(performance.altitudeFt)
    setIapCandidates([])
    setRouteInteractionMode(null)
    updateEditorContext({ flightRule: rule }, { procedures: { sid: null, star: null, iapKey: null }, resetDraft: true })
  }

  function handleAutoRecommend() {
    setRouteError(null)
    setAutoRecommendRequested(true)
    setAutoApplyPending(true)
  }

  // 자동 생성은 초안(routeEditor)만 만든다. 그 자리에서 applyRouteDraft를 부르면 아직
  // 반영되지 않은 옛 초안·옛 SID/STAR로 적용되므로, 초안이 실제로 들어온 다음 렌더에서
  // 이어서 적용한다. 그때는 rawText와 preview가 맞아 이미 만든 결과를 그대로 재사용한다.
  useEffect(() => {
    if (!autoApplyPending || autoRecommendRequested || routeLoading) return
    if (!routeEditor.rawText?.trim()) return
    setAutoApplyPending(false)
    applyRouteDraft()
  }, [autoApplyPending, autoRecommendRequested, routeLoading, routeEditor])

  function updateRouteDraftText(value) {
    const editor = routeEditor
    const requestId = ++vfrPreviewRequestRef.current
    setRouteEditor((current) => ({ ...current, rawText: value, pendingIntent: null }))
    setRouteError(null)
    if (editor.routeForm.flightRule !== 'VFR' || !editor.routeForm.departureAirport || !editor.routeForm.arrivalAirport) return
    setTimeout(async () => {
      try {
        const preview = await buildEditorPreview(editor, value)
        if (requestId === vfrPreviewRequestRef.current) setRouteEditor(preview.editor)
      } catch (error) {
        if (requestId === vfrPreviewRequestRef.current) setRouteError(error.message)
      }
    }, 250)
  }

  function confirmContextChange() {
    const change = pendingContextChange
    if (!change) return
    clearRouteDisplay({ clearEditor: false })
    setIapCandidates([])
    setRouteEditor(emptyEditorForContext({ ...routeForm, ...change.changes }))
    setPendingContextChange(null)
  }

  function handleSidChange(proc) {
    updateEditorContext(proc ? { entryFix: proc.enrouteFix ?? '' } : {}, { procedures: { sid: proc } })
    if (routeResult) setRouteDraftResult(routeResult)
  }

  function handleStarChange(proc) {
    updateEditorContext(proc ? { exitFix: proc.startFix ?? '' } : {}, { procedures: { star: proc } })
    if (routeResult) setRouteDraftResult(routeResult)
  }

  function handleIapChange(key) {
    updateEditorContext({}, { procedures: { iapKey: key || null } })
    if (routeResult) setRouteDraftResult(routeResult)
  }

  function handleRouteReset() {
    // A saved-route load can still be awaiting procedure/exposure data when the
    // user resets. Mark it stale before clearing so it cannot restore the old
    // route after this fresh-start transition.
    routeResetVersionRef.current += 1
    setRouteEditor(emptyEditorForContext(initialRouteForm))
    clearRouteDisplay()
    setMapInteractionMode(null)
    mapInteractionModeRef.current = null
    lastVfrKeyRef.current = ''
    setIapCandidates([])
    setAvailableSidIds(null)
    setAutoRecommendRequested(false)
    setPendingContextChange(null)
    setHoveredWpInfo(null)
    setImportCandidates([])
    setImportWarning(null)
    setImportError(null)
    setAutoBriefingPending(false)
    autoSearchRef.current = false
  }

  async function handleVfrWaypointDrop({ waypoints, previousWaypoints, waypointIndex }) {
    // Comparison editing is design-scoped; the legacy global VFR binder must
    // never mutate the base route from a line/blank-map interaction.
    if (workflowStep === 'compare' && routeDesigns.length > 1) return
    const previousEditor = routeEditor
    const dropped = waypoints?.[waypointIndex]
    const commit = async (next) => {
      const terms = next.slice(1, -1).map((waypoint) => waypoint.named
        ? { kind: 'fix', id: waypoint.id }
        : { kind: 'coordinate', coordinate: { lat: waypoint.lat, lon: waypoint.lon } })
      const text = formatVfrDraftText({
        departureAirport: routeForm.departureAirport,
        arrivalAirport: routeForm.arrivalAirport,
        enroute: { terms, legIntents: Array.from({ length: Math.max(0, terms.length - 1) }, () => ({ kind: 'dct' })) },
      })
      await previewEditorRoute(text)
    }
    if (!dropped || dropped.fixed) return

    try {
      const nearest = await resolveNearestNavpoint([dropped.lon, dropped.lat])
      const navpoint = (await loadNavpoints())[nearest.id]
      const coordinates = navpoint?.coordinates
      if (!Number.isFinite(coordinates?.lon) || !Number.isFinite(coordinates?.lat)) throw new Error('FIX 좌표 없음')
      mapInteractionStatusRef.current?.showConfirmation?.({
        message: `${nearest.id} FIX를 경유점으로 넣을까요?`,
        coordinates: [dropped.lon, dropped.lat],
        onApply: () => commit(waypoints.map((waypoint, index) => index === waypointIndex
          ? { ...waypoint, id: nearest.id, lon: coordinates.lon, lat: coordinates.lat, named: true }
          : waypoint)),
        onCancel: () => {
          setRouteEditor(previousEditor)
          mapInteractionStatusRef.current?.showConfirmation?.()
        },
      })
    } catch (error) {
      await commit(waypoints).catch((previewError) => setRouteError(previewError.message || error.message))
    }
  }
  vfrWaypointDropRef.current = handleVfrWaypointDrop

  // Core search by explicit form (so 불러오기 can search the saved form without
  // waiting for a setRouteForm state flush). Returns the result or null.
  async function runRouteSearch(form, { deferIfrCommit = false } = {}) {
    const requestId = ++routeSearchRequestRef.current
    setRouteLoading(true)
    setRouteError(null)
    setVerticalProfile(null)
    setCrossSection(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    setBriefing(null)
    setBriefingError(null)
    try {
      const result = form.flightRule === 'VFR'
        ? await buildVfrRoute(form)
        : await buildBriefingRoute({ ...form, routeType: effectiveRouteType })
      if (requestId !== routeSearchRequestRef.current) return null
      if (!deferIfrCommit || result.flightRule === 'VFR') setRouteResult(result)
      if (result.flightRule === 'VFR') {
        const initialWaypoints = buildInitialVfrWaypoints(result, airports)
        const coords = initialWaypoints.map((wp) => [wp.lon, wp.lat])
        if (coords.length > 0) {
          setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: coords, maxZoom: 8 })
        }
      } else {
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
      return result
    } catch (err) {
      if (requestId !== routeSearchRequestRef.current) return null
      setRouteResult(null)
      setRouteError(err.message)
      return null
    } finally {
      if (requestId === routeSearchRequestRef.current) setRouteLoading(false)
    }
  }

  async function handleRouteSearch(e) {
    e.preventDefault()
    setRouteDesigns([])
    setSelectedRouteDesignId(null)
    const result = await runRouteSearch(routeForm, { deferIfrCommit: true })
    if (!result || result.flightRule !== 'IFR') return result

    const requestId = ++routeExposureRequestRef.current
    const routeGeometry = result.previewGeojson?.features?.find((feature) => feature.properties?.role === 'route-preview-line')?.geometry
    if (!routeGeometry) {
      const base = createRouteDesign({
        routeForm: { ...routeForm, routeType: effectiveRouteType },
        procedures: { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey },
        routeResult: result,
        routeExposure: { trigger: 'unavailable', hazards: [] },
      })
      setRouteDesigns([base])
      setSelectedRouteDesignId(base.id)
      setRouteResult(base.routeResult)
      setRouteExposure(base.routeExposure)
      setWorkflowStep('compare')
      return result
    }

    const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: result })
    const etdIso = new Date(etd).toISOString().replace('.000Z', 'Z')
    const searchEta = eta || computeEtaIso(etdIso, result.totalDistanceNm ?? result.distanceNm, tasKt) || null
    setEta(searchEta)

    try {
      const baseExposure = await fetchRouteExposure({ routeGeometry, routeModel, etd: etdIso, eta: searchEta })
      if (requestId !== routeExposureRequestRef.current) return result

      if (requestId !== routeExposureRequestRef.current) return result
      const base = createRouteDesign({
        routeForm: { ...routeForm, routeType: effectiveRouteType },
        procedures: { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey },
        routeResult: result,
        routeModel,
        routeExposure: baseExposure,
      })
      setRouteDesigns([base])
      setSelectedRouteDesignId(base.id)
      setRouteResult(base.routeResult)
      setRouteExposure(base.routeExposure)
      setWorkflowStep('compare')
    } catch (err) {
      if (requestId !== routeExposureRequestRef.current) return result
      const base = createRouteDesign({
        routeForm: { ...routeForm, routeType: effectiveRouteType },
        procedures: { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey },
        routeResult: result,
        routeModel,
        routeExposure: { trigger: 'unavailable', hazards: [], error: err.message },
      })
      setRouteDesigns([base])
      setSelectedRouteDesignId(base.id)
      setRouteResult(base.routeResult)
      setRouteExposure(base.routeExposure)
      setWorkflowStep('compare')
    }
    return result
  }

  function synchronizeSelectedRouteDesign(design) {
    if (!design) return
    setRouteResult(design.routeResult)
    setRouteExposure(design.routeExposure)
    altitudeComparisonRequestRef.current += 1
    setAltitudeComparison(null)
    setAltitudeComparisonLoading(false)
    setAltitudeComparisonError(null)
    if (design.procedures) {
      setSelectedSid(design.procedures.sid ?? null)
      setSelectedStar(design.procedures.star ?? null)
      setSelectedIapKey(design.procedures.iapKey ?? null)
    }
    setBriefing(null)
    setBriefingError(null)
    setVerticalProfile(null)
    setCrossSection(null)
  }

  async function buildEditorPreview(editor, text, pendingIntent = null) {
    const currentEnroute = editor.enroute
    const userWaypoints = [...(currentEnroute?.userWaypoints ?? [])]
    const parsed = editor.routeForm.flightRule === 'VFR'
      ? parseVfrDraftText(text, { departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, userWaypoints }).enroute
      : parseManualRouteString(text, { flightRule: editor.routeForm.flightRule, userWaypoints })
    let nextWaypointNumber = currentEnroute?.nextWaypointNumber ?? 1
    const terms = parsed.terms.map((term) => {
      if (term.kind !== 'coordinate') return term
      const waypoint = { id: `user-wp-${nextWaypointNumber}`, name: `WP${nextWaypointNumber}`, lon: term.coordinate.lon, lat: term.coordinate.lat }
      nextWaypointNumber += 1
      userWaypoints.push(waypoint)
      return { kind: 'user-waypoint', id: waypoint.id, name: waypoint.name }
    })
    const enroute = { terms, legIntents: parsed.legIntents, userWaypoints, nextWaypointNumber }
    const result = editor.routeForm.flightRule === 'VFR'
      ? (enroute.terms.length === 0
          ? await buildVfrRoute(editor.routeForm)
          : await buildManualVfrRoute({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, enroute, userWaypoints }))
      : await buildManualIfrRoute({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, routeType: editor.routeForm.routeType || effectiveRouteType, enroute, userWaypoints })
    const appliedEnroute = result.resolvedEnroute ? { ...result.resolvedEnroute, userWaypoints, nextWaypointNumber } : enroute
    return {
      editor: createRouteEditor({ ...editor, enroute: appliedEnroute, rawText: editor.routeForm.flightRule === 'VFR'
        ? formatVfrDraftText({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, enroute: appliedEnroute })
        : formatManualRouteString(appliedEnroute), preview: result, pendingIntent }),
      result,
    }
  }

  async function previewEditorRoute(text, pendingIntent = null) {
    const preview = await buildEditorPreview(routeEditor, text, pendingIntent)
    setRouteEditor(preview.editor)
    return preview.result
  }

  function startAlternativeFrom(id = selectedRouteDesignId) {
    const design = routeDesigns.find((item) => item.id === id)
    if (!design || design.kind !== 'alternative' || design.draftEditor) return
    const editor = editorFromBase(design)
    setRouteDesigns((designs) => designs.map((item) => item.id !== id ? item : {
      ...item,
      draftEditor: { rawText: editor.rawText, enroute: editor.enroute, preview: null, previewWaypoints: [], error: null, requestVersion: 0 },
      pendingEdit: null,
    }))
  }

  function updateSelectedDesignDraftText(rawText) {
    setRouteDesigns((designs) => designs.map((design) => design.id !== selectedRouteDesignId || design.kind !== 'alternative' ? design : {
      ...design,
      draftEditor: { ...(design.draftEditor ?? { enroute: design.enroute, requestVersion: 0 }), rawText, preview: null, error: null },
    }))
  }

  async function previewSelectedDesignDraft() {
    const design = routeDesigns.find((item) => item.id === selectedRouteDesignId)
    if (!design || design.kind !== 'alternative') return null
    const draft = design.draftEditor ?? { rawText: design.routeString, enroute: design.enroute, requestVersion: 0 }
    const requestVersion = ++draftPreviewRequestRef.current
    setRouteDesigns((designs) => designs.map((item) => item.id !== design.id ? item : { ...item, draftEditor: { ...draft, requestVersion, error: null } }))
    try {
      const preview = await buildEditorPreview(createRouteEditor({ routeForm: design.routeForm, procedures: design.procedures, enroute: draft.enroute, rawText: draft.rawText }), draft.rawText)
      setRouteDesigns((designs) => designs.map((item) => item.id !== design.id || item.draftEditor?.requestVersion !== requestVersion ? item : {
        ...item,
        draftEditor: { ...item.draftEditor, rawText: preview.editor.rawText, enroute: preview.editor.enroute, preview: preview.result, previewWaypoints: preview.result.flightRule === 'VFR' ? buildVfrWaypointsFromRouteResult(preview.result, airports) : [], error: null },
      }))
      return preview.result
    } catch (error) {
      setRouteDesigns((designs) => designs.map((item) => item.id !== design.id || item.draftEditor?.requestVersion !== requestVersion ? item : { ...item, draftEditor: { ...item.draftEditor, error: error.message } }))
      return null
    }
  }

  async function handleDesignWaypointDrop({ designId, kind, index, coordinates, snapToNavpoint = true }) {
    const design = routeDesigns.find((item) => item.id === designId)
    if (!design || design.id !== selectedRouteDesignId || design.kind !== 'alternative' || !Array.isArray(coordinates) || !Number.isInteger(index)) return
    const beforeDraft = design.draftEditor ? structuredClone(design.draftEditor) : null
    const editor = createRouteEditor({ routeForm: design.routeForm, procedures: design.procedures, enroute: design.draftEditor?.enroute ?? design.enroute, rawText: design.draftEditor?.rawText ?? design.routeString })
    try {
      const current = design.draftEditor?.preview ?? (await buildEditorPreview(editor, editor.rawText)).result
      const line = current.previewGeojson?.features?.find((feature) => feature.properties?.role === 'route-preview-line')?.geometry?.coordinates ?? []
      if (line.length < 2 || !['move', 'insert', 'delete'].includes(kind)) return
      const currentEnroute = current.resolvedEnroute ?? design.draftEditor?.enroute ?? editor.enroute ?? {}
      const terms = [...(currentEnroute.terms ?? [])]
      let proposal = null
      let proposalLabel = '경유점'
      if (kind !== 'delete') {
        proposal = { kind: 'coordinate', coordinate: { lon: coordinates[0], lat: coordinates[1] } }
        proposalLabel = formatCoordinateToken(proposal.coordinate)
        if (snapToNavpoint !== false) {
          try {
            const nearest = await resolveNearestNavpoint(coordinates)
            const navpoint = (await loadNavpoints())[nearest.id]
            if (Number.isFinite(navpoint?.coordinates?.lon) && Number.isFinite(navpoint?.coordinates?.lat)) {
              proposal = { kind: 'fix', id: nearest.id }
              proposalLabel = nearest.id
            }
          } catch { /* Coordinate waypoints remain valid when a published FIX is unavailable. */ }
        }
      }
      let legIntents
      if (design.routeForm.flightRule === 'VFR') {
        if (kind === 'delete') {
          if (index < 1 || index >= line.length - 1) return
          terms.splice(index - 1, 1)
        } else {
          if ((kind === 'move' && (index < 1 || index >= line.length - 1)) || (kind === 'insert' && (index < 0 || index >= line.length - 1))) return
          if (kind === 'move') terms[index - 1] = proposal
          else terms.splice(index, 0, proposal)
        }
        legIntents = Array.from({ length: Math.max(0, terms.length - 1) }, () => ({ kind: 'dct' }))
      } else {
        if (kind === 'delete') {
          if (terms.length < 2 || index < 0 || index >= terms.length) return
          terms.splice(index, 1)
          legIntents = [...(currentEnroute.legIntents ?? [])]
          if (index === 0) legIntents.splice(0, 1)
          else if (index === terms.length) legIntents.splice(index - 1, 1)
          else legIntents.splice(index - 1, 2, { kind: 'dct' })
        } else if (kind === 'move') {
          if (index < 0 || index >= terms.length) return
          terms[index] = proposal
          legIntents = currentEnroute.legIntents ?? []
        } else {
          if (index < 0 || index > terms.length) return
          const previousTermCount = terms.length
          terms.splice(index, 0, proposal)
          legIntents = [...(currentEnroute.legIntents ?? [])]
          if (index === 0) legIntents.splice(0, 0, { kind: 'dct' })
          else if (index === previousTermCount) legIntents.splice(index - 1, 0, { kind: 'dct' })
          else legIntents.splice(index - 1, 1, { kind: 'dct' }, { kind: 'dct' })
        }
      }
      const rawText = design.routeForm.flightRule === 'VFR'
        ? formatVfrDraftText({ departureAirport: design.routeForm.departureAirport, arrivalAirport: design.routeForm.arrivalAirport, enroute: { terms, legIntents } })
        : formatManualRouteString({ terms, legIntents, userWaypoints: design.draftEditor?.enroute?.userWaypoints ?? editor.enroute?.userWaypoints ?? [] })
      const proposed = await buildEditorPreview(editor, rawText)
      const pendingEdit = { kind, beforeDraft, proposedDraft: proposed.editor }
      const termIndex = design.routeForm.flightRule === 'VFR' ? (kind === 'insert' ? index : index - 1) : index
      const display = current.displaySequence ?? []
      const previousLabel = display[termIndex] ?? '앞 경유점'
      const nextLabel = display[termIndex + 1] ?? '뒤 경유점'
      if (kind === 'delete') proposalLabel = display[termIndex + 1] ?? proposalLabel
      setRouteDesigns((designs) => designs.map((item) => item.id !== design.id ? item : { ...item, draftEditor: proposed.editor, pendingEdit }))
      mapInteractionStatusRef.current?.showConfirmation?.({
        message: kind === 'delete'
          ? `${previousLabel} – ${nextLabel} 사이 ${proposalLabel} 삭제`
          : `${previousLabel} – ${nextLabel} 사이에 ${proposalLabel} ${kind === 'insert' ? '삽입' : '변경'}`,
        coordinates,
        isTouch: snapToNavpoint === false,
        onApply: () => applySelectedDesignDraft({ designId: design.id, draft: proposed.editor }),
        onCancel: () => setRouteDesigns((designs) => designs.map((item) => item.id !== design.id ? item : { ...item, draftEditor: beforeDraft, pendingEdit: null })),
      })
    } catch (error) {
      setRouteError(error.message)
    }
  }
  designWaypointDropRef.current = handleDesignWaypointDrop

  function cancelSelectedDesignDraft() {
    setRouteDesigns((designs) => designs.map((design) => design.id !== selectedRouteDesignId ? design : { ...design, draftEditor: null, pendingEdit: null }))
  }

  async function applySelectedDesignDraft({ designId = selectedRouteDesignId, draft: draftOverride } = {}) {
    const design = routeDesigns.find((item) => item.id === designId)
    let draft = draftOverride ?? design?.draftEditor
    if (!design || design.kind !== 'alternative' || !draft) return null
    if (!draft.preview) {
      try {
        const preview = await buildEditorPreview(createRouteEditor({ routeForm: design.routeForm, procedures: design.procedures, enroute: draft.enroute, rawText: draft.rawText }), draft.rawText)
        draft = { ...draft, rawText: preview.editor.rawText, enroute: preview.editor.enroute, preview: preview.result, previewWaypoints: preview.result.flightRule === 'VFR' ? buildVfrWaypointsFromRouteResult(preview.result, airports) : [] }
      } catch (error) {
        setRouteDesigns((designs) => designs.map((item) => item.id !== design.id ? item : { ...item, draftEditor: { ...item.draftEditor, error: error.message } }))
        setRouteError(error.message)
        return null
      }
    }
    const routeGeometry = getCurrentRouteLineString({ routeResult: draft.preview, vfrWaypoints: draft.previewWaypoints, selectedSid: design.procedures.sid, selectedStar: design.procedures.star, selectedIap: iapData?.iapRoutes?.[design.procedures.iapKey] })
    if (!routeGeometry) {
      const error = '적용할 경로 선을 만들지 못했습니다.'
      setRouteDesigns((designs) => designs.map((item) => item.id !== design.id ? item : { ...item, draftEditor: { ...item.draftEditor, error } }))
      setRouteError(error)
      return null
    }
    const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: draft.preview })
    const nextEta = computeEtaIso(etd, draft.preview.totalDistanceNm ?? draft.preview.distanceNm, tasKt)
    const updated = createRouteDesign({ ...design, routeResult: draft.preview, routeModel, routeExposure: { trigger: 'unavailable', hazards: [] }, enroute: draft.enroute, routeString: draft.rawText, undoStack: [...design.undoStack.slice(-19), snapshotRouteDesign(design)], draftEditor: null, pendingEdit: null })
    const nextDesigns = routeDesigns.map((item) => item.id === updated.id ? updated : item)
    setRouteDesigns(nextDesigns)
    try {
      const routes = nextDesigns.map((item) => {
        const geometry = item.routeModel?.routeGeometry ?? (item.id === updated.id ? routeGeometry : null)
        return geometry ? { id: item.id, routeGeometry: geometry, routeModel: item.routeModel, etd, eta: computeEtaIso(etd, item.routeResult?.totalDistanceNm ?? item.routeResult?.distanceNm, tasKt) } : null
      }).filter(Boolean)
      const batch = await fetchRouteExposureBatch({ routes })
      const activeExposure = batch.results.find((entry) => entry.id === activeAppliedDesignId)
      if (activeExposure) setRouteExposure({ ...activeExposure, snapshot: batch.snapshot })
      setRouteDesigns((designs) => designs.map((item) => {
        const result = batch.results.find((entry) => entry.id === item.id)
        return result ? { ...item, routeExposure: { ...result, snapshot: batch.snapshot } } : item
      }))
    } catch { /* The applied route remains valid when comparison data is unavailable. */ }
    setRouteError(null)
    return updated
  }

  function cancelPendingRouteEdit() {
    setRouteEditor((editor) => editor.pendingIntent?.previousEditor ?? { ...editor, pendingIntent: null, preview: null })
    mapInteractionStatusRef.current?.showConfirmation?.()
  }

  function acceptPendingRouteEdit() {
    setRouteEditor((editor) => editor.pendingIntent ? { ...editor, pendingIntent: null } : editor)
    mapInteractionStatusRef.current?.showConfirmation?.()
  }

  async function applyRouteDraft(text = routeDraftText) {
    const routeText = typeof text === 'string' ? text : routeDraftText
    setRouteLoading(true)
    setRouteError(null)
    try {
      const usePreview = routeText === routeEditor.rawText && routeEditor.preview
      const currentEnroute = routeEditor.enroute
      let result = usePreview ? routeEditor.preview : null
      let appliedEnroute = currentEnroute
      if (!result) {
        const userWaypoints = [...(currentEnroute?.userWaypoints ?? [])]
        const parsed = routeForm.flightRule === 'VFR'
          ? parseVfrDraftText(routeText, { departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, userWaypoints }).enroute
          : parseManualRouteString(routeText, { flightRule: routeForm.flightRule, userWaypoints })
        let nextWaypointNumber = currentEnroute?.nextWaypointNumber ?? 1
        const terms = parsed.terms.map((term) => {
          if (term.kind !== 'coordinate') return term
          const waypoint = { id: `user-wp-${nextWaypointNumber}`, name: `WP${nextWaypointNumber}`, lon: term.coordinate.lon, lat: term.coordinate.lat }
          nextWaypointNumber += 1
          userWaypoints.push(waypoint)
          return { kind: 'user-waypoint', id: waypoint.id, name: waypoint.name }
        })
        const enroute = { terms, legIntents: parsed.legIntents, userWaypoints, nextWaypointNumber }
        result = routeForm.flightRule === 'VFR'
          ? (enroute.terms.length === 0
              ? await buildVfrRoute(routeForm)
              : await buildManualVfrRoute({ departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, enroute, userWaypoints }))
          : await buildManualIfrRoute({ departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, routeType: effectiveRouteType, enroute, userWaypoints })
        appliedEnroute = result.resolvedEnroute ? { ...result.resolvedEnroute, userWaypoints, nextWaypointNumber } : enroute
      }
      const appliedVfrWaypoints = result.flightRule === 'VFR'
        ? buildVfrWaypointsFromRouteResult(result, airports)
        : []
      const routeGeometry = getCurrentRouteLineString({ routeResult: result, vfrWaypoints: appliedVfrWaypoints, selectedSid, selectedStar, selectedIap })
      const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: result })
      const etdIso = Number.isFinite(Date.parse(etd)) ? new Date(etd).toISOString().replace('.000Z', 'Z') : null
      const nextEta = eta || computeEtaIso(etdIso, result.totalDistanceNm ?? result.distanceNm, tasKt) || null
      const exposure = await fetchRouteExposure({ routeGeometry, routeModel, etd: etdIso, eta: nextEta }).catch((error) => ({ trigger: 'unavailable', hazards: [], error: error.message }))
      const previousBase = routeDesigns.find((design) => design.id === 'base') ?? null
      const base = createRouteDesign({
        routeForm: { ...routeForm, routeType: effectiveRouteType },
        procedures: { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey },
        routeResult: result, routeModel, routeExposure: exposure,
        enroute: appliedEnroute, routeString: result.flightRule === 'VFR'
          ? formatVfrDraftText({ departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, enroute: appliedEnroute })
          : formatManualRouteString(appliedEnroute),
        undoStack: previousBase
          ? [...previousBase.undoStack.slice(-19), snapshotRouteDesign(previousBase)]
          : [],
      })
      applyBaseRoute(base)
      setEta(nextEta)
      return true
    } catch (error) {
      setRouteError(error.message)
      return false
    } finally {
      setRouteLoading(false)
    }
  }

  function applyBaseRoute(base) {
    setRouteDesigns([base])
    setSelectedRouteDesignId(base.id)
    setActiveAppliedDesignId(base.id)
    setRouteEditor(editorFromBase(base))
    mapInteractionStatusRef.current?.showConfirmation?.()
    synchronizeSelectedRouteDesign(base)
    setWorkflowStep('settings')
  }

  async function proposeMapPoint(input) {
    if (workflowStep !== 'settings' || routeForm.flightRule !== 'IFR') return
    try {
      const drawn = input?.type === 'draw' ? input.coordinates ?? [] : null
      if (drawn?.length > 1) {
        const stride = Math.max(1, Math.ceil(drawn.length / 24))
        const fixes = []
        for (let index = 0; index < drawn.length; index += stride) {
          try {
            const nearest = await resolveNearestNavpoint(drawn[index])
            if (fixes.at(-1) !== nearest.id) fixes.push(nearest.id)
          } catch { /* a freehand stroke may pass empty map space */ }
        }
        if (fixes.length < 2) throw new Error('그린 선에서 서로 다른 항로 FIX를 두 개 이상 찾지 못했습니다.')
        const text = fixes.join(' ')
        const message = `그린 선을 ${fixes.join(' → ')} 경로 초안으로 바꿀까요?`
        const coordinates = drawn.at(-1)
        const pendingIntent = { text, message, mapCoordinates: coordinates, previousEditor: routeEditor }
        await previewEditorRoute(text, pendingIntent)
        mapInteractionStatusRef.current?.showConfirmation?.({
          message,
          coordinates,
          onApply: acceptPendingRouteEdit,
          onCancel: cancelPendingRouteEdit,
        })
        return
      }
      const coordinates = Array.isArray(input) ? input : input?.coordinates?.at(-1)
      if (!Array.isArray(coordinates)) throw new Error('지도 좌표를 확인할 수 없습니다.')
      let token
      let label
      let publishedFix = false
      try {
        const nearest = await resolveNearestNavpoint(coordinates)
        token = nearest.id
        label = nearest.id
        publishedFix = true
      } catch {
        token = formatCoordinateToken({ lon: coordinates[0], lat: coordinates[1] })
        label = token
      }
      const currentEnroute = routeEditor.enroute
      const parsedDraft = routeDraftText.trim()
        ? parseManualRouteString(routeDraftText, { flightRule: routeForm.flightRule, userWaypoints: currentEnroute?.userWaypoints ?? [] })
        : { terms: [], legIntents: [], userWaypoints: currentEnroute?.userWaypoints ?? [] }
      if (parsedDraft.terms.some((term) => term.kind === 'fix' && term.id === token)) {
        throw new Error(`${label}은(는) 이미 경로에 있습니다.`)
      }
      const insertedTerm = publishedFix
        ? { kind: 'fix', id: token }
        : parseManualRouteString(token, { userWaypoints: currentEnroute?.userWaypoints ?? [] }).terms[0]
      const insertedIntent = publishedFix ? { kind: 'auto' } : { kind: 'dct' }
      const candidates = []
      for (let index = 0; index <= parsedDraft.terms.length; index += 1) {
        const terms = [...parsedDraft.terms]
        const legIntents = [...parsedDraft.legIntents]
        terms.splice(index, 0, insertedTerm)
        if (parsedDraft.terms.length > 0) {
          if (index === 0) legIntents.unshift(insertedIntent)
          else if (index === parsedDraft.terms.length) legIntents.push(insertedIntent)
          else legIntents.splice(index - 1, 1, insertedIntent, insertedIntent)
        }
        const text = formatManualRouteString({ terms, legIntents, userWaypoints: currentEnroute?.userWaypoints ?? [] })
        try {
          const preview = await buildEditorPreview(routeEditor, text)
          if (Number.isFinite(preview.result.totalDistanceNm)) candidates.push({ index, preview })
        } catch { /* An invalid insertion position is not a route candidate. */ }
      }
      const selected = candidates.reduce((best, candidate) => !best || candidate.preview.result.totalDistanceNm < best.preview.result.totalDistanceNm ? candidate : best, null)
      if (!selected) throw new Error(`${label}을(를) 포함하는 유효한 경로를 만들지 못했습니다.`)
      const termLabel = (term) => term.kind === 'fix' ? term.id : term.kind === 'coordinate' ? formatCoordinateToken(term.coordinate) : currentEnroute?.userWaypoints?.find((waypoint) => waypoint.id === term.id)?.name ?? term.id
      const before = selected.index === 0 ? routeForm.departureAirport : termLabel(parsedDraft.terms[selected.index - 1])
      const after = selected.index === parsedDraft.terms.length ? routeForm.arrivalAirport : termLabel(parsedDraft.terms[selected.index])
      const message = `${before} → ${label} → ${after}로 바꿀까요?`
      const pendingIntent = { text: selected.preview.editor.rawText, message, mapCoordinates: coordinates, previousEditor: routeEditor }
      setRouteEditor({ ...selected.preview.editor, pendingIntent })
      mapInteractionStatusRef.current?.showConfirmation?.({
        message,
        coordinates,
        onApply: acceptPendingRouteEdit,
        onCancel: cancelPendingRouteEdit,
      })
    } catch (error) {
      setRouteError(error.message)
      mapInteractionStatusRef.current?.(error.message)
    }
  }

  function selectRouteDesign(id) {
    const design = routeDesigns.find((item) => item.id === id)
    if (!design) return
    if (id !== selectedRouteDesignId) {
      setRouteDesigns((designs) => designs.map((item) => item.id === selectedRouteDesignId ? { ...item, pendingEdit: null } : item))
      mapInteractionStatusRef.current?.showConfirmation?.()
    }
    setSelectedRouteDesignId(id)
  }

  function duplicateSelectedRouteDesign() {
    const next = duplicateRouteDesign(routeDesigns, selectedRouteDesignId)
    if (next.designs === routeDesigns) return
    setRouteDesigns(next.designs)
    setSelectedRouteDesignId(next.selectedId)
  }

  function removeSelectedRouteDesign() {
    const next = removeRouteDesign(routeDesigns, selectedRouteDesignId, selectedRouteDesignId)
    if (next.designs === routeDesigns) return
    setRouteDesigns(next.designs)
    setSelectedRouteDesignId(next.selectedId)
    setHiddenRouteDesignIds((prev) => {
      if (!prev.has(selectedRouteDesignId)) return prev
      const nextHidden = new Set(prev)
      nextHidden.delete(selectedRouteDesignId)
      return nextHidden
    })
    if (activeAppliedDesignId === selectedRouteDesignId) {
      const fallback = next.designs.find((design) => design.id === next.selectedId) ?? next.designs.find((design) => design.id === 'base')
      setActiveAppliedDesignId(fallback?.id ?? 'base')
      synchronizeSelectedRouteDesign(fallback)
    }
  }

  function toggleRouteDesignVisibility(id) {
    setHiddenRouteDesignIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  mapInteractionActionRef.current = workflowStep === 'settings' ? proposeMapPoint : null

  function undoSelectedRouteDesign() {
    const design = routeDesigns.find((item) => item.id === selectedRouteDesignId)
    const previous = design?.undoStack?.at(-1)
    if (!design || !previous) return
    const updated = createRouteDesign({ ...design, ...previous, undoStack: design.undoStack.slice(0, -1) })
    setRouteDesigns((designs) => designs.map((item) => item.id === updated.id ? updated : item))
    synchronizeSelectedRouteDesign(updated)
    setRouteError(null)
  }

  function undoBaseRoute() {
    const base = routeDesigns.find((design) => design.id === 'base')
    const previous = base?.undoStack?.at(-1)
    if (!base || !previous) return
    const updated = createRouteDesign({ ...base, ...previous, undoStack: base.undoStack.slice(0, -1) })
    applyBaseRoute(updated)
    setRouteError(null)
  }

  function setRouteInteractionMode(mode) {
    setMapInteractionMode(mode)
    mapInteractionModeRef.current = mode
    mapInteractionStatusRef.current?.({
      'click-add': '지도 클릭 추가 모드 — 항로 FIX를 클릭하세요',
      draw: '그리기 모드 — 항로 FIX를 지나는 선을 그리세요',
      'segment-detour': '구간 우회 모드 — 경로선을 새 위치까지 끌어 놓으세요',
    }[mode] ?? '')
  }

  async function requestAltitudeComparison(plannedAltitudeFt = cruiseAltitudeFt) {
    const design = selectedAppliedDesign
    const designResult = design?.routeResult ?? routeResult
    const routeGeometry = design?.routeModel?.routeGeometry ?? getCurrentRouteLineString({ routeResult: designResult, selectedSid: design?.procedures?.sid, selectedStar: design?.procedures?.star, selectedIap: iapData?.iapRoutes?.[design?.procedures?.iapKey] })
    if (!routeGeometry || !designResult) return null
    const requestId = ++altitudeComparisonRequestRef.current
    const routeModel = design?.routeModel ?? buildCommonRouteModel({ routeGeometry, routeResult: designResult })
    const etdIso = Number.isFinite(Date.parse(etd)) ? new Date(etd).toISOString().replace('.000Z', 'Z') : null
    setAltitudeComparisonLoading(true)
    setAltitudeComparisonError(null)
    try {
      const result = await fetchAltitudeComparison({ routeGeometry, routeModel, plannedCruiseAltitudeFt: plannedAltitudeFt, etd: etdIso, eta: eta || null })
      if (requestId === altitudeComparisonRequestRef.current) setAltitudeComparison(result)
      return result
    } catch (error) {
      if (requestId === altitudeComparisonRequestRef.current) setAltitudeComparisonError(error.message)
      return null
    } finally {
      if (requestId === altitudeComparisonRequestRef.current) setAltitudeComparisonLoading(false)
    }
  }

  async function continueToAltitudeComparison() {
    if (!selectedRouteDesignId) return
    const design = routeDesigns.find((item) => item.id === selectedRouteDesignId)
    if (!design) return
    setActiveAppliedDesignId(design.id)
    synchronizeSelectedRouteDesign(design)
    setWorkflowStep('altitude')
  }

  // 입력칸은 그냥 값만 담아둔다 — 이미 만들어진 고도 비교는 "고도 비교" 버튼을 다시 눌러야만
  // (startAltitudeComparison) 바뀐다. 타이핑/삭제만으로 기존 결과가 사라지면 안 된다.
  function setAltitudeDraft(value) {
    setAltitudeDraftFt(value)
  }

  async function startAltitudeComparison({ openWindow = true } = {}) {
    const value = Number(altitudeDraftFt)
    if (!Number.isFinite(value) || value <= 0) {
      setAltitudeComparisonError('계획 순항고도를 입력하세요.')
      return
    }
    updateCruiseAltitudeFt(value)
    const comparison = await requestAltitudeComparison(value)
    const candidateCruiseAltitudesFt = (comparison?.rows ?? [])
      .map((row) => Number(row.altFt ?? row.altitudeFt))
      .filter((altitudeFt) => Number.isFinite(altitudeFt) && altitudeFt > 0)
    await handleVerticalProfileRequest({
      plannedCruiseAltitudeFt: value,
      candidateCruiseAltitudesFt,
      crossSection: comparison?.crossSection ?? null,
      openWindow,
    })
  }

  function selectCruiseAltitude(value) {
    updateCruiseAltitudeFt(value)
    setAltitudeDraftFt(value)
    setBriefing(null)
    setBriefingError(null)
  }

  function continueToBriefing({ fitRoute = false } = {}) {
    const altitudeFt = Number(altitudeDraftFt)
    if (!selectedRouteDesignId || !Number.isFinite(Date.parse(eta))) return
    if (!Number.isFinite(altitudeFt) || altitudeFt <= 0) {
      setAltitudeComparisonError('계획 순항고도를 입력하세요.')
      return
    }
    updateCruiseAltitudeFt(altitudeFt)
    if (fitRoute) {
      const routeGeometry = selectedAppliedDesign?.routeModel?.routeGeometry ?? getCurrentRouteLineString({
        routeResult,
        vfrWaypoints: appliedVfrWaypoints,
        selectedSid,
        selectedStar,
        selectedIap,
      })
      const coordinates = routeGeometry?.coordinates ?? []
      if (coordinates.length > 0) setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates, maxZoom: 8 })
    }
    setVerticalProfileWindowOpen(false)
    setWorkflowStep('briefing')
  }

  function goToWorkflowStep(step) {
    if (step === 'briefing') {
      continueToBriefing()
      return
    }
    if (!workflowAvailability[step]) return
    if (step === 'settings') projectBaseForSettings()
    if (step !== 'altitude') setVerticalProfileWindowOpen(false)
    setWorkflowStep(step)
  }

  function goBackWorkflow() {
    const steps = ['settings', 'compare', 'altitude', 'briefing']
    const previous = steps[steps.indexOf(workflowStep) - 1]
    if (previous) goToWorkflowStep(previous)
  }

  function projectBaseForSettings() {
    const base = routeDesigns.find((design) => design.id === 'base')
    if (!base) return
    setSelectedRouteDesignId('base')
    setRouteEditor(editorFromBase(base))
    synchronizeSelectedRouteDesign(base)
  }

  // VFR starts with an editable direct route. Changing only the airports is
  // the one case that resets it; map and list edits keep the same waypoints.
  useEffect(() => {
    if (routeForm.flightRule !== 'VFR') { lastVfrKeyRef.current = ''; return }
    const dep = routeForm.departureAirport
    const arr = routeForm.arrivalAirport
    if (!dep || !arr) { lastVfrKeyRef.current = ''; return }
    const key = `${dep}>${arr}`
    if (key === lastVfrKeyRef.current) return
    lastVfrKeyRef.current = key
    const requestId = ++vfrPreviewRequestRef.current
    const text = formatVfrDraftText({ departureAirport: dep, arrivalAirport: arr })
    const editor = createRouteEditor({ routeForm: { ...routeForm, departureAirport: dep, arrivalAirport: arr }, rawText: text })
    setRouteEditor(editor)
    buildEditorPreview(editor, text)
      .then((preview) => { if (requestId === vfrPreviewRequestRef.current) setRouteEditor(preview.editor) })
      .catch((error) => { if (requestId === vfrPreviewRequestRef.current) setRouteError(error.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeForm.flightRule, routeForm.departureAirport, routeForm.arrivalAirport])

  // 딥링크 '전체 브리핑 보기' 착지 시 로드 후 브리핑 자동 생성을 예약하는 플래그.
  const [autoBriefingPending, setAutoBriefingPending] = useState(false)
  const autoSearchRef = useRef(false) // 자동추천이 픽스를 채운 뒤 검색을 1회만 재실행하도록 가드

  // 불러오기: restore saved inputs, re-search, then overlay saved VFR waypoints.
  // opts.autoBriefing=true → 경로검색 완료(routeResult) 후 아래 effect가 브리핑을 자동 생성.
  async function loadSavedRoute(saved, opts = {}) {
    const resetVersion = routeResetVersionRef.current
    saved = normalizeRouteSnapshot(saved)
    if (!saved?.base?.routeForm && !saved?.routeForm) return
    if (opts.autoBriefing) { setAutoBriefingPending(true); autoSearchRef.current = false }
    if (saved.base?.routeString && saved.base?.enroute) {
      const savedForm = saved.base.routeForm ?? saved.routeForm
      const procedureIds = saved.base.procedureIds ?? {}
      const [savedSids, savedStars, savedIapData] = await Promise.all([
        procedureIds.sid ? getProcedures(savedForm.departureAirport, 'SID') : Promise.resolve([]),
        procedureIds.star ? getProcedures(savedForm.arrivalAirport, 'STAR') : Promise.resolve([]),
        procedureIds.iapKey ? loadIapData(savedForm.arrivalAirport) : Promise.resolve(null),
      ])
      if (resetVersion !== routeResetVersionRef.current) return
      const procedures = {
        sid: savedSids.find((procedure) => procedure.id === procedureIds.sid) ?? null,
        star: savedStars.find((procedure) => procedure.id === procedureIds.star) ?? null,
        iapKey: savedIapData?.iapRoutes?.[procedureIds.iapKey] ? procedureIds.iapKey : null,
      }
      const preview = await buildEditorPreview(createRouteEditor({
        routeForm: savedForm,
        procedures,
        enroute: saved.base.enroute,
        rawText: saved.base.routeString,
      }), saved.base.routeString)
      if (resetVersion !== routeResetVersionRef.current) return
      const selectedIap = savedIapData?.iapRoutes?.[procedures.iapKey] ?? null
      const routeGeometry = getCurrentRouteLineString({ routeResult: preview.result, selectedSid: procedures.sid, selectedStar: procedures.star, selectedIap })
      const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: preview.result })
      const etdIso = Number.isFinite(Date.parse(saved.etd)) ? new Date(saved.etd).toISOString().replace('.000Z', 'Z') : null
      const savedEta = saved.eta || computeEtaIso(etdIso, preview.result.totalDistanceNm, saved.tasKt) || null
      const exposure = await fetchRouteExposure({ routeGeometry, routeModel, etd: etdIso, eta: savedEta }).catch((error) => ({ trigger: 'unavailable', hazards: [], error: error.message }))
      if (resetVersion !== routeResetVersionRef.current) return
      clearRouteDisplay()
      setEtd(saved.etd ?? etd)
      updateTasKt(saved.tasKt ?? tasKt)
      setEta(savedEta)
      const baseDesign = createRouteDesign({
        routeForm: savedForm,
        procedures,
        routeResult: preview.result,
        routeModel,
        routeExposure: exposure,
        enroute: preview.editor.enroute,
        routeString: preview.editor.rawText,
      })
      const alternatives = await Promise.all((saved.alternatives ?? []).slice(0, 3).map(async (alternative) => {
        try {
          const alternativeForm = alternative.routeForm ?? savedForm
          const alternativeIds = alternative.procedureIds ?? {}
          const [alternativeSids, alternativeStars, alternativeIapData] = await Promise.all([
            alternativeIds.sid ? getProcedures(alternativeForm.departureAirport, 'SID') : Promise.resolve([]),
            alternativeIds.star ? getProcedures(alternativeForm.arrivalAirport, 'STAR') : Promise.resolve([]),
            alternativeIds.iapKey ? loadIapData(alternativeForm.arrivalAirport) : Promise.resolve(null),
          ])
          const alternativeProcedures = {
            sid: alternativeSids.find((procedure) => procedure.id === alternativeIds.sid) ?? null,
            star: alternativeStars.find((procedure) => procedure.id === alternativeIds.star) ?? null,
            iapKey: alternativeIapData?.iapRoutes?.[alternativeIds.iapKey] ? alternativeIds.iapKey : null,
          }
          const alternativeIap = alternativeIapData?.iapRoutes?.[alternativeProcedures.iapKey] ?? null
          const alternativePreview = await buildEditorPreview(createRouteEditor({ routeForm: alternativeForm, procedures: alternativeProcedures, enroute: alternative.enroute, rawText: alternative.routeString }), alternative.routeString)
          const geometry = getCurrentRouteLineString({ routeResult: alternativePreview.result, selectedSid: alternativeProcedures.sid, selectedStar: alternativeProcedures.star, selectedIap: alternativeIap })
          const model = buildCommonRouteModel({ routeGeometry: geometry, routeResult: alternativePreview.result })
          const alternativeEta = computeEtaIso(etdIso, alternativePreview.result.totalDistanceNm, saved.tasKt)
          const alternativeExposure = await fetchRouteExposure({ routeGeometry: geometry, routeModel: model, etd: etdIso, eta: alternativeEta }).catch((error) => ({ trigger: 'unavailable', hazards: [], error: error.message }))
          return createRouteDesign({ ...alternative, kind: 'alternative', routeForm: alternativeForm, procedures: alternativeProcedures, routeResult: alternativePreview.result, routeModel: model, routeExposure: alternativeExposure, enroute: alternativePreview.editor.enroute, routeString: alternativePreview.editor.rawText })
        } catch { return null }
      }))
      if (resetVersion !== routeResetVersionRef.current) return
      let designs = [baseDesign, ...alternatives.filter(Boolean)]
      try {
        const batch = await fetchRouteExposureBatch({ routes: designs.map((design) => ({ id: design.id, routeGeometry: design.routeModel.routeGeometry, routeModel: design.routeModel, etd: etdIso, eta: computeEtaIso(etdIso, design.routeResult.totalDistanceNm ?? design.routeResult.distanceNm, saved.tasKt) })) })
        designs = designs.map((design) => {
          const exposureResult = batch.results.find((result) => result.id === design.id)
          return exposureResult ? { ...design, routeExposure: { ...exposureResult, snapshot: batch.snapshot } } : design
        })
      } catch { /* A saved route remains usable when fresh comparison data is unavailable. */ }
      if (resetVersion !== routeResetVersionRef.current) return
      setRouteDesigns(designs)
      const loadedBase = designs.find((design) => design.id === baseDesign.id) ?? baseDesign
      const selectedId = designs.some((design) => design.id === saved.selectedAlternativeId) ? saved.selectedAlternativeId : loadedBase.id
      setSelectedRouteDesignId(selectedId)
      setActiveAppliedDesignId(loadedBase.id)
      setRouteEditor(editorFromBase(loadedBase))
      setRouteResult(loadedBase.routeResult)
      setRouteExposure(loadedBase.routeExposure)
      setWorkflowStep('compare')
      return
    }
    // 자동 VFR 생성 effect가 이 dep/arr에 또 발동해 overlay를 덮지 않도록 키 선점.
    lastVfrKeyRef.current = `${saved.routeForm.departureAirport}>${saved.routeForm.arrivalAirport}`
    clearRouteDisplay()
    setRouteForm(saved.routeForm)
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAvailableSidIds(null)
    setAutoRecommendRequested(false)
    if (Number.isFinite(Number(saved.cruiseAltitudeFt))) updateCruiseAltitudeFt(Number(saved.cruiseAltitudeFt))
    setAlternateAirport(saved.alternateAirport || '')
    if (saved.etd) setEtd(saved.etd)
    const result = await runRouteSearch(saved.routeForm)
    if (resetVersion !== routeResetVersionRef.current) return
    if (saved.routeForm.flightRule === 'IFR') {
      // IFR: 로드 후 절차 자동추천 자동 발화(수동 '자동검색' 클릭과 동일) — SID/STAR 매칭·해외 경로 확보.
      // 스냅샷에 selectedSid/Star가 없어 존중할 값이 없으므로 자동추천이 안전. runRouteSearch await 뒤라 순차(수동 흐름 재현).
      setAutoRecommendRequested(true)
    }
  }

  // 딥링크 자동 브리핑 체인: (1) 경로 준비되면 브리핑 생성. (2) 아직이면, 자동추천이 픽스를
  // 채운 시점에 검색을 1회 실행(수동 흐름의 '검색' 클릭 대체) → routeResult 생기면 (1)로.
  useEffect(() => {
    if (!autoBriefingPending || briefing) return
    if (routeResult) {
      setAutoBriefingPending(false)
      handleGenerateBriefing()
      return
    }
    const f = routeForm
    const fixesReady = f.flightRule !== 'IFR' || (!!f.entryFix && !!f.exitFix)
    if (fixesReady && !routeLoading && !autoSearchRef.current) {
      autoSearchRef.current = true
      runRouteSearch(f)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBriefingPending, routeResult, briefing, routeForm.entryFix, routeForm.exitFix, routeLoading])

  // 선택된 후보 경로 1개를 실제로 적용 — loadSavedRoute와 동일한 순서로 상태를
  // 세팅해야 VFR 자동 경로생성 effect(위 611-621줄)가 이 경유점을 직선으로
  // 덮어쓰지 않는다: lastVfrKeyRef 선점 → clearRouteDisplay → routeForm → 결과 세팅.
  async function applyImportedPath(candidate) {
    setImportError(null)
    try {
      const simplified = simplifyRoute(candidate.coords, 20)
      const { departureAirport, arrivalAirport } = snapEndpointsToAirports(simplified, airports, 5)
      // RDP 솎기가 점을 실제로 줄이면(트랙처럼 조밀한 입력) 이름 배열의 인덱스가 더는
      // 좌표와 맞지 않는다 — 원본 개수 그대로 유지된 경우(실제 EFB route가 보통 이 경우)
      // 에만 이름을 전달한다.
      const waypointNames = candidate.names && simplified.length === candidate.coords.length ? candidate.names : null
      if (!departureAirport || !arrivalAirport) throw new Error('가져온 경로의 양끝 공항을 확인하세요.')
      const terms = simplified.slice(1, -1).map(([lon, lat], index) => {
        const name = waypointNames?.[index + 1]
        return name ? { kind: 'fix', id: name } : { kind: 'coordinate', coordinate: { lon, lat } }
      })
      const importedForm = { ...routeForm, flightRule: 'VFR', departureAirport, arrivalAirport }
      const importedText = formatVfrDraftText({ departureAirport, arrivalAirport, enroute: { terms, legIntents: Array.from({ length: Math.max(0, terms.length - 1) }, () => ({ kind: 'dct' })) } })
      const preview = await buildEditorPreview(createRouteEditor({ routeForm: importedForm, rawText: importedText }), importedText)
      const routeGeometry = getCurrentRouteLineString({ routeResult: preview.result, vfrWaypoints: buildVfrWaypointsFromRouteResult(preview.result, airports) })
      const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: preview.result })

      lastVfrKeyRef.current = `${departureAirport ?? ''}>${arrivalAirport ?? ''}`
      clearRouteDisplay()
      applyBaseRoute(createRouteDesign({
        routeForm: importedForm,
        procedures: { sid: null, star: null, iapKey: null },
        routeResult: preview.result,
        routeModel,
        routeExposure: { trigger: 'unavailable', hazards: [] },
        enroute: preview.editor.enroute,
        routeString: preview.editor.rawText,
      }))
      setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: simplified, maxZoom: 8 })

      const warnings = []
      const [firstLon, firstLat] = simplified[0]
      const [lastLon, lastLat] = simplified[simplified.length - 1]
      if (!isWithinKoreaFir(firstLon, firstLat) || !isWithinKoreaFir(lastLon, lastLat)) {
        warnings.push('경로가 한국 정보구역 밖 — 기상이 비어 있을 수 있습니다.')
      }
      setImportWarning(warnings.join(' ') || null)
    } catch (err) {
      setImportError(err.message)
    }
    setImportCandidates([])
  }

  // 파일 선택 → 파싱 → 후보 1개면 바로 적용, 여러 개면 선택 대기(importCandidates).
  async function importRouteFromFile(file) {
    setImportError(null)
    setImportWarning(null)
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseRouteFile(file.name, text)
      const candidates = extractRoutePaths(parsed)
      if (candidates.length === 0) {
        setImportError('경로 점이 부족합니다.')
        return
      }
      if (candidates.length === 1) {
        applyImportedPath(candidates[0])
        return
      }
      setImportCandidates(candidates)
    } catch (err) {
      setImportError(err.message || '파일을 읽을 수 없습니다 (GeoJSON/GPX/KML 확인)')
    }
  }

  function cancelImportChoice() {
    setImportCandidates([])
  }

  async function handleVerticalProfileRequest({
    plannedCruiseAltitudeFt: requestedAltitudeFt = cruiseAltitudeFt,
    candidateCruiseAltitudesFt = [],
    crossSection: existingCrossSection = null,
    openWindow = true,
  } = {}) {
    const routeGeometry = getCurrentRouteLineString({
      routeResult,
      vfrWaypoints: appliedVfrWaypoints,
      selectedSid,
      selectedStar,
      selectedIap,
    })
    const plannedCruiseAltitudeFt = Number(requestedAltitudeFt)

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
      const [profile, cs] = await Promise.all([
        fetchVerticalProfile(buildVerticalProfileRequest({
          routeGeometry,
          routeResult,
          selectedSid,
          selectedStar,
          selectedIap,
          vfrWaypoints: appliedVfrWaypoints,
          plannedCruiseAltitudeFt,
          candidateCruiseAltitudesFt,
        })),
        existingCrossSection ?? fetchCrossSection(buildCrossSectionRequest({ routeGeometry, etd })).catch(() => null),
      ])
      if (requestId !== verticalProfileRequestRef.current) return
      setVerticalProfile(profile)
      setCrossSection(cs)
      setVerticalProfileStale(false)
      setVerticalProfileWindowOpen(openWindow)
    } catch (err) {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileError(err.message)
    } finally {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileLoading(false)
    }
  }

  // 연직단면도에서 다른 예보시간(hf)을 선택했을 때 그 시간만 다시 불러온다.
  // 고도 프로파일은 hf와 무관하므로 다시 계산하지 않는다.
  async function handleSelectForecastHour(hf) {
    const routeGeometry = getCurrentRouteLineString({
      routeResult,
      vfrWaypoints: appliedVfrWaypoints,
      selectedSid,
      selectedStar,
      selectedIap,
    })
    if (!routeGeometry || !Number.isFinite(Number(hf))) return
    const requestId = ++verticalProfileRequestRef.current
    setCrossSectionHourLoading(true)
    try {
      const cs = await fetchCrossSection(buildCrossSectionRequest({
        routeGeometry,
        etd,
        tmfc: crossSection?.run?.tmfc,
        hf,
      })).catch(() => null)
      if (requestId !== verticalProfileRequestRef.current) return
      if (cs) setCrossSection(cs)
    } finally {
      if (requestId === verticalProfileRequestRef.current) setCrossSectionHourLoading(false)
    }
  }

  // Planned total distance (IFR total incl SID/STAR/IAP; VFR waypoint-summed).
  // Shared by 브리핑 생성 and the live ETA readout in the form.
  const plannedDistanceNm = useMemo(() => {
    if (!routeResult) return 0
    return routeForm.flightRule === 'VFR'
      ? calcVfrDistance(appliedVfrWaypoints)
      : (buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })?.totalDistanceNm
          || Number(routeResult?.distanceNm) || 0)
  }, [routeResult, routeForm.flightRule, appliedVfrWaypoints, selectedSid, selectedStar, selectedIap])

  // dep→arr magnetic course (for the VFR cruising-altitude hint). Hint only.
  const magCourseDeg = useMemo(() => {
    const dep = airports.find((a) => a.icao === routeForm.departureAirport)
    const arr = airports.find((a) => a.icao === routeForm.arrivalAirport)
    if (!dep || !arr || !Number.isFinite(dep.lat) || !Number.isFinite(arr.lat)) return null
    return magneticCourse(initialBearingDeg(dep.lat, dep.lon, arr.lat, arr.lon))
  }, [airports, routeForm.departureAirport, routeForm.arrivalAirport])

  // VFR leg별: 반원고도 힌트(좌표 파생) + 최고 지형고도(vfrLegTerrain에서 병합). 고도 입력 옆 표시용.
  const vfrLegs = useMemo(() => {
    if (routeForm.flightRule !== 'VFR') return []
    const legs = []
    for (let i = 0; i < appliedVfrWaypoints.length - 1; i += 1) {
      const a = appliedVfrWaypoints[i]
      const b = appliedVfrWaypoints[i + 1]
      const valid = Number.isFinite(a?.lat) && Number.isFinite(b?.lat)
      const mc = valid ? magneticCourse(initialBearingDeg(a.lat, a.lon, b.lat, b.lon)) : null
      const key = `${a?.id}→${b?.id}`
      const currentToFt = Number.isFinite(Number(b?.altitudeFt)) ? Number(b.altitudeFt) : Number(cruiseAltitudeFt)
      const recommendedFt = mc == null ? null : nearestVfrCruiseAltitude(currentToFt, mc)
      legs.push({
        key,
        eastbound: mc == null ? null : ((((mc % 360) + 360) % 360) < 180),
        recommendedFt,
        targetIndex: i + 1,
        targetEditable: !!b && !b.fixed,
        compliant: recommendedFt != null && currentToFt === recommendedFt,
        maxTerrainFt: vfrLegTerrain[key] ?? null,
      })
    }
    return legs
  }, [routeForm.flightRule, appliedVfrWaypoints, vfrLegTerrain, cruiseAltitudeFt])

  // 경로 지오메트리가 바뀌면 leg별 최고 지형고도를 가볍게(기상 제외) 미리 가져온다.
  // 연직단면도 "생성"과 무관 — 고도를 정하는 그 자리에서 지형 여유를 보게 한다.
  const legTerrainRequestRef = useRef(0)
  useEffect(() => {
    if (routeResult?.flightRule !== 'VFR' || appliedVfrWaypoints.length < 2) {
      setVfrLegTerrain({})
      return undefined
    }
    const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints: appliedVfrWaypoints, selectedSid, selectedStar, selectedIap })
    if (!routeGeometry) return undefined
    const requestId = ++legTerrainRequestRef.current
    const timer = setTimeout(async () => {
      try {
        const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
          routeGeometry,
          routeResult,
          vfrWaypoints: appliedVfrWaypoints,
          plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT,
        }))
        if (requestId !== legTerrainRequestRef.current) return
        const byKey = {}
        for (const leg of profile?.flightPlan?.profile?.legs ?? []) {
          byKey[`${leg.fromLabel}→${leg.toLabel}`] = leg.maxTerrainFt
        }
        setVfrLegTerrain(byKey)
      } catch { /* 지형 미리보기 실패는 조용히 무시 */ }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedVfrWaypoints, routeResult?.flightRule])

  async function handleGenerateBriefing() {
    const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints: appliedVfrWaypoints, selectedSid, selectedStar, selectedIap })
    if (!routeGeometry) { setBriefingError('먼저 경로를 검색하세요.'); return }
    const routeModel = buildCommonRouteModel({ routeGeometry, routeResult })
    const etdIso = new Date(etd).toISOString().replace('.000Z', 'Z')
    const briefingEta = routeForm.flightRule === 'IFR' ? eta : (eta || computeEtaIso(etdIso, plannedDistanceNm, tasKt) || etdIso)
    if (!briefingEta || !Number.isFinite(Date.parse(briefingEta))) { setBriefingError('예상 ETA를 입력하세요.'); return }
    setBriefingLoading(true); setBriefingError(null)
    try {
      const result = await fetchRouteBriefing({
        flightRule: routeForm.flightRule,
        departureAirport: routeForm.departureAirport,
        arrivalAirport: routeForm.arrivalAirport,
        alternateAirport: alternateAirport || null,
        routeGeometry,
        routeModel,
        etd: etdIso,
        eta: briefingEta,
        plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT,
      })
      setBriefing(result)
      setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: routeGeometry.coordinates, maxZoom: 8 })
      // also load profile + cross-section so ④ can render the inline 단면도 (best-effort)
      try {
        const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT
        const [profile, cs] = await Promise.all([
          fetchVerticalProfile(buildVerticalProfileRequest({
            routeGeometry, routeModel, routeResult, selectedSid, selectedStar, selectedIap, vfrWaypoints: appliedVfrWaypoints, plannedCruiseAltitudeFt,
          })),
          fetchCrossSection(buildCrossSectionRequest({ routeGeometry, etd: etdIso })).catch(() => null),
        ])
        setVerticalProfile(profile)
        setCrossSection(cs)
      } catch { /* inline 단면도 optional */ }
    } catch (err) { setBriefingError(err.message) }
    finally { setBriefingLoading(false) }
  }

  const workflowAvailability = {
    settings: true,
    compare: !!routeResult,
    altitude: !!selectedRouteDesignId,
    briefing: Number.isFinite(Number(altitudeDraftFt)) && Number(altitudeDraftFt) > 0 && !!selectedRouteDesignId && Number.isFinite(Date.parse(eta)),
  }

  return {
    state: {
      routeForm,
      routeResult,
      routeError,
      routeLoading,
      cruiseAltitudeFt,
      verticalProfile,
      crossSection,
      crossSectionHourLoading,
      verticalProfileLoading,
      verticalProfileError,
      verticalProfileStale,
      verticalProfileWindowOpen,
      vfrWaypoints: appliedVfrWaypoints,
      vfrLegs,
      importCandidates,
      importWarning,
      importError,
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
      mapInteractionMode,
      routeDraftText,
      hasRouteDraftPreview: !!routeDraftResult,
      canUndoBase: !!routeDesigns.find((design) => design.id === 'base')?.undoStack?.length,
      pendingRouteEdit,
      pendingContextChange,
      alternateAirport,
      etd,
      tasKt,
      eta,
      routeDesigns,
      selectedRouteDesignId,
      hiddenRouteDesignIds,
      activeAppliedDesignId,
      routeExposure,
      altitudeComparison,
      altitudeComparisonLoading,
      altitudeComparisonError,
      altitudeDraftFt,
      workflowStep,
      workflowAvailability,
      briefing,
      briefingLoading,
      briefingError,
    },
    refs: {
      vfrWaypointsRef,
      hideTimerRef,
      mapInteractionModeRef,
      mapInteractionActionRef,
      mapInteractionStatusRef,
      vfrWaypointDropRef,
      designWaypointDropRef,
      isComparisonRef,
    },
    derived: {
      isFirInMode,
      isFirExitMode,
      selectedIap,
      visibleSidOptions,
      plannedDistanceNm,
      magCourseDeg,
    },
    actions: {
      updateRouteField,
      handleDepartureAirportChange,
      handleArrivalAirportChange,
      swapRouteAirports,
      handleEntryFixChange,
      handleExitFixChange,
      switchFlightRule,
      handleAutoRecommend,
      handleSidChange,
      handleStarChange,
      handleIapChange,
      handleRouteReset,
      handleRouteSearch,
      loadSavedRoute,
      importRouteFromFile,
      applyImportedPath,
      cancelImportChoice,
      handleVerticalProfileRequest,
      handleSelectForecastHour,
      setHoveredWpInfo,
      setVerticalProfileWindowOpen,
      setCruiseAltitudeFt: updateCruiseAltitudeFt,
      setAlternateAirport,
      setEtd,
      setTasKt: updateTasKt,
      setEta,
      setRouteDraftText: updateRouteDraftText,
      applyRouteDraft,
      startAlternativeFrom,
      updateSelectedDesignDraftText,
      previewSelectedDesignDraft,
      cancelSelectedDesignDraft,
      applySelectedDesignDraft,
      cancelPendingRouteEdit,
      undoBaseRoute,
      setPendingRouteEdit,
      confirmContextChange,
      setPendingContextChange,
      selectRouteDesign,
      duplicateSelectedRouteDesign,
      removeSelectedRouteDesign,
      toggleRouteDesignVisibility,
      undoSelectedRouteDesign,
      setMapInteractionMode: setRouteInteractionMode,
      continueToAltitudeComparison,
      setAltitudeDraft,
      startAltitudeComparison,
      selectCruiseAltitude,
      continueToBriefing,
      goToWorkflowStep,
      goBackWorkflow,
      handleGenerateBriefing,
      setBriefing,
    },
    routePreviewModel,
  }
}
