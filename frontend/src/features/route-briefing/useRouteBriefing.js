import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchVerticalProfile, fetchCrossSection, fetchRouteBriefing } from '../../api/briefingApi.js'
import { getProcedures, KNOWN_AIRPORTS } from './lib/procedureData.js'
import { buildBriefingRoute, buildVfrRoute, canBuildBriefingRoutePath, loadIapData, loadNavpoints, loadOverseasLinks, loadRouteDirectionMetadata } from './lib/routePlanner.js'
import { relabeledWaypoints, calcVfrDistance, findInsertIndex } from './lib/routePreview.js'
import { computeEtaIso } from './lib/etaCalc.js'
import { getLastUsed } from './lib/aircraftProfiles.js'
import { initialBearingDeg, magneticCourse, nearestVfrCruiseAltitude, minVfrCruiseAltitude } from './lib/altitude.js'
import { buildVerticalProfileRequest } from './lib/verticalProfileRequest.js'
import { recommendProcedures } from './lib/recommendProcedures.js'
import { parseRouteFile, extractRoutePaths, simplifyRoute, snapEndpointsToAirports, isWithinKoreaFir } from './lib/routeImport.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  buildBoundaryFixOptions,
  buildIapCandidates,
  buildIfrDistanceBreakdown,
  buildInitialVfrWaypoints,
  buildRoutePreviewModel,
  buildVfrRouteFromWaypoints,
  buildVisibleSidOptions,
  getCurrentRouteLineString,
  getVfrAirportAltitudeFt,
} from './lib/routeBriefingModel.js'

export const initialRouteForm = {
  flightRule: 'IFR',
  departureAirport: '', entryFix: '',
  exitFix: '', arrivalAirport: '', routeType: 'RNAV',
}
export const DEFAULT_CRUISE_ALTITUDE_FT = 9000
// 경로 임포트 시 초기고도 자동설정용 지형 여유 마진. 항공안전법 시행규칙 §199(최저비행고도):
// 밀집지역 300m(1,000ft)/일반지역 150m(500ft) — 혼잡 여부를 지형데이터만으로 판단 못 하므로
// 보수적으로 밀집지역 기준(1,000ft)을 항상 적용한다.
const IMPORT_TERRAIN_MARGIN_FT = 1000

