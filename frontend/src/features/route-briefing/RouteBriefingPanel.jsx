import { useState, useRef, useMemo, useEffect } from 'react'
import { KNOWN_AIRPORTS } from './lib/procedureData.js'

import { loadOverseasAirports } from './lib/routePlanner.js'
import { calcVfrDistance } from './lib/routePreview.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
} from './lib/routeBriefingModel.js'
import { Button, Field, Dropdown, Combobox, Option, Input, SpinButton, Badge, MessageBar, MessageBarBody, DatePicker, TimePicker, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, Divider, Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, makeStyles, tokens } from '../../shared/ui/fluent.js'
import { listSavedRoutes, saveRoute, deleteSavedRoute } from './lib/routeStore.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import RouteImportChooser from './RouteImportChooser.jsx'
import { buildRouteAviationLayerChips } from '../map/layerActions.js'
import { BellRing, Folder, Undo2, X, RotateCcw } from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import AirportPickerField from '../../shared/ui/AirportPickerField.jsx'
import PickerField from '../../shared/ui/PickerField.jsx'
import RouteTokenField from './RouteTokenField.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { computeEtaIso } from './lib/etaCalc.js'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import { formatBriefingTime } from './lib/briefingTime.js'
import { buildSavedProfileRequest } from './lib/verticalProfileRequest.js'
import { buildSavedGeometry } from './lib/routeSaveGeometry.js'
import { loadNavdata } from './lib/routePlanner.js'
import './RouteBriefing.css'

const AIRPORT_KO = {
  RKSI: '인천', RKSS: '김포', RKPC: '제주', RKPK: '김해',
  RKJB: '무안', RKNY: '양양', RKJY: '여수', RKPU: '울산', RKTH: '포항경주',
  RKTU: '청주', RKNW: '원주', RKPS: '사천', RKJJ: '광주',
}
// ponytail: static for domestic only; overseas loaded dynamically via useEffect in component.
const DOMESTIC_AIRPORT_OPTIONS = KNOWN_AIRPORTS.map((icao) => ({ value: icao, ko: AIRPORT_KO[icao] ?? icao, region: '대한민국' }))
const NONE_OPTION = { value: '', label: '-- 없음 --' }

// 데스크톱 폼 레이아웃 — 커스텀 .css 대신 Fluent griffel + 토큰
const useStyles = makeStyles({
  form: {
    // 단계(①②③) 사이는 한 칸 넓게 — 좁으면 단계 구분이 안 보이고 한 덩어리로 읽힌다.
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXL, padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalXXL}`,
    // 칸 이름은 단계 제목(sectionTitle)보다 한 단계 작고 흐리게 — 제목이 먼저 읽히도록.
    '& .fui-Field__label, & .rtf-label': { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  },
  // 단계 안 묶음(공항 · SID/STAR · 경로칸 · 작성 도구) 사이 간격. 단계 사이(form gap)보다는 좁게.
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM, alignItems: 'end' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },
  field: { minWidth: 0 },
  fieldFull: { gridColumn: '1 / -1', minWidth: 0 },
  // ⇄ 교환 버튼은 가운데 전용 칸(auto). 출발/도착은 좌우 대칭. (1fr 1fr로 키우면 ⇄ 자리가 없어 겹침)
  routeRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: tokens.spacingHorizontalS, alignItems: 'end' },
  altnCell: { gridColumn: '3', gridRow: '2', minWidth: 0 },
  layerCell: { gridColumn: '1', gridRow: '2', minWidth: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  swapBtn: { minWidth: '32px', marginBottom: tokens.spacingVerticalXS },
  actions: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: tokens.spacingHorizontalS },
  draftActions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  draftApply: { flexGrow: 1 },
  toolSection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  toolLabel: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  performance: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, alignItems: 'start' },
  etaReset: { alignSelf: 'end' },
  // DatePicker/TimePicker 내부 Combobox 기본 min-width(250px)를 눌러 좁은 패널에서 한 줄에 맞춤
  picker: {
    width: '100%', minWidth: 0,
    '& .fui-Combobox': { minWidth: 0 },
    '& .fui-Combobox__input': { minWidth: 0, width: '100%' },
    '& .fui-Input__input': { minWidth: 0, width: '100%' },
  },
  summary: {
    display: 'flex', justifyContent: 'space-between', gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
  },
  result: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalM },
  totalDist: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // SpinButton(TAS)만 글씨가 한 단계 작게 나와 옆 입력칸과 달라 보였다 — 같은 크기로.
  ctrl: { width: '100%', minWidth: 0, '& .fui-SpinButton__input': { fontSize: tokens.fontSizeBase300 } },
  full: { width: '100%' },
  routeText: { width: '100%', minHeight: '132px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
})

// 목록 선택 Dropdown(타이핑 없음) — value↔표시텍스트↔selectedOptions 처리 한 곳에
function FDropdown({ value, onChange, options, placeholder = '선택', disabled, className, "aria-label": ariaLabel }) {
  const v = String(value ?? '')
  const sel = options.find((o) => String(o.value) === v)
  return (
    <Dropdown
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
      value={sel ? sel.label : placeholder}
      selectedOptions={[v]}
      onOptionSelect={(_, d) => onChange(d.optionValue)}
    >
      {options.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
    </Dropdown>
  )
}

// 상대 시간 라벨: 방금/N분 전/N시간 전/오늘/어제/N일 전.
function relativeTime(ts) {
  if (!Number.isFinite(ts)) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day === 1) return '어제'
  if (day < 7) return `${day}일 전`
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

export default function RouteBriefingPanel({ state, refs = {}, derived, actions, airports = [], aviationVisibility = {}, onToggleAviation, metVisibility = {}, onToggleMet, onRequestLogin, onAutocompletePreview, onAutocompletePreviewMap }) {
  const isMobile = useIsMobile()
  const s = useStyles()
  const { tz } = useTimeZone()
  const { user } = useAuth()
  const [allAirportOptions, setAllAirportOptions] = useState(DOMESTIC_AIRPORT_OPTIONS)

  // Load overseas airports and merge with domestic options
  useEffect(() => {
    loadOverseasAirports().then((overseasAirports) => {
      if (!overseasAirports || Object.keys(overseasAirports).length === 0) {
        setAllAirportOptions(DOMESTIC_AIRPORT_OPTIONS)
        return
      }
      const overseasOptions = Object.entries(overseasAirports)
        .map(([icao, ap]) => ({ value: icao, ko: ap?.nameKo ?? icao, region: ap?.region ?? '해외' }))
      setAllAirportOptions([...DOMESTIC_AIRPORT_OPTIONS, ...overseasOptions])
    }).catch(() => {
      setAllAirportOptions(DOMESTIC_AIRPORT_OPTIONS)
    })
  }, [])

  // The briefing stays an active task; the sheet × collapses to the peek summary
  // instead of closing (use the bottom task bar to leave 브리핑).
  const [planStep, setPlanStep] = useState(0)
  const [returnStep, setReturnStep] = useState(null)
  const [sheetDetent, setSheetDetent] = useState('full')
  const [detentTouched, setDetentTouched] = useState(false)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const {
    routeForm,
    routeResult,
    routeError,
    routeLoading,
    cruiseAltitudeFt,
    verticalProfileLoading,
    verticalProfileError,
    verticalProfile,
    vfrWaypoints,
    vfrLegs = [],
    importCandidates,
    importNotices,
    roundTripPending,
    importError,
    navpointsById,
    tokenLookups,
    routeTokens,
    routeTokenErrors,
    classifyRouteTexts,
    hoveredWpInfo,
    starOptions,
    sidOptions,
    selectedSid,
    selectedStar,
    iapCandidates,
    selectedIapKey,
    firInOptions,
    firExitOptions,
    alternateAirport,
    etd,
    tasKt,
    eta,
    routeDesigns,
    selectedRouteDesignId,
    routeExposure,
    altitudeComparison,
    altitudeComparisonLoading,
    altitudeComparisonError,
    altitudeDraftFt,
    workflowStep,
    workflowAvailability,
    mapInteractionMode,
    routeDraftText,
    hasRouteDraftPreview,
    canUndoBase,
    pendingRouteEdit,
    pendingContextChange,
    briefingLoading,
    briefingError,
  } = state
  const { hideTimerRef } = refs
  const { isFirInMode, isFirExitMode, selectedIap, visibleSidOptions, canUndoVfr } = derived
  const {
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
    loadSavedRouteIntoEditor,
    importRouteFromFile,
    applyImportedPath,
    cancelImportChoice,
    setHoveredWpInfo,
    setCruiseAltitudeFt,
    setAlternateAirport,
    setEtd,
    clearEtaOverride,
    setTasKt,
    setRouteDraftText,
    setRouteTokenTexts,
    applyRouteDraft,
    cancelPendingRouteEdit,
    undoBaseRoute,
    confirmContextChange,
    setPendingContextChange,
    selectRouteDesign,
    duplicateSelectedRouteDesign,
    removeSelectedRouteDesign,
    startAlternativeFrom,
    updateSelectedDesignDraftText,
    previewSelectedDesignDraft,
    applySelectedDesignDraft,
    undoSelectedRouteDesign,
    setMapInteractionMode,
    continueToAltitudeComparison,
    setAltitudeDraft,
    startAltitudeComparison,
    setVerticalProfileWindowOpen,
    selectCruiseAltitude,
    continueToBriefing,
    goToWorkflowStep,
    goBackWorkflow,
    handleGenerateBriefing,
  } = actions

  const isIfr = routeForm.flightRule === 'IFR'
  // VFR 왕복(장주·훈련·유람)은 뜬 곳으로 돌아온다 — 반대편에 같은 공항을 고를 수
  // 있어야 한다. IFR은 같은 공항으로 비행계획을 내는 경우가 사실상 없어 그대로 잠근다.
  const departurePickerLock = isIfr ? routeForm.arrivalAirport : null
  const arrivalPickerLock = isIfr ? routeForm.departureAirport : null
  const autoEta = computeEtaIso(etd, derived.plannedDistanceNm, tasKt)
  const etaIso = eta || autoEta
  const etaDisplay = etaIso ? formatBriefingTime(etaIso, tz, { withDate: true }).replace('-', '/').replace('Z', ' UTC') : ''
  const appliedBase = routeDesigns.find((design) => design.id === 'base')
  // S8: 첫 경로 입력은 지도 맥락을 남기기 위해 항상 half로 시작한다. 사용자가 손수 드래그(detentTouched)했으면 존중하고
  // 자동 전환을 멈춘다(스텝/규칙 전환마다 되돌리면 성가심).
  useEffect(() => {
    if (detentTouched) return
    const wantsFull = true
    setSheetDetent(wantsFull ? 'full' : 'half')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIfr, workflowStep, detentTouched])
  // 공항은 선택 사항이다. 경로 계산은 진입·이탈 FIX만 있으면 돌아가고(routePlanner의
  // canBuildBriefingRoutePath), 공항이 없으면 절차·공항 기상·공항 기준 ETD/ETA만 빠진다 —
  // 그 사실은 입력칸 아래 상태 줄이 알린다. 빈 입력으로 검색하는 것만 막는다.
  const canSearch = routeTokens.length > 0
  // 요약 숫자는 즉시 교체한다. 중간에 지나가는 값은 어떤 경로에도 해당하지 않는다.
  const routeDistanceNm = routeResult?.totalDistanceNm ?? routeResult?.distanceNm
  const routeSummaryText = [
    Number.isFinite(routeDistanceNm) ? `${Math.round(routeDistanceNm)} NM` : null,
    etaDisplay || null,
  ].filter(Boolean).join(' · ')
  const autocomplete = useMemo(() => ({ lookups: tokenLookups, sidOptions, starOptions, flightRule: routeForm.flightRule, departure: routeForm.departureAirport, arrival: routeForm.arrivalAirport }), [tokenLookups, sidOptions, starOptions, routeForm.flightRule, routeForm.departureAirport, routeForm.arrivalAirport])

  // 데스크톱과 모바일이 같은 입력칸을 쓴다. 구조가 다른 두 화면에 같은 것을 두 번 짜면
  // 한쪽만 고쳐지는 일이 생긴다.
  // 공용 단계 본문보다 위에 있어야 한다 — 아래에 두면 정의되기 전에
  // 참조해서 화면이 통째로 죽는다. 시험은 통과하고 빌드도 되지만 실행이 안 된다.
  const routeTokenField = (
    <>
      <RouteTokenField
        label={isIfr ? '경로' : '경로 (공항 · FIX · DCT · 좌표)'}
        hint={isIfr ? null : '지도에서 선을 끌어 지점을 넣으면 경로에 반영됩니다.'}
        placeholder={isIfr ? '예: RKSI BINIL A582 ANDOL RKPC' : '예: RKSI DCT ANDOL DCT RKPC'}
        tokens={routeTokens}
        autocomplete={autocomplete}
        onPreviewChange={onAutocompletePreview}
        onPreviewMap={onAutocompletePreviewMap}
        onChange={setRouteTokenTexts}
      />
      <div className="rtf-status">
        <span className="rtf-status-left">
          {routeTokenErrors.length > 0 ? (
            <button type="button" className="rtf-error-toggle" onClick={() => setErrorsOpen((open) => !open)}>
              {`⚠ ${routeTokenErrors.length} error`}
            </button>
          ) : (!routeForm.departureAirport
            ? '출발공항 없음 — 절차·공항 기상은 표시되지 않습니다'
            : '')}
        </span>
        <span className="rtf-status-right">
          {routeSummaryText}
          {/* 되돌리기는 거리·도착시각 줄 끝에 작게 — 따로 한 줄을 차지하면 경로칸 아래가 너무 길어진다. */}
          {!isMobile && <Button size="small" appearance="subtle" type="button" icon={<Undo2 size={14} />} onClick={undoBaseRoute} disabled={!canUndoBase}>되돌리기</Button>}
        </span>
      </div>
      {errorsOpen && routeTokenErrors.length > 0 && (
        <ul className="rtf-error-list">
          {routeTokenErrors.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </>
  )
  // 초기화 오클릭 방지: 잃을 입력이 있으면 한 번 더 눌러 확인(3초 후 자동 해제).
  const [resetArmed, setResetArmed] = useState(false)
  const resetArmTimerRef = useRef(null)
  const hasInput = !!routeResult || !!routeForm.departureAirport || !!routeForm.arrivalAirport
  function armOrReset() {
    if (resetArmed || !hasInput) {
      clearTimeout(resetArmTimerRef.current)
      setResetArmed(false)
      handleRouteReset()
      return
    }
    setResetArmed(true)
    resetArmTimerRef.current = setTimeout(() => setResetArmed(false), 3000)
  }

  // 경유점 순서 변경(드래그)용 + 리스트 FLIP 애니메이션.
  // 드래그 소스 인덱스는 ref로(드래그 이벤트는 빠르게 연속 발생 → state는 stale 위험).
  // 순서 교체는 '놓을 때' 1회만(드래그 중 라이브 교체는 native DnD와 충돌해 튐/잔상).
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  // 경로 저장/불러오기 (localStorage). 저장은 입력값만; 로드는 재검색으로 복원.
  const [menuOpen, setMenuOpen] = useState(false)
  const [savedRoutes, setSavedRoutes] = useState([])
  const pendingAlertRouteRef = useRef(null)
  // 경로 메뉴는 경로만 보여준다. 브리핑은 내 계정에서 연다 — 성격이 다른 둘을 한 목록에
  // 섞으면 "이거 누르면 어디로 가지?"가 매번 생기고, 여기 X가 브리핑을 지우게 된다.
  const refreshSaved = async () => setSavedRoutes(await listSavedRoutes({ kind: 'route' }))
  function openRouteAlert(routeId) {
    window.dispatchEvent(new CustomEvent('open-alert-panel', { detail: { view: 'settings', routeId } }))
  }
  useEffect(() => {
    const pending = pendingAlertRouteRef.current
    if (!user || !pending) return
    pendingAlertRouteRef.current = null
    saveRoute(pending.name, pending).then((saved) => {
      if (!saved || typeof saved.id !== 'number') throw new Error('route_save_failed')
      refreshSaved()
      openRouteAlert(saved.id)
    }).catch(() => window.alert('경로를 계정에 저장하지 못했습니다. 다시 시도해 주세요.'))
  }, [user])
  async function handleSaveCurrentRoute(openAlert = false) {
    const def = `${routeForm.departureAirport || '?'} → ${routeForm.arrivalAirport || '?'}`
    const name = window.prompt('경로 이름', def)
    if (name == null) return
    const base = routeDesigns.find((design) => design.id === 'base')
    // 완성된 경로선을 함께 남긴다 — 없으면 로드가 재검색으로 복원해야 하고(해외 IFR 실패),
    // 알림 스케줄러는 경로 기하를 못 찾아 그 비행을 아예 건너뛴다.
    const { routeGeometry, enrouteGeometry, routeModel, routeMarkers } = buildSavedGeometry({
      routeResult: base?.routeResult ?? routeResult,
      vfrWaypoints,
      selectedSid: base?.procedures?.sid ?? selectedSid,
      selectedStar: base?.procedures?.star ?? selectedStar,
      selectedIap,
    })
    const airacCycle = (await loadNavdata()).publicationId ?? null
    const saved = await saveRoute(name.trim() || def, {
      version: 3,
      cruiseAltitudeFt, tasKt, etd,
      eta: eta || null, // 사용자가 고친 ETA를 지킨다. 없으면 로드 때 거리·TAS로 계산.
      routeGeometry, enrouteGeometry, routeModel, routeMarkers, airacCycle,
      profileRequest: buildSavedProfileRequest({ routeGeometry, routeModel, routeResult: base?.routeResult ?? routeResult, selectedSid, selectedStar, selectedIap, vfrWaypoints, plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) }),
      alternateAirport: alternateAirport || null,
      nwpTimeSelection: state.nwpTimeSelection ?? null,
      selectedAlternativeId: selectedRouteDesignId === 'base' ? null : selectedRouteDesignId,
      base: base && {
        id: 'base', kind: 'base', name: base.name,
        routeForm: base.routeForm,
        procedureIds: { sid: base.procedures?.sid?.id ?? null, star: base.procedures?.star?.id ?? null, iapKey: base.procedures?.iapKey ?? null },
        enroute: base.enroute,
        routeString: base.routeString,
      },
      alternatives: routeDesigns.filter((design) => design.kind === 'alternative').map((design) => ({
        id: design.id, kind: 'alternative', name: design.name,
        routeForm: design.routeForm,
        procedureIds: { sid: design.procedures?.sid?.id ?? null, star: design.procedures?.star?.id ?? null, iapKey: design.procedures?.iapKey ?? null },
        enroute: design.enroute,
        routeString: design.routeString,
      })),
    })
    refreshSaved()
    if (openAlert && saved) {
      if (typeof saved.id === 'number') openRouteAlert(saved.id)
      else { pendingAlertRouteRef.current = saved; onRequestLogin?.() }
    }
  }
  const routeMenu = (
    <Menu open={menuOpen} onOpenChange={(_, d) => { setMenuOpen(d.open); if (d.open) refreshSaved() }}>
      <MenuTrigger disableButtonEnhancement>
        <MenuButton appearance="outline" size="small" icon={<Folder size={16} />}>{'경로'}</MenuButton>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={() => handleSaveCurrentRoute()} disabled={!routeResult}>{'＋ 현재 경로 저장…'}</MenuItem>
          <MenuItem onClick={() => { setMenuOpen(false); handleSaveCurrentRoute(true) }} disabled={!routeResult} icon={<BellRing size={15} />}>{'현재 경로 알림 설정…'}</MenuItem>
          {savedRoutes.length > 0 && <Divider />}
          {savedRoutes.map((r) => (
            <div key={r.id} className="rb-saved-row">
              <span className="rb-saved-name">{r.name}<span className="rb-saved-meta"> · {relativeTime(r.savedAt)}</span></span>
              <button type="button" className="rb-saved-load" onClick={() => { setMenuOpen(false); loadSavedRouteIntoEditor(r) }}>{'로드'}</button>
              <button type="button" className="rb-saved-load" aria-label={`${r.name} SIGMET 알림 설정`} title="이 경로 SIGMET 알림 설정"
                onClick={() => {
                  setMenuOpen(false)
                  if (typeof r.id === 'number') openRouteAlert(r.id)
                  else if (user) saveRoute(r.name, r).then((saved) => { refreshSaved(); if (saved?.id) openRouteAlert(saved.id) })
                  else { pendingAlertRouteRef.current = r; onRequestLogin?.() }
                }}><BellRing size={15} /></button>
              <button type="button" className="rb-saved-del" aria-label="경로 삭제" onClick={async () => { await deleteSavedRoute(r.id); refreshSaved() }}><X size={14} /></button>
            </div>
          ))}
          {savedRoutes.length === 0 && <MenuItem disabled>{'저장된 경로 없음'}</MenuItem>}
        </MenuList>
      </MenuPopover>
    </Menu>
  )

  const importFileInputRef = useRef(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  function handleImportFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 가능하도록
    if (file) { importRouteFromFile(file); setImportDialogOpen(false) }
  }
  function handleImportDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { importRouteFromFile(file); setImportDialogOpen(false) }
  }
  const importButton = (
    <>
      <input
        ref={importFileInputRef}
        type="file"
        data-testid="route-import-file"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />
      <Button appearance="outline" size="small" onClick={() => setImportDialogOpen(true)}>
        {'경로 불러오기'}
      </Button>
    </>
  )
  const importDialog = (
    <Dialog open={importDialogOpen} onOpenChange={(_, d) => setImportDialogOpen(d.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="outline" size="small" onClick={() => importFileInputRef.current?.click()}>{'파일 선택'}</Button>}
          >
            {'경로 불러오기'}
          </DialogTitle>
          <DialogContent>
            <div
              className={`rb-import-dropzone${isDragOver ? ' is-drag-over' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleImportDrop}
            >
              <span className="rb-import-dropzone-text">{'GeoJSON · GPX · KML · KMZ · FPL 파일을 여기에 드래그하세요'}</span>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
  const importFeedback = (
    <>
      {importCandidates.length > 0 && (
        <RouteImportChooser candidates={importCandidates} onSelect={applyImportedPath} onCancel={cancelImportChoice} />
      )}
      {/* key에 message를 붙인다 — fix-moved는 지점마다 하나씩 나올 수 있어 code만으로는 겹친다. */}
      {roundTripPending && (
        <MessageBar intent="warning">
          <MessageBarBody>{'출발·도착이 같습니다 — 지도에서 돌아올 지점을 눌러주세요.'}</MessageBarBody>
        </MessageBar>
      )}
      {importNotices.map((notice) => (
        <MessageBar key={`${notice.code}:${notice.message}`} intent={notice.level === 'action' ? 'warning' : 'info'}>
          <MessageBarBody>{notice.message}</MessageBarBody>
        </MessageBar>
      ))}
      {importError && <MessageBar intent="error"><MessageBarBody>{importError}</MessageBarBody></MessageBar>}
    </>
  )

  // ETD(ISO/UTC) ↔ tz 벽시계 변환 — DatePicker/TimePicker는 Date의 로컬 필드를 쓰므로 tz 보정.
  const tzOffsetMs = tz === 'KST' ? 9 * 3600 * 1000 : 0
  const etdBaseMs = Number.isFinite(Date.parse(etd)) ? Date.parse(etd) : Date.now()
  const w0 = new Date(etdBaseMs + tzOffsetMs)
  const etdWall = new Date(w0.getUTCFullYear(), w0.getUTCMonth(), w0.getUTCDate(), w0.getUTCHours(), w0.getUTCMinutes())
  const setEtdWall = (y, mo, d, h, mi) => setEtd(new Date(Date.UTC(y, mo, d, h, mi) - tzOffsetMs).toISOString())
  // 도착이 출발보다 빠르면 뒤집힌 시간창이 서버로 넘어가 NOTAM·SIGMET이 조용히 걸러진다.
  const etaBeforeEtd = Number.isFinite(Date.parse(etd)) && Number.isFinite(Date.parse(etaIso))
    && Date.parse(etaIso) <= Date.parse(etd)
  function swapAirports() {
    swapRouteAirports()
  }

  // Shared between the desktop panel and the mobile sheet.
  const errorBlock = routeError && (
    <MessageBar intent="error"><MessageBarBody>{routeError}</MessageBarBody></MessageBar>
  )

  // VFR distance is always derived from the applied route; editing stays in the shared text draft.
  const isVfrResult = routeResult?.flightRule === 'VFR' && vfrWaypoints.length >= 2
  const vfrTotalDist = isVfrResult && (
    <div className="route-check-total-dist">
      {'총 거리'}: <strong>{calcVfrDistance(vfrWaypoints).toFixed(1)} NM</strong>
    </div>
  )
  // 지도 레이어 토글칩 — VFR 경로 구성 시 웨이포인트/항행시설/항공로를 지도에서 보며 작업.
  // NAVAID+WAYPOINT, RNAV+ATS 항공로는 각각 한 버튼으로 묶여 있다(buildRouteAviationLayerChips).
  const aviationLayerChips = buildRouteAviationLayerChips(aviationVisibility, onToggleAviation)
  // Briefing inputs (교체공항 / ETD / 순항속도) + 브리핑 생성 trigger. Shared
  // between desktop and mobile. 교체공항 options mirror the 출발/도착 airport
  // source (KNOWN_AIRPORTS) plus a 없음 entry.
  // showGenerate: desktop keeps the 브리핑 생성 button inside this section; mobile
  // moves it to the sheet footer (progressive primary action), so pass false there.
  // ── Desktop panel ──
  // 교체공항은 출발·도착과 함께 경로 생성 단계에서 고른다. 'FIR' 자리의 버튼을 '선택 안 함'으로
  // 쓰면 빈 값일 때 그 이름이 그대로 보인다. FIR 이탈(도착 공항 없음)일 때는 고를 게 없다.
  const alternateOptions = allAirportOptions.filter((o) => o.value !== routeForm.departureAirport && o.value !== routeForm.arrivalAirport)
  const alternatePicker = isFirExitMode ? null : (
    <AirportPickerField label={isMobile ? '교체' : '교체 공항'} value={alternateAirport} options={alternateOptions}
      firOption={{ value: '', label: '선택 안 함' }} onChange={setAlternateAirport} align="right" />
  )
  function renderDesktopAirportSelect(label, value, onChange, firSentinel, firLabel, disabledValue, align) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <AirportPickerField
          label={label}
          value={value}
          options={allAirportOptions}
          firOption={{ value: firSentinel, label: firLabel }}
          onChange={onChange}
          disabledValue={disabledValue}
          align={align}
        />
      </div>
    )
  }

  const depProcControl = isFirInMode ? (
    <FDropdown className={s.ctrl} disabled={firInOptions.length === 0} value={routeForm.entryFix} onChange={handleEntryFixChange}
      options={firInOptions.length === 0 ? [{ value: '', label: '진입 FIX 없음' }] : [{ value: '', label: '-- 없음 --' }, ...firInOptions.map((o) => ({ value: o.value, label: o.label }))]} />
  ) : visibleSidOptions.length > 0 ? (
    <FDropdown className={s.ctrl} value={selectedSid?.id ?? ''} onChange={(id) => handleSidChange(visibleSidOptions.find((p) => p.id === id) ?? null)}
      options={[{ value: '', label: '-- 없음 --' }, ...visibleSidOptions.map((p) => ({ value: p.id, label: p.label }))]} />
  ) : (
    <Input className={s.ctrl} value={routeForm.entryFix} onChange={(_, d) => handleEntryFixChange(d.value)} />
  )

  const arrProcControl = isFirExitMode ? (
    <FDropdown className={s.ctrl} disabled={firExitOptions.length === 0} value={routeForm.exitFix} onChange={handleExitFixChange}
      options={firExitOptions.length === 0 ? [{ value: '', label: '이탈 FIX 없음' }] : [{ value: '', label: '-- 없음 --' }, ...firExitOptions.map((o) => ({ value: o.value, label: o.label }))]} />
  ) : starOptions.length > 0 ? (
    <FDropdown className={s.ctrl} value={selectedStar?.id ?? ''} onChange={(id) => handleStarChange(starOptions.find((p) => p.id === id) ?? null)}
      options={[{ value: '', label: '-- 없음 --' }, ...starOptions.map((p) => ({ value: p.id, label: p.label }))]} />
  ) : (
    <Input className={s.ctrl} value={routeForm.exitFix} onChange={(_, d) => handleExitFixChange(d.value)} />
  )

  const depChosen = !!routeForm.departureAirport
  const arrChosen = !!routeForm.arrivalAirport
  const firOnEitherSide = routeForm.departureAirport === FIR_IN_AIRPORT || routeForm.arrivalAirport === FIR_EXIT_AIRPORT

  // A selected summary cell opens that editor directly and returns to the previous step.
  const openPlanStep = (step) => {
    if (step !== planStep) setReturnStep(planStep)
    setPlanStep(step)
    if (step !== 1) setMapInteractionMode(null)
    if (workflowStep !== 'settings') goToWorkflowStep('settings')
    if (isMobile) setSheetDetent('full')
  }
  const planNext = () => {
    const next = returnStep !== null ? returnStep : Math.min(planStep + 1, 2)
    if (next !== 1) setMapInteractionMode(null)
    setPlanStep(next)
    setReturnStep(null)
    if (isMobile) setSheetDetent('full')
  }
  const appliedProceduresMatch = !isIfr || !appliedBase || (
    (appliedBase.procedures?.sid?.id ?? null) === (selectedSid?.id ?? null)
    && (appliedBase.procedures?.star?.id ?? null) === (selectedStar?.id ?? null)
    && (appliedBase.procedures?.iapKey ?? null) === (selectedIapKey ?? null)
  )
  const routeValid = Boolean(routeResult && appliedProceduresMatch && !routeLoading && !routeTokenErrors.length && !pendingRouteEdit && !pendingContextChange)
  const altitudeValue = Number(altitudeDraftFt)
  const altitudeValid = altitudeDraftFt !== '' && Number.isFinite(altitudeValue) && altitudeValue >= 500 && altitudeValue <= 60000
  const timeValid = Number.isFinite(Date.parse(etd)) && Number.isFinite(Date.parse(etaIso)) && !etaBeforeEtd && Number(tasKt) >= 60 && Number(tasKt) <= 600
  const airportName = code => {
    if (!code) return ''
    if (code === FIR_IN_AIRPORT) return 'FIR 진입'
    if (code === FIR_EXIT_AIRPORT) return 'FIR 이탈'
    const name = allAirportOptions.find(option => option.value === code)?.ko || AIRPORT_NAME_KO[code] || AIRPORT_KO[code]
    return name ? name.replace('국제공항', '').replace('공항', '') : '공항명 정보 없음'
  }
  const routeSummary = routeTokens.map(token => token.text).join(' ')
  const planSummary = (
    <div className={`rb-plan-summary${briefingLoading ? ' is-loading' : ''}`} aria-label="비행계획 요약" aria-busy={briefingLoading}>
      <button type="button" className={`rb-plan-airports${planStep === 0 ? ' is-active' : ''}`} onClick={() => openPlanStep(0)} aria-label="공항 설정 수정">
        <span><strong>{routeForm.departureAirport || '—'}</strong><small>{airportName(routeForm.departureAirport) || '출발 공항'}</small></span>
      <span className="rb-plan-flight" aria-hidden="true"><span className="rb-plan-plane">✈</span></span>
        <span className="rb-plan-arrival"><strong>{routeForm.arrivalAirport || '—'}</strong><small>{airportName(routeForm.arrivalAirport) || '목적 공항'}</small></span>
      </button>
      <div className="rb-plan-meta"><span>{routeForm.flightRule}</span><span>교체 {alternateAirport || '설정 안 함'}</span><button type="button" onClick={() => openPlanStep(2)} aria-label="출발시각 수정">출발 {formatBriefingTime(etd, tz, { withDate: true })} ›</button></div>
      <div className="rb-plan-cells">
        <button type="button" className={planStep === 1 ? 'is-active' : ''} onClick={() => openPlanStep(1)}><span>비행경로 <i>수정 ›</i></span><strong>{routeSummary || '경로 설정'}</strong></button>
        <button type="button" className={planStep === 2 ? 'is-active' : ''} onClick={() => openPlanStep(2)}><span>순항고도 · 순항속도 <i>수정 ›</i></span><strong>{altitudeValid ? `${altitudeValue >= 18000 ? `FL${Math.round(altitudeValue / 100)}` : `${altitudeValue.toLocaleString()} ft`} · ${tasKt} kt` : '고도 · 순항속도 설정'}</strong></button>
      </div>
    </div>
  )
  const planBody = (
    <form className={`rb-plan-editor ${s.form}`} onSubmit={e => e.preventDefault()}>
      {planStep === 0 && <>
        <div className={s.sectionHead}><h3 className={s.sectionTitle}>① 공항 설정</h3><div className="rb-rule-seg" role="tablist" aria-label="비행 규칙">{['IFR', 'VFR'].map(rule => <button key={rule} type="button" role="tab" aria-selected={routeForm.flightRule === rule} className={routeForm.flightRule === rule ? 'is-active' : ''} onClick={() => switchFlightRule(rule)}>{rule}</button>)}</div></div>
        <p className="rb-plan-hint">출발·목적지와 교체공항을 선택하세요.</p>
        <div className={s.routeRow}>
          {renderDesktopAirportSelect('출발 공항', routeForm.departureAirport, handleDepartureAirportChange, FIR_IN_AIRPORT, 'FIR 진입', departurePickerLock, 'left')}
          <Button className={s.swapBtn} appearance="subtle" type="button" aria-label="출발 도착 교환" disabled={firOnEitherSide} onClick={swapAirports}>⇄</Button>
          {renderDesktopAirportSelect('목적 공항', routeForm.arrivalAirport, handleArrivalAirportChange, FIR_EXIT_AIRPORT, 'FIR 이탈', arrivalPickerLock, 'right')}
          {alternatePicker && <div className={`${s.altnCell} rb-altn-cell`}>{alternatePicker}</div>}
        </div>
      </>}
      {planStep === 1 && <>
        <div className={s.sectionHead}><h3 className={s.sectionTitle}>② 비행경로 설정</h3>{importButton}</div>
        <p className="rb-plan-hint">경로를 직접 입력하거나 지도에서 지정할 수 있습니다.</p>
        <div className={s.actions}>
          {isIfr && <Button appearance="secondary" type="button" onClick={handleAutoRecommend} disabled={routeLoading || !canSearch}>{routeLoading ? '생성 중...' : '자동 생성'}</Button>}
          <Button appearance={mapInteractionMode === 'click-add' ? 'primary' : 'secondary'} type="button" onClick={() => { const next = mapInteractionMode === 'click-add' ? null : 'click-add'; setMapInteractionMode(next); if (isMobile && next) { setDetentTouched(true); setSheetDetent('peek') } }} disabled={routeLoading || !canSearch}>지도 클릭</Button>
          <Button appearance={mapInteractionMode === 'draw' ? 'primary' : 'secondary'} type="button" onClick={() => { const next = mapInteractionMode === 'draw' ? null : 'draw'; setMapInteractionMode(next); if (isMobile && next) { setDetentTouched(true); setSheetDetent('peek') } }} disabled={routeLoading || !canSearch}>그리기</Button>
        </div>
        {routeTokenField}
        {pendingRouteEdit && !pendingRouteEdit.mapCoordinates && <div className="rb-route-edit-confirm" role="status"><span>{pendingRouteEdit.message}</span><div><Button size="small" appearance="primary" type="button" onClick={() => applyRouteDraft(pendingRouteEdit.text)}>적용</Button><Button size="small" appearance="secondary" type="button" onClick={cancelPendingRouteEdit}>취소</Button></div></div>}
        {isIfr && <details className="rb-plan-details"><summary>출발·도착 절차 설정</summary><div className={s.grid}><Field label={isFirInMode ? '진입 FIX' : 'SID'}>{depProcControl}</Field><Field label={isFirExitMode ? '이탈 FIX' : 'STAR'}>{arrProcControl}</Field>{!isFirExitMode && iapCandidates.length > 1 && <Field label="RWY"><FDropdown className={s.ctrl} value={selectedIapKey ?? ''} onChange={handleIapChange} options={iapCandidates.map(({ key, label }) => ({ value: key, label }))} /></Field>}{!isFirExitMode && selectedIap && <div className={s.fieldFull} aria-label="자동 연결된 대표 접근절차">접근절차 · {selectedIap.sourceProcedure || selectedIap.fullName || selectedIap.name} (대표 경로)</div>}</div></details>}
        {onToggleAviation && <LayerToggleChips items={aviationLayerChips} ariaLabel="경로 입력 지도 레이어" />}
        {!routeValid && <p className="rb-plan-hint">경로를 생성하거나 유효한 경로를 입력해 주세요.</p>}
        {importFeedback}{errorBlock}
      </>}
      {planStep === 2 && <>
        <h3 className={s.sectionTitle}>③ 출발시각 · 비행조건</h3><p className="rb-plan-hint">브리핑에 사용할 비행 조건을 정해주세요.</p>
        <div className={s.performance}>
          <Field label={`출발일 (${tz})`}><DatePicker className={s.picker} value={etdWall} formatDate={d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`} onSelectDate={date => date && setEtdWall(date.getFullYear(), date.getMonth(), date.getDate(), etdWall.getHours(), etdWall.getMinutes())} /></Field>
          <Field label={`출발시간 (${tz})`}><TimePicker key={etd} className={s.picker} freeform hourCycle="h23" increment={5} dateAnchor={etdWall} defaultSelectedTime={etdWall} defaultValue={`${String(etdWall.getHours()).padStart(2, '0')}:${String(etdWall.getMinutes()).padStart(2, '0')}`} onTimeChange={(_, data) => data.selectedTime && setEtdWall(etdWall.getFullYear(), etdWall.getMonth(), etdWall.getDate(), data.selectedTime.getHours(), data.selectedTime.getMinutes())} /></Field>
          <Field label="순항고도 (ft)"><Input className={s.ctrl} type="number" min="500" max="60000" step="500" value={altitudeDraftFt} onChange={(_, d) => setAltitudeDraft(d.value)} /></Field>
          <Field label="순항속도 (TAS, kt)"><SpinButton className={s.ctrl} value={Number(tasKt) || 0} min={60} max={600} step={5} onChange={(_, d) => { const v = d.value ?? Number(d.displayValue); if (Number.isFinite(v)) setTasKt(v) }} /></Field>
        </div>
        <p className="rb-plan-hint">예상 도착시각 {etaDisplay || '계산 중'}</p>
        {!altitudeValid && <p role="alert" className="rb-plan-hint">순항고도는 500~60,000 ft로 입력하세요.</p>}
        {etaBeforeEtd && <div role="alert" className="rb-plan-hint">도착예정시각은 출발시각보다 늦어야 합니다. <Button appearance="subtle" type="button" onClick={() => clearEtaOverride()}>도착시각 자동 계산</Button></div>}
        {briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}
      </>}
      {pendingContextChange && <div className="rb-route-edit-confirm" role="alert"><span>적용된 경로를 지우고 {pendingContextChange.label}을 바꿀까요?</span><div><Button size="small" appearance="primary" type="button" onClick={confirmContextChange}>계속</Button><Button size="small" type="button" onClick={() => setPendingContextChange(null)}>취소</Button></div></div>}
    </form>
  )
  const planFooter = <div className="route-check-actions is-step">
    <span className="rb-plan-loading-status" role="status" aria-live="polite">{briefingLoading ? '브리핑을 준비하고 있습니다. 잠시만 기다려 주세요.' : ''}</span>
    {planStep > 0 ? <button type="button" className="route-check-secondary-button" onClick={() => { setMapInteractionMode(null); setPlanStep(planStep - 1); setReturnStep(null) }}>이전</button> : <button type="button" className="route-check-secondary-button" onClick={armOrReset} disabled={routeLoading}>{resetArmed ? '초기화 확인' : '초기화'}</button>}
    {planStep < 2 || returnStep !== null ? <button type="button" className="route-check-search-button" onClick={planNext} disabled={planStep === 0 ? (!depChosen || !arrChosen || !!pendingContextChange) : planStep === 1 ? !routeValid : (!altitudeValid || !timeValid)}>{returnStep !== null ? '수정 완료' : '다음'}</button> : <button type="button" className="route-check-search-button" onClick={() => handleGenerateBriefing({ cruiseAltitudeFt: altitudeValue })} disabled={!routeValid || !altitudeValid || !timeValid || briefingLoading}>{briefingLoading ? '브리핑 생성 중...' : '브리핑 보기'}</button>}
  </div>

  // Centered peek summary shown when the sheet is collapsed (map revealed).
  const depLabel = routeForm.departureAirport === FIR_IN_AIRPORT
    ? 'FIR진입'
    : routeForm.departureAirport || '출발'
  const arrLabel = routeForm.arrivalAirport === FIR_EXIT_AIRPORT
    ? 'FIR이탈'
    : routeForm.arrivalAirport || '도착'
  let peekDistance = null
  if (routeResult) {
    if (routeResult.flightRule === 'VFR' && vfrWaypoints.length >= 2) {
      peekDistance = `${calcVfrDistance(vfrWaypoints).toFixed(1)} NM`
    } else if (routeResult.flightRule === 'IFR') {
      peekDistance = `${Number(derived.plannedDistanceNm).toFixed(1)} NM`
    }
  }
  const peekSummary = (
    <span className="rb-peek-route">
      <span>{depLabel}</span>
      <span className="rb-peek-arrow" aria-hidden="true">→</span>
      <span>{arrLabel}</span>
      <span className="route-check-status rb-peek-rule">{routeForm.flightRule}</span>
      {peekDistance && <span className="rb-peek-dist">{peekDistance}</span>}
    </span>
  )

  return (
    <>
      {importDialog}
      {hoveredWpInfo && (
        <button
          className="vfr-wp-delete"
          aria-label="경유점 삭제"
          style={{ left: hoveredWpInfo.x + 8, top: hoveredWpInfo.y - 16 }}
          onClick={() => setHoveredWpInfo(null)}
          onMouseEnter={() => clearTimeout(hideTimerRef?.current)}
          onMouseLeave={() => setHoveredWpInfo(null)}
        >X</button>
      )}
      {isMobile ? (
        <MobileSheet
          open
          eyebrow="Flight Plan"
          title={'비행 계획'}
          onClose={() => { setDetentTouched(true); setSheetDetent('peek') }}
          detent={sheetDetent}
          onDetentChange={(d) => { setDetentTouched(true); setSheetDetent(d) }}
          headerExtra={planSummary}
          peekContent={peekSummary}
          footer={planFooter}
        >
          {planBody}
        </MobileSheet>
      ) : (
        <section className="route-check-panel" aria-label={'경로 확인 패널'}>
          <div className="route-check-header">
            <div>
              <h2 className="route-check-title">{'비행 계획'}</h2>
            </div>
            <div className="route-check-header-actions">
              <Badge appearance="tint" color="informative">{routeForm.flightRule}</Badge>
              {routeMenu}
            </div>
          </div>
          {planSummary}
          <div className="route-check-desktop-body">{planBody}</div>
          <footer className="route-check-desktop-footer">{planFooter}</footer>
        </section>
      )}
    </>
  )
}