export function useRouteBriefing({ activePanel, airports = [], metarData = null }) {
  const [routeForm, setRouteForm] = useState(initialRouteForm)
  const [routeResult, setRouteResult] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(() => getLastUsed()?.altitudeFt ?? DEFAULT_CRUISE_ALTITUDE_FT)
  const [verticalProfile, setVerticalProfile] = useState(null)
  const [crossSection, setCrossSection] = useState(null)
  const [verticalProfileLoading, setVerticalProfileLoading] = useState(false)
  const [verticalProfileError, setVerticalProfileError] = useState(null)
  const [verticalProfileStale, setVerticalProfileStale] = useState(false)
  const [verticalProfileWindowOpen, setVerticalProfileWindowOpen] = useState(false)
  const [editingVfrAltitudeIndex, setEditingVfrAltitudeIndex] = useState(null)
  const [vfrWaypoints, setVfrWaypoints] = useState([])
  // leg(경유점 i→i+1)별 최고 지형고도(ft), 키 = `from→to`. 가벼운 /vertical-profile로 미리 채움.
  const [vfrLegTerrain, setVfrLegTerrain] = useState({})
  const [importCandidates, setImportCandidates] = useState([]) // 다중 경로 파일일 때 사용자 선택 대기 목록
  const [importWarning, setImportWarning] = useState(null)
  const [importError, setImportError] = useState(null)
  // 되돌리기: 패널에서의 경유점 편집(추가/삭제/순서/전체고도) 직전 스냅샷 스택.
  const [vfrUndoStack, setVfrUndoStack] = useState([])
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
  const lastVfrKeyRef = useRef('') // 자동 VFR 경로생성: 마지막으로 생성한 출발>도착 (중복 생성·경유점 리셋 방지)
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

  // 해외 공항이 출발/도착에 끼면 경로 검색은 전체(ALL) 유형으로.
  // 해외 항로(테스트=X-Plane 2012)는 대부분 재래식(ATS)이라 RNAV 전용이면 경로가 없어 자동검색이 실패함.
  const isOverseasRoute =
    (!!routeForm.departureAirport && !KNOWN_AIRPORTS.includes(routeForm.departureAirport) && !isFirInMode) ||
    (!!routeForm.arrivalAirport && !KNOWN_AIRPORTS.includes(routeForm.arrivalAirport) && !isFirExitMode)
  const effectiveRouteType = isOverseasRoute ? 'ALL' : routeForm.routeType
  const selectedIap = iapData?.iapRoutes?.[selectedIapKey] ?? null
  const [alternateAirport, setAlternateAirport] = useState('')
  const [etd, setEtd] = useState(() => {
    // Absolute UTC instant; the ETD field renders/edits it in the app timezone.
    const d = new Date()
    d.setUTCSeconds(0, 0)
    return d.toISOString().replace('.000Z', 'Z')
  })
  const [cruiseSpeedKt, setCruiseSpeedKt] = useState(() => getLastUsed()?.tasKt ?? 120)
  const [briefing, setBriefing] = useState(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState(null)
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
    setCrossSection(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    setVfrWaypoints([])
    setVfrUndoStack([])
    setFitBoundsRequest(null)
    setBriefing(null)
    setBriefingError(null)
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
    }).then((best) => {
      if (cancelled || !best) return

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

  // Snapshot the committed waypoints before a panel edit so 되돌리기 can restore.
  function snapshotVfr() {
    setVfrUndoStack((s) => [...s.slice(-19), vfrWaypointsRef.current])
  }

  function deleteVfrWaypoint(idx) {
    snapshotVfr()
    const next = relabeledWaypoints(vfrWaypoints.filter((_, i) => i !== idx))
    setVfrWaypoints(next)
    setHoveredWpInfo(null)
  }

  // 검색-추가: insert a named fix (airport/navaid) at its best segment position.
  function addVfrWaypointByFix(cand) {
    if (!cand || !Number.isFinite(cand.lon) || !Number.isFinite(cand.lat)) return
    snapshotVfr()
    setVfrWaypoints((prev) => {
      if (prev.length < 2) return prev
      const idx = findInsertIndex(prev, { lng: cand.lon, lat: cand.lat })
      const wp = { id: cand.id, uid: crypto.randomUUID(), lon: cand.lon, lat: cand.lat, named: true }
      return relabeledWaypoints([...prev.slice(0, idx), wp, ...prev.slice(idx)])
    })
  }

  // 드래그 시작 시 1회 스냅샷(되돌리기용). 드래그 중 매 단계 reorder는 스냅샷하지 않음.
  function beginVfrReorder() {
    snapshotVfr()
  }

  // 순서 변경: 비고정 경유점만(고정 출/도착은 양끝 유지). to는 [1, len-2]로 클램프.
  // 드래그 중 라이브로 여러 번 호출되므로 스냅샷은 beginVfrReorder에서 1회만.
  function reorderVfrWaypoint(from, to) {
    setVfrWaypoints((prev) => {
      if (from < 0 || from >= prev.length || prev[from]?.fixed) return prev
      const lastMid = prev.length - 2
      const target = Math.max(1, Math.min(lastMid, to))
      if (target === from) return prev
      const arr = [...prev]
      const [moved] = arr.splice(from, 1)
      arr.splice(target, 0, moved)
      return relabeledWaypoints(arr)
    })
  }

  function undoVfrWaypoints() {
    if (vfrUndoStack.length === 0) return
    const prev = vfrUndoStack[vfrUndoStack.length - 1]
    setVfrUndoStack((s) => s.slice(0, -1))
    setVfrWaypoints(prev)
    setHoveredWpInfo(null)
  }

  // Core search by explicit form (so 불러오기 can search the saved form without
  // waiting for a setRouteForm state flush). Returns the result or null.
  async function runRouteSearch(form) {
    const requestId = ++routeSearchRequestRef.current
    setRouteLoading(true)
    setRouteError(null)
    setVfrUndoStack([])
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
    return runRouteSearch(routeForm)
  }

  // VFR: 출발·도착이 모두 정해지거나 바뀌면 경로를 자동 생성한다(직선 dep→arr이라 명시적 "검색" 불필요).
  // 같은 dep/arr면 재생성하지 않아 경유점이 보존됨 — 무심코 검색해 경유점이 날아가는 footgun 제거.
  // 불러오기(loadSavedRoute)는 자체 re-search+overlay를 하므로 키를 선점해 이 effect를 건너뛴다.
  useEffect(() => {
    if (routeForm.flightRule !== 'VFR') { lastVfrKeyRef.current = ''; return }
    const dep = routeForm.departureAirport
    const arr = routeForm.arrivalAirport
    if (!dep || !arr) { lastVfrKeyRef.current = ''; return }
    const key = `${dep}>${arr}`
    if (key === lastVfrKeyRef.current) return
    lastVfrKeyRef.current = key
    runRouteSearch(routeForm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeForm.flightRule, routeForm.departureAirport, routeForm.arrivalAirport])

  // 딥링크 '전체 브리핑 보기' 착지 시 로드 후 브리핑 자동 생성을 예약하는 플래그.
  const [autoBriefingPending, setAutoBriefingPending] = useState(false)
  const autoSearchRef = useRef(false) // 자동추천이 픽스를 채운 뒤 검색을 1회만 재실행하도록 가드

  // 불러오기: restore saved inputs, re-search, then overlay saved VFR waypoints.
  // opts.autoBriefing=true → 경로검색 완료(routeResult) 후 아래 effect가 브리핑을 자동 생성.
  async function loadSavedRoute(saved, opts = {}) {
    if (!saved?.routeForm) return
    if (opts.autoBriefing) { setAutoBriefingPending(true); autoSearchRef.current = false }
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
    if (Number.isFinite(Number(saved.cruiseAltitudeFt))) setCruiseAltitudeFt(Number(saved.cruiseAltitudeFt))
    setAlternateAirport(saved.alternateAirport || '')
    if (saved.etd) setEtd(saved.etd)
    const result = await runRouteSearch(saved.routeForm)
    if (result?.flightRule === 'VFR' && Array.isArray(saved.vfrWaypoints) && saved.vfrWaypoints.length >= 2) {
      // Backfill uid for routes saved before uids existed (stable React keys).
      setVfrWaypoints(saved.vfrWaypoints.map((wp) => (wp.uid ? wp : { ...wp, uid: crypto.randomUUID() })))
    } else if (saved.routeForm.flightRule === 'IFR') {
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

  // 임포트한 경유점의 중간(비고정) 지점들 초기고도를, 그 지점과 맞닿은 leg의 최고
  // 지형고도 + IMPORT_TERRAIN_MARGIN_FT 이상이 되는 가장 낮은 반원고도로 채운다.
  // vfrLegTerrain effect(아래)와 동일한 /vertical-profile 조회·leg 키 규칙을 재사용 —
  // 새 데이터 없음. 조회 실패 시 조용히 원래 고도 유지(치명적이지 않은 향상 기능).
  async function computeTerrainSafeAltitudes(waypoints, routeCoords) {
    try {
      const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
        routeGeometry: { type: 'LineString', coordinates: routeCoords },
        routeResult: { flightRule: 'VFR' },
        vfrWaypoints: waypoints,
        plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT,
      }))
      const terrainByLegKey = {}
      for (const leg of profile?.flightPlan?.profile?.legs ?? []) {
        terrainByLegKey[`${leg.fromLabel}→${leg.toLabel}`] = leg.maxTerrainFt
      }
      return waypoints.map((wp, index) => {
        if (wp.fixed) return wp
        const prevWp = waypoints[index - 1]
        const nextWp = waypoints[index + 1]
        const prevTerrainFt = prevWp ? terrainByLegKey[`${prevWp.id}→${wp.id}`] : null
        const nextTerrainFt = nextWp ? terrainByLegKey[`${wp.id}→${nextWp.id}`] : null
        const candidates = [prevTerrainFt, nextTerrainFt].filter(Number.isFinite)
        if (candidates.length === 0) return wp
        const maxTerrainFt = Math.max(...candidates)
        // 방향 기준 = 이 경유점으로 들어오는 leg(기존 vfrLegs 힌트와 동일 관례: "구간이
        // 향하는 경유점"에 적용).
        const from = prevWp ?? nextWp
        if (!Number.isFinite(from?.lat) || !Number.isFinite(wp.lat)) return wp
        const magCourseDeg = magneticCourse(initialBearingDeg(from.lat, from.lon, wp.lat, wp.lon))
        return { ...wp, altitudeFt: minVfrCruiseAltitude(maxTerrainFt + IMPORT_TERRAIN_MARGIN_FT, magCourseDeg) }
      })
    } catch {
      return waypoints
    }
  }

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
      const { routeResult: importedResult, vfrWaypoints: importedWaypoints } = buildVfrRouteFromWaypoints(simplified, {
        departureAirport, arrivalAirport, airports, waypointNames,
      })
      const safeWaypoints = await computeTerrainSafeAltitudes(importedWaypoints, simplified)

      lastVfrKeyRef.current = `${departureAirport ?? ''}>${arrivalAirport ?? ''}`
      clearRouteDisplay()
      setRouteForm((prev) => ({
        ...prev,
        flightRule: 'VFR',
        departureAirport: departureAirport ?? '',
        arrivalAirport: arrivalAirport ?? '',
      }))
      setRouteResult(importedResult)
      setVfrWaypoints(safeWaypoints)
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

  function updateVfrWaypointAltitude(idx, value) {
    setVfrWaypoints((prev) => prev.map((wp, i) => (
      i === idx ? { ...wp, altitudeFt: value } : wp
    )))
  }

  function applyCruiseAltitudeToVfrWaypoints() {
    const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt)
    if (!Number.isFinite(plannedCruiseAltitudeFt) || plannedCruiseAltitudeFt <= 0) return
    snapshotVfr()
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
      const [profile, cs] = await Promise.all([
        fetchVerticalProfile(buildVerticalProfileRequest({
          routeGeometry,
          routeResult,
          selectedSid,
          selectedStar,
          selectedIap,
          vfrWaypoints,
          plannedCruiseAltitudeFt,
        })),
        fetchCrossSection({ routeGeometry }).catch(() => null),
      ])
      if (requestId !== verticalProfileRequestRef.current) return
      setVerticalProfile(profile)
      setCrossSection(cs)
      setVerticalProfileStale(false)
      setVerticalProfileWindowOpen(true)
    } catch (err) {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileError(err.message)
    } finally {
      if (requestId === verticalProfileRequestRef.current) setVerticalProfileLoading(false)
    }
  }

  // Planned total distance (IFR total incl SID/STAR/IAP; VFR waypoint-summed).
  // Shared by 브리핑 생성 and the live ETA readout in the form.
  const plannedDistanceNm = useMemo(() => {
    if (!routeResult) return 0
    return routeForm.flightRule === 'VFR'
      ? calcVfrDistance(vfrWaypoints)
      : (buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })?.totalDistanceNm
          || Number(routeResult?.distanceNm) || 0)
  }, [routeResult, routeForm.flightRule, vfrWaypoints, selectedSid, selectedStar, selectedIap])

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
    for (let i = 0; i < vfrWaypoints.length - 1; i += 1) {
      const a = vfrWaypoints[i]
      const b = vfrWaypoints[i + 1] // 권장 고도 적용 대상 = 이 구간이 향하는(순항하는) 경유점
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
  }, [routeForm.flightRule, vfrWaypoints, vfrLegTerrain, cruiseAltitudeFt])

  // 경로 지오메트리가 바뀌면 leg별 최고 지형고도를 가볍게(기상 제외) 미리 가져온다.
  // 연직단면도 "생성"과 무관 — 고도를 정하는 그 자리에서 지형 여유를 보게 한다.
  const legTerrainRequestRef = useRef(0)
  useEffect(() => {
    if (routeResult?.flightRule !== 'VFR' || vfrWaypoints.length < 2) {
      setVfrLegTerrain({})
      return undefined
    }
    const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
    if (!routeGeometry) return undefined
    const requestId = ++legTerrainRequestRef.current
    const timer = setTimeout(async () => {
      try {
        const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
          routeGeometry,
          routeResult,
          vfrWaypoints,
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
  }, [vfrWaypoints, routeResult?.flightRule])

  async function handleGenerateBriefing() {
    const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
    if (!routeGeometry) { setBriefingError('먼저 경로를 검색하세요.'); return }
    const distanceNm = plannedDistanceNm
    const etdIso = new Date(etd).toISOString().replace('.000Z', 'Z')
    const etaIso = computeEtaIso(etdIso, distanceNm, cruiseSpeedKt) || etdIso
    setBriefingLoading(true); setBriefingError(null)
    try {
      const result = await fetchRouteBriefing({
        flightRule: routeForm.flightRule,
        departureAirport: routeForm.departureAirport,
        arrivalAirport: routeForm.arrivalAirport,
        alternateAirport: alternateAirport || null,
        routeGeometry,
        etd: etdIso,
        eta: etaIso,
        plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT,
      })
      setBriefing(result)
      // also load profile + cross-section so ④ can render the inline 단면도 (best-effort)
      try {
        const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT
        const [profile, cs] = await Promise.all([
          fetchVerticalProfile(buildVerticalProfileRequest({
            routeGeometry, routeResult, selectedSid, selectedStar, selectedIap, vfrWaypoints, plannedCruiseAltitudeFt,
          })),
          fetchCrossSection({ routeGeometry }).catch(() => null),
        ])
        setVerticalProfile(profile)
        setCrossSection(cs)
      } catch { /* inline 단면도 optional */ }
    } catch (err) { setBriefingError(err.message) }
    finally { setBriefingLoading(false) }
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
      verticalProfileLoading,
      verticalProfileError,
      verticalProfileStale,
      verticalProfileWindowOpen,
      editingVfrAltitudeIndex,
      vfrWaypoints,
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
      alternateAirport,
      etd,
      cruiseSpeedKt,
      briefing,
      briefingLoading,
      briefingError,
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
      plannedDistanceNm,
      magCourseDeg,
      canUndoVfr: vfrUndoStack.length > 0,
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
      addVfrWaypointByFix,
      beginVfrReorder,
      reorderVfrWaypoint,
      undoVfrWaypoints,
      handleRouteSearch,
      loadSavedRoute,
      importRouteFromFile,
      applyImportedPath,
      cancelImportChoice,
      updateVfrWaypointAltitude,
      applyCruiseAltitudeToVfrWaypoints,
      handleVerticalProfileRequest,
      setHoveredWpInfo,
      setEditingVfrAltitudeIndex,
      setVerticalProfileWindowOpen,
      setCruiseAltitudeFt,
      setVfrWaypoints,
      setAlternateAirport,
      setEtd,
      setCruiseSpeedKt,
      handleGenerateBriefing,
      setBriefing,
    },
    routePreviewModel,
  }
}
