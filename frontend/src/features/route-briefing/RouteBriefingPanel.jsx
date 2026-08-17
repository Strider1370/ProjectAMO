import { useState, useRef, useMemo, useEffect } from 'react'
import { KNOWN_AIRPORTS } from './lib/procedureData.js'

// 단계 순서. 앞으로 갔는지 뒤로 왔는지를 이 순서로 판정한다.
const WORKFLOW_STEP_ORDER = ['settings', 'compare', 'altitude', 'briefing']
import { loadOverseasAirports } from './lib/routePlanner.js'
import { calcVfrDistance } from './lib/routePreview.js'
import { windLabel, phenomenonLabelKo } from './lib/routeComparison.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  buildIfrDistanceBreakdown,
} from './lib/routeBriefingModel.js'
import { Button, Field, Dropdown, Combobox, Option, Input, SpinButton, TabList, Tab, Badge, MessageBar, MessageBarBody, DatePicker, TimePicker, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, Divider, Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, makeStyles, tokens } from '../../shared/ui/fluent.js'
import { listSavedRoutes, saveRoute, deleteSavedRoute } from './lib/routeStore.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import RouteImportChooser from './RouteImportChooser.jsx'
import { buildRouteAviationLayerChips } from '../map/layerActions.js'
import { Folder, Undo2, X, RotateCcw } from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import AirportPickerField from '../../shared/ui/AirportPickerField.jsx'
import PickerField from '../../shared/ui/PickerField.jsx'
import RouteAlternativesStep from './RouteAlternativesStep.jsx'
import RouteTokenField from './RouteTokenField.jsx'
import AltitudeWeatherComparison from './AltitudeWeatherComparison.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { computeEtaIso } from './lib/etaCalc.js'
import { formatBriefingTime } from './lib/briefingTime.js'
import './RouteBriefing.css'

const AIRPORT_KO = {
  RKSI: '인천', RKSS: '김포', RKPC: '제주', RKPK: '김해',
  RKJB: '무안', RKNY: '양양', RKJY: '여수', RKPU: '울산', RKTH: '포항경주',
  RKTU: '청주', RKNW: '원주', RKPS: '사천', RKJJ: '광주', RKJK: '군산',
}
// ponytail: static for domestic only; overseas loaded dynamically via useEffect in component.
const DOMESTIC_AIRPORT_OPTIONS = KNOWN_AIRPORTS.map((icao) => ({ value: icao, ko: AIRPORT_KO[icao] ?? icao, region: '대한민국' }))
const NONE_OPTION = { value: '', label: '-- 없음 --' }

// 데스크톱 폼 레이아웃 — 커스텀 .css 대신 Fluent griffel + 토큰
const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalXXL}` },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    letterSpacing: '0.04em',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM, alignItems: 'end' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },
  field: { minWidth: 0 },
  fieldFull: { gridColumn: '1 / -1', minWidth: 0 },
  // ⇄ 교환 버튼은 가운데 전용 칸(auto). 출발/도착은 좌우 대칭. (1fr 1fr로 키우면 ⇄ 자리가 없어 겹침)
  routeRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: tokens.spacingHorizontalS, alignItems: 'end' },
  swapBtn: { minWidth: '32px', marginBottom: tokens.spacingVerticalXS },
  actions: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: tokens.spacingHorizontalS },
  draftActions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  draftApply: { flexGrow: 1 },
  toolSection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  toolLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  performance: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, alignItems: 'end' },
  detailToggleRow: { display: 'flex', justifyContent: 'flex-end' },
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
  ctrl: { width: '100%', minWidth: 0 },
  full: { width: '100%' },
  routeText: { width: '100%', minHeight: '132px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
})

// 목록 선택 Dropdown(타이핑 없음) — value↔표시텍스트↔selectedOptions 처리 한 곳에
function FDropdown({ value, onChange, options, placeholder = '선택', disabled, className }) {
  const v = String(value ?? '')
  const sel = options.find((o) => String(o.value) === v)
  return (
    <Dropdown
      className={className}
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

export default function RouteBriefingPanel({ state, refs = {}, derived, actions, airports = [], aviationVisibility = {}, onToggleAviation, metVisibility = {}, onToggleMet }) {
  const isMobile = useIsMobile()
  const s = useStyles()
  const { tz } = useTimeZone()
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
  const [sheetDetent, setSheetDetent] = useState('half')
  const [detentTouched, setDetentTouched] = useState(false)
  const [showDetailRoute, setShowDetailRoute] = useState(false)
  // S7: 모바일 ① 스텝은 출발/도착까지만 먼저 보여주고, 교체공항·경로유형·SID/STAR/RWY는
  // 접어둔다(P3 점진 노출) — 사용자가 펼치거나, 출발+도착을 다 고르면(다음에 필요해질
  // 확률이 높아) 자동으로 펼친다.
  const [step1MoreOpen, setStep1MoreOpen] = useState(false)
  const prevWorkflowStepRef = useRef('settings')
  const stepDirectionRef = useRef('forward')
  const hasWorkflowStepTransitionRef = useRef(false)
  const [errorsOpen, setErrorsOpen] = useState(false)
  // 단계가 앞으로 갔는지 뒤로 왔는지. 렌더 중에 정해야 한다 — 효과로 미루면 이미 새 화면이
  // 그려진 뒤라 한 박자 늦은 방향으로 움직인다. 같은 단계로 다시 그려질 때는 값을 유지하므로
  // 이중 렌더에도 안전하다. 데스크톱·모바일이 같은 값을 쓴다.
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
    routeTokens,
    routeTokenErrors,
    classifyRouteTexts,
    hoveredWpInfo,
    starOptions,
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
    importRouteFromFile,
    applyImportedPath,
    cancelImportChoice,
    setHoveredWpInfo,
    setCruiseAltitudeFt,
    setAlternateAirport,
    setEtd,
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

  if (prevWorkflowStepRef.current !== workflowStep) {
    stepDirectionRef.current =
      WORKFLOW_STEP_ORDER.indexOf(workflowStep) < WORKFLOW_STEP_ORDER.indexOf(prevWorkflowStepRef.current) ? 'back' : 'forward'
    prevWorkflowStepRef.current = workflowStep
    hasWorkflowStepTransitionRef.current = true
  }
  const stepDirection = stepDirectionRef.current
  const hasWorkflowStepTransition = hasWorkflowStepTransitionRef.current
  const stepMotion = hasWorkflowStepTransition ? stepDirection : undefined

  const isIfr = routeForm.flightRule === 'IFR'
  // VFR 왕복(장주·훈련·유람)은 뜬 곳으로 돌아온다 — 반대편에 같은 공항을 고를 수
  // 있어야 한다. IFR은 같은 공항으로 비행계획을 내는 경우가 사실상 없어 그대로 잠근다.
  const departurePickerLock = isIfr ? routeForm.arrivalAirport : null
  const arrivalPickerLock = isIfr ? routeForm.departureAirport : null
  const etaDisplay = eta ? formatBriefingTime(eta, tz, { withDate: true }).replace('-', '/').replace('Z', ' UTC') : ''
  const appliedBase = routeDesigns.find((design) => design.id === 'base')
  // S8: 첫 경로 입력은 지도 맥락을 남기기 위해 항상 half로 시작한다. 사용자가 손수 드래그(detentTouched)했으면 존중하고
  // 자동 전환을 멈춘다(스텝/규칙 전환마다 되돌리면 성가심).
  useEffect(() => {
    if (detentTouched) return
    const wantsFull = workflowStep !== 'settings'
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

  // 데스크톱과 모바일이 같은 입력칸을 쓴다. 구조가 다른 두 화면에 같은 것을 두 번 짜면
  // 한쪽만 고쳐지는 일이 생긴다.
  // 두 화면(desktopBody·mobileBody)보다 위에 있어야 한다 — 아래에 두면 그쪽이 정의되기 전에
  // 참조해서 화면이 통째로 죽는다. 시험은 통과하고 빌드도 되지만 실행이 안 된다.
  const routeTokenField = (
    <>
      <RouteTokenField
        label={isIfr ? '경로' : '경로 (공항 · FIX · DCT · 좌표)'}
        placeholder={isIfr ? '예: RKSI BINIL A582 ANDOL RKPC' : '예: RKSI DCT ANDOL DCT RKPC'}
        tokens={routeTokens}
        onChange={setRouteTokenTexts}
        disabled={routeLoading}
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
        <span className="rtf-status-right">{routeSummaryText}</span>
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
  const revealAlternativeOnMap = (action) => (...args) => {
    if (isMobile) {
      setDetentTouched(true)
      setSheetDetent('peek')
    }
    return action(...args)
  }
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
  const refreshSaved = async () => setSavedRoutes(await listSavedRoutes())
  async function handleSaveCurrentRoute() {
    const def = `${routeForm.departureAirport || '?'} → ${routeForm.arrivalAirport || '?'}`
    const name = window.prompt('경로 이름', def)
    if (name == null) return
    const base = routeDesigns.find((design) => design.id === 'base')
    await saveRoute(name.trim() || def, {
      version: 3,
      cruiseAltitudeFt, tasKt, etd,
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
  }
  const routeMenu = (
    <Menu open={menuOpen} onOpenChange={(_, d) => { setMenuOpen(d.open); if (d.open) refreshSaved() }}>
      <MenuTrigger disableButtonEnhancement>
        <MenuButton appearance="outline" size="small" icon={<Folder size={16} />}>{'경로'}</MenuButton>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={handleSaveCurrentRoute} disabled={!routeResult}>{'＋ 현재 경로 저장…'}</MenuItem>
          {savedRoutes.length > 0 && <Divider />}
          {savedRoutes.map((r) => (
            <div key={r.id} className="rb-saved-row">
              <span className="rb-saved-name">{r.name}<span className="rb-saved-meta"> · {relativeTime(r.savedAt)}</span></span>
              <button type="button" className="rb-saved-load" onClick={() => { setMenuOpen(false); loadSavedRoute(r) }}>{'로드'}</button>
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

  const etaIso = eta || computeEtaIso(etd, derived.plannedDistanceNm, tasKt)
  const summaryStrip = (
    <div className={s.summary}>
      <span style={{ color: tokens.colorNeutralForeground3 }}>거리 {routeResult ? `${Math.round(derived.plannedDistanceNm)} NM` : '—'}</span>
      <span style={{ fontWeight: tokens.fontWeightSemibold }}>ETD → ETA {formatBriefingTime(etd, tz)} → {routeResult && etaIso ? formatBriefingTime(etaIso, tz) : '—'}</span>
    </div>
  )
  const selectedRouteDesign = routeDesigns.find((design) => design.id === selectedRouteDesignId)
  const selectedAltitudeRow = altitudeComparison?.rows?.find((row) => Number(row.altFt ?? row.altitudeFt) === Number(cruiseAltitudeFt))
  const selectedHazards = selectedAltitudeRow?.hazards ?? []
  const procedureSummary = [selectedSid?.label, selectedStar?.label, selectedIap?.label].filter(Boolean).join(' · ')
  const briefingPreparation = (
    <section className="rb-briefing-preparation" aria-label="브리핑 준비 요약">
      <h3>브리핑 준비</h3>
      <div className="rb-briefing-preparation-grid">
        <div><span>비행</span><strong>{`${routeForm.departureAirport} → ${routeForm.arrivalAirport}`}</strong><small>{`ETD ${formatBriefingTime(etd, tz)} · ETA ${etaIso ? formatBriefingTime(etaIso, tz) : '—'} · TAS ${tasKt} kt`}</small></div>
        <div><span>선택 경로</span><strong>{selectedRouteDesign?.name ?? '기본 경로'}</strong><small>{`${Math.round(derived.plannedDistanceNm)} NM${procedureSummary ? ` · ${procedureSummary}` : ''}`}</small></div>
        <div><span>선택 고도</span><strong>{Number(cruiseAltitudeFt) >= 18000 ? `FL${Math.round(Number(cruiseAltitudeFt) / 100)}` : `${Math.round(Number(cruiseAltitudeFt))} ft`}</strong><small>{selectedAltitudeRow?.wind?.meanComponentKt != null ? `평균 ${windLabel(selectedAltitudeRow.wind.meanComponentKt)}` : '고도 기상 비교 자료 없음'}</small></div>
        <div><span>교체공항</span><strong>{alternateAirport || '선택 안 함'}</strong><small>{selectedHazards.length ? `주의 기상 ${selectedHazards.map((hazard) => phenomenonLabelKo(hazard.label)).join(' · ')}` : '선택 고도에서 추가 위험기상 없음'}</small></div>
      </div>
      {routeResult && isIfr && (
        <div className="route-check-result">
          <div className={s.summary}>
            <span style={{ color: tokens.colorNeutralForeground3 }}>경로 결과 · 거리 {Math.round(derived.plannedDistanceNm)} NM</span>
            <Button appearance="subtle" size="small" type="button" aria-expanded={showDetailRoute} onClick={() => setShowDetailRoute((v) => !v)}>
              {'세부경로'} {showDetailRoute ? '▴' : '▾'}
            </Button>
          </div>
          <div className={s.detailToggleRow}>
            <span style={{ fontWeight: tokens.fontWeightSemibold }}>ETD {formatBriefingTime(etd, tz)} → ETA {etaIso ? formatBriefingTime(etaIso, tz) : '—'}</span>
          </div>
          {/* 적용된 경로를 색깔 글자 줄로 보여주던 자리. 입력칸이 같은 정보를 알약으로
              이미 보여주므로 없앴다 — 같은 것을 두 번 보여줄 이유가 없다(스펙 결정 3). */}
        </div>
      )}
      {routeResult && !isIfr && summaryStrip}
    </section>
  )
  // ETD(ISO/UTC) ↔ tz 벽시계 변환 — DatePicker/TimePicker는 Date의 로컬 필드를 쓰므로 tz 보정.
  const tzOffsetMs = tz === 'KST' ? 9 * 3600 * 1000 : 0
  const etdBaseMs = Number.isFinite(Date.parse(etd)) ? Date.parse(etd) : Date.now()
  const w0 = new Date(etdBaseMs + tzOffsetMs)
  const etdWall = new Date(w0.getUTCFullYear(), w0.getUTCMonth(), w0.getUTCDate(), w0.getUTCHours(), w0.getUTCMinutes())
  const setEtdWall = (y, mo, d, h, mi) => setEtd(new Date(Date.UTC(y, mo, d, h, mi) - tzOffsetMs).toISOString())
  // ETD·TAS·ETA 입력. 고도는 고도 비교 단계에서만 선택한다.
  const perfFields = (
    <div className={s.performance}>
      <Field label={`출발일 (${tz})`}>
        <DatePicker className={s.picker} value={etdWall}
          formatDate={(d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`}
          onSelectDate={(date) => date && setEtdWall(date.getFullYear(), date.getMonth(), date.getDate(), etdWall.getHours(), etdWall.getMinutes())} />
      </Field>
      <Field label={`출발시간 (${tz})`}>
        <TimePicker key={etd} className={s.picker} freeform hourCycle="h23" increment={5} dateAnchor={etdWall} defaultSelectedTime={etdWall}
          defaultValue={`${String(etdWall.getHours()).padStart(2, '0')}:${String(etdWall.getMinutes()).padStart(2, '0')}`}
          onTimeChange={(_, data) => data.selectedTime && setEtdWall(etdWall.getFullYear(), etdWall.getMonth(), etdWall.getDate(), data.selectedTime.getHours(), data.selectedTime.getMinutes())} />
      </Field>
      <Field label="순항속도 (TAS, kt)">
        <SpinButton className={s.ctrl} value={Number(tasKt) || 0} min={60} max={600} step={5}
          onChange={(_, d) => { const v = d.value ?? Number(d.displayValue); if (Number.isFinite(v)) setTasKt(v) }} />
      </Field>
      <Field label={`예상 ETA (${tz})`}>
        <Input className={s.ctrl} value={etaDisplay} placeholder="경로 검색 후 TAS 기준으로 계산" readOnly />
      </Field>
    </div>
  )

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
  const vfrRouteBuilder = isVfrResult && (
    <>
      <p className="rb-vfr-note">지도에서 선을 끌어 지점을 넣으면 경로에 반영됩니다. 그린 선은 확인을 받은 뒤 반영됩니다.</p>
    </>
  )

  // Briefing inputs (교체공항 / ETD / 순항속도) + 브리핑 생성 trigger. Shared
  // between desktop and mobile. 교체공항 options mirror the 출발/도착 airport
  // source (KNOWN_AIRPORTS) plus a 없음 entry.
  // showGenerate: desktop keeps the 브리핑 생성 button inside this section; mobile
  // moves it to the sheet footer (progressive primary action), so pass false there.
  // ── Desktop panel ──
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

  // 데스크톱 섹션 번호 — VFR 경유점(③)이 떠 있을 때만 브리핑 조건이 ④로 밀린다.
  const condNo = '③'
  const briefingCondSection = (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>{`${condNo} 브리핑 조건`}</h3>
      <Field label="교체 공항">
        <FDropdown className={s.ctrl} value={alternateAirport} onChange={setAlternateAirport} placeholder="-- 없음 --"
          options={[{ value: '', label: '-- 없음 --' }, ...KNOWN_AIRPORTS.filter((ap) => ap !== routeForm.departureAirport && ap !== routeForm.arrivalAirport).map((ap) => ({ value: ap, label: ap }))]} />
      </Field>
      {perfFields}
    </div>
  )

  // VFR 전용: ② 경로 다음에 오는 경유점 구성(추가 + 계획고도).
  const vfrWaypointSection = isVfrResult && (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>{'③ 경유점'}</h3>
      <div className="route-check-result">{vfrRouteBuilder}</div>
    </div>
  )

  const desktopBody = (
    <>
      <div className="rb-workflow-tabs" role="tablist" aria-label="비행 브리핑 단계">
        {[
          ['settings', '비행 설정'], ['compare', '경로비교'], ['altitude', '고도 비교'], ['briefing', '브리핑 준비'],
        ].map(([step, label]) => <button key={step} type="button" role="tab" aria-selected={workflowStep === step} disabled={!workflowAvailability[step]} className={workflowStep === step ? 'is-active' : (!workflowAvailability[step] ? 'is-disabled' : '')} onClick={() => goToWorkflowStep(step)}>{label}</button>)}
      </div>
      {/* 각 단계는 이미 자기 요소로 새로 붙는다 — 방향만 넘기면 등장 애니메이션이 돈다.
          감싸는 겹을 더하지 않으므로 폭·스크롤 구조는 그대로다. */}
      {workflowStep === 'settings' && <form className={s.form} data-step-dir={stepMotion} onSubmit={(e) => { e.preventDefault(); if (isIfr) handleRouteSearch(e) }}>
        <div className={s.section}>
          <h3 className={s.sectionTitle}>{'① 비행 규칙'}</h3>
          <TabList selectedValue={routeForm.flightRule} onTabSelect={(_, d) => switchFlightRule(d.value)}>
            <Tab value="IFR">IFR</Tab>
            <Tab value="VFR">VFR</Tab>
          </TabList>
        </div>

        <div className={s.section}>
          <div className={s.sectionHead}>
            <h3 className={s.sectionTitle}>{'② 경로'}</h3>
            <div style={{ display: 'flex', gap: 'var(--space-xs, 6px)' }}>
              {importButton}
              <Button appearance="secondary" size="small" type="button" icon={<RotateCcw size={14} />} onClick={armOrReset} disabled={routeLoading}>{resetArmed ? '초기화 확인' : '초기화'}</Button>
            </div>
          </div>
          <div className={s.routeRow}>
            {renderDesktopAirportSelect('출발 공항', routeForm.departureAirport, handleDepartureAirportChange, FIR_IN_AIRPORT, 'FIR 진입', departurePickerLock, 'left')}
            <Button className={s.swapBtn} appearance="subtle" type="button" aria-label="출발 도착 교환"
              disabled={routeForm.departureAirport === FIR_IN_AIRPORT || routeForm.arrivalAirport === FIR_EXIT_AIRPORT}
              onClick={swapAirports}>⇄</Button>
            {renderDesktopAirportSelect('도착 공항', routeForm.arrivalAirport, handleArrivalAirportChange, FIR_EXIT_AIRPORT, 'FIR 이탈', arrivalPickerLock, 'right')}
          </div>
          {isIfr && (
            <div className={s.grid}>
              <Field className={s.field} label={isFirInMode ? '진입 FIX' : visibleSidOptions.length > 0 ? 'SID' : '진입 FIX'}>{depProcControl}</Field>
              <Field className={s.field} label={isFirExitMode ? '이탈 FIX' : starOptions.length > 0 ? 'STAR' : '이탈 FIX'}>{arrProcControl}</Field>
              {!isFirExitMode && iapCandidates.length > 1 && (
                <Field className={s.field} label="RWY">
                  <FDropdown className={s.ctrl} value={selectedIapKey ?? ''} onChange={handleIapChange}
                    options={iapCandidates.map(({ key, label }) => ({ value: key, label }))} />
                </Field>
              )}
            </div>
          )}
          {/* 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다. 「되돌리기」와 지도 조작 확인은
              적용과 별개 기능이라 그대로 남는다. */}
          <div className={s.fieldFull}>
              {routeTokenField}
              <div className={s.draftActions}>
                <Button appearance="secondary" type="button" icon={<Undo2 size={16} />} onClick={undoBaseRoute} disabled={!canUndoBase}>되돌리기</Button>
              </div>
              {pendingRouteEdit && !pendingRouteEdit.mapCoordinates && <div className="rb-route-edit-confirm" role="status"><span>{pendingRouteEdit.message}</span><div><Button size="small" appearance="primary" type="button" onClick={() => applyRouteDraft(pendingRouteEdit.text)}>적용</Button><Button size="small" appearance="secondary" type="button" onClick={cancelPendingRouteEdit}>취소</Button></div></div>}
          </div>
        </div>

        {/* 자동 생성은 초안을 만든 뒤 곧바로 기본 경로로 적용까지 이어간다(useRouteBriefing의 autoApplyPending). */}
        {isIfr && (
          <div className={s.toolSection}>
            <span className={s.toolLabel}>경로 작성 도구</span>
            <div className={s.actions}>
              <Button appearance="secondary" type="button" onClick={handleAutoRecommend} disabled={routeLoading || !canSearch}
                title={canSearch ? undefined : '출발·도착 공항을 먼저 선택하세요'}>{routeLoading ? '생성 중...' : '자동 생성'}</Button>
              <Button appearance={mapInteractionMode === 'click-add' ? 'primary' : 'secondary'} type="button" onClick={() => setMapInteractionMode(mapInteractionMode === 'click-add' ? null : 'click-add')} disabled={routeLoading || !canSearch}>지도 클릭</Button>
              <Button appearance={mapInteractionMode === 'draw' ? 'primary' : 'secondary'} type="button" onClick={() => setMapInteractionMode(mapInteractionMode === 'draw' ? null : 'draw')} disabled={routeLoading || !canSearch}>그리기</Button>
            </div>
          </div>
        )}
        {onToggleAviation && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-s)', flexWrap: 'wrap', marginBottom: 'var(--space-s)' }}><span>지도 레이어</span><LayerToggleChips items={aviationLayerChips} ariaLabel="경로 입력 지도 레이어" /></div>}
        {pendingContextChange && <div className="rb-route-edit-confirm" role="alert"><span>적용된 기본 경로와 대체 경로를 지우고 {pendingContextChange.label}을(를) 바꿀까요?</span><div><Button size="small" appearance="primary" type="button" onClick={confirmContextChange}>계속</Button><Button size="small" appearance="secondary" type="button" onClick={() => setPendingContextChange(null)}>취소</Button></div></div>}
        {isIfr && <div className={s.section}>{perfFields}</div>}

        {importFeedback}
        {errorBlock}

        {!isIfr && <>{vfrWaypointSection}{briefingCondSection}</>}

        {briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}
      </form>}
      {workflowStep === 'compare' && (
        <div className={s.form} data-step-dir={stepMotion}>
          <RouteAlternativesStep designs={routeDesigns} selectedDesignId={selectedRouteDesignId} routeExposure={routeExposure} etd={etd} tasKt={tasKt} metVisibility={metVisibility} onToggleMet={onToggleMet} aviationVisibility={aviationVisibility} onToggleAviation={onToggleAviation} onSelect={revealAlternativeOnMap(selectRouteDesign)} onDuplicate={revealAlternativeOnMap(duplicateSelectedRouteDesign)} onRemove={removeSelectedRouteDesign} onStartDraft={startAlternativeFrom} onUpdateDraft={updateSelectedDesignDraftText} onPreviewDraft={previewSelectedDesignDraft} onApplyDraft={applySelectedDesignDraft} onUndo={undoSelectedRouteDesign} routeError={routeError} classifyRouteTexts={classifyRouteTexts} onBack={goBackWorkflow} onContinue={continueToAltitudeComparison} hideStepActions />
        </div>
      )}
      {workflowStep === 'altitude' && (
        <div className={s.form} data-step-dir={stepMotion}>
          <Field label="계획 순항고도 (ft)"><Input className={s.ctrl} type="number" min="500" max="60000" step="500" value={altitudeDraftFt} placeholder="예: 9,000" onChange={(_, d) => setAltitudeDraft(d.value)} /></Field>
          <Button appearance="primary" type="button" className={s.full} onClick={startAltitudeComparison} disabled={altitudeComparisonLoading}>고도 비교</Button>
          {(altitudeComparison || altitudeComparisonLoading || altitudeComparisonError) ? <AltitudeWeatherComparison comparison={altitudeComparison} loading={altitudeComparisonLoading} error={altitudeComparisonError} selectedAltitudeFt={Number(cruiseAltitudeFt)} onSelect={selectCruiseAltitude} onBack={goBackWorkflow} onContinue={continueToBriefing} profileLoading={verticalProfileLoading} profileError={verticalProfileError} hideStepActions /> : <p className="rb-alternatives-status">고도 비교는 선택 사항입니다. 순항고도를 입력하면 바로 브리핑 준비로 갈 수 있습니다.</p>}
        </div>
      )}
      {workflowStep === 'briefing' && (
        <div className={s.form} data-step-dir={stepMotion}>
          {briefingPreparation}
          {briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}
        </div>
      )}
    </>
  )

  // ── Mobile sheet: from→to + swap, dependent pickers, progressive disclosure ──
  const depChosen = !!routeForm.departureAirport
  const arrChosen = !!routeForm.arrivalAirport
  const firOnEitherSide = routeForm.departureAirport === FIR_IN_AIRPORT || routeForm.arrivalAirport === FIR_EXIT_AIRPORT

  const stepNav = (
    <div className="rb-steps">
      {[['settings', '비행 설정'], ['compare', '경로비교'], ['altitude', '고도 비교'], ['briefing', '브리핑 준비']].map(([step, label]) => (
        <button key={step} type="button" className={`rb-step${workflowStep === step ? ' is-active' : ''}${!workflowAvailability[step] ? ' is-disabled' : ''}`} disabled={!workflowAvailability[step]} onClick={() => goToWorkflowStep(step)}>{label}</button>
      ))}
    </div>
  )
  // 단계가 앞으로 갔는지 뒤로 왔는지를 화면에 남긴다. key로 다시 붙여 등장 애니메이션을 돌리고,
  // 방향은 data 속성으로 넘긴다. 자식들은 원래도 단계마다 붙었다 떨어지므로 마운트 부담은 그대로다.
  // ponytail: 데스크톱은 단계 표시가 늘 보이고 내용 폭이 넓어 방향 표시가 덜 필요해 넘겼다.
  //           필요해지면 desktopBody의 네 조건부를 한 겹으로 감싸고 같은 key를 준다.
  const mobileBody = (
    <form
      id="rb-mobile-form"
      key={workflowStep}
      data-step-dir={stepMotion}
      className="route-check-form rb-mobile"
      onSubmit={(e) => { e.preventDefault(); if (isIfr) handleRouteSearch(e) }}
    >
      {workflowStep === 'settings' && (
        <>
          <div className="route-type-segmented">
            <button type="button" className={`route-type-seg${isIfr ? ' is-active' : ''}`} onClick={() => switchFlightRule('IFR')}>IFR</button>
            <button type="button" className={`route-type-seg${!isIfr ? ' is-active' : ''}`} onClick={() => switchFlightRule('VFR')}>VFR</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-xs, 6px)' }}>
            {importButton}
          </div>
          <div className="rb-route">
            <AirportPickerField label="출발" value={routeForm.departureAirport} options={allAirportOptions} firOption={{ value: FIR_IN_AIRPORT, label: 'FIR 진입' }} onChange={handleDepartureAirportChange} disabledValue={departurePickerLock} />
            <div className="rb-swap"><button type="button" className="rb-swap-btn" onClick={swapAirports} disabled={firOnEitherSide} aria-label="출발 도착 교환">⇅</button></div>
            <AirportPickerField label="도착" value={routeForm.arrivalAirport} options={allAirportOptions} firOption={{ value: FIR_EXIT_AIRPORT, label: 'FIR 이탈' }} onChange={handleArrivalAirportChange} disabledValue={arrivalPickerLock} align="right" />
          </div>
          {(!isIfr || step1MoreOpen || (depChosen && arrChosen)) ? (
            <>
              {isIfr && perfFields}
              {isIfr && (depChosen || arrChosen) && (
                <button type="button" className="route-check-search-button rb-auto-search" onClick={handleAutoRecommend} disabled={routeLoading}>
                  {routeLoading ? '생성 중...' : '자동 생성'}
                </button>
              )}
              <div className="rb-procedures">
                {isIfr && depChosen && (isFirInMode
                  ? <PickerField label="진입 FIX" value={routeForm.entryFix} options={[NONE_OPTION, ...firInOptions.map((o) => ({ value: o.value, label: o.label }))]} onChange={handleEntryFixChange} />
                  : <PickerField label="SID" value={selectedSid?.id ?? ''} options={[NONE_OPTION, ...visibleSidOptions.map((p) => ({ value: p.id, label: p.label }))]} onChange={(id) => handleSidChange(id ? (visibleSidOptions.find((p) => p.id === id) ?? null) : null)} />)}
                {isIfr && arrChosen && (isFirExitMode
                  ? <PickerField label="이탈 FIX" value={routeForm.exitFix} options={[NONE_OPTION, ...firExitOptions.map((o) => ({ value: o.value, label: o.label }))]} onChange={handleExitFixChange} />
                  : <PickerField label="STAR" value={selectedStar?.id ?? ''} options={[NONE_OPTION, ...starOptions.map((p) => ({ value: p.id, label: p.label }))]} onChange={(id) => handleStarChange(id ? (starOptions.find((p) => p.id === id) ?? null) : null)} />)}
                {isIfr && arrChosen && !isFirExitMode && iapCandidates.length > 1 && (
                  <PickerField label="RWY" value={selectedIapKey ?? ''} options={iapCandidates.map(({ key, label }) => ({ value: key, label }))} onChange={handleIapChange} />
                )}
                {!isIfr && <div className="rb-vfr-note">VFR 초안 경로는 공항·FIX·DCT·좌표 전체 문자열로 편집합니다.</div>}
              </div>
              {routeTokenField}
              {pendingRouteEdit && !pendingRouteEdit.mapCoordinates && <div className="rb-route-edit-confirm" role="status"><span>{pendingRouteEdit.message}</span><div><button type="button" onClick={() => applyRouteDraft(pendingRouteEdit.text)}>적용</button><button type="button" onClick={cancelPendingRouteEdit}>취소</button></div></div>}
              {onToggleAviation && <div className="vfr-layer-toggles"><span className="vfr-fix-search-title">지도 레이어</span><LayerToggleChips items={aviationLayerChips} ariaLabel="경로 입력 지도 레이어" /></div>}
            </>
          ) : (
            <button type="button" className="rb-detail-toggle" aria-expanded={false} onClick={() => setStep1MoreOpen(true)}>
              {'절차·시간 입력 더보기'} <span className="rb-detail-caret">{'▾'}</span>
            </button>
          )}
          {importFeedback}
          {errorBlock}
        </>
      )}
      {workflowStep === 'compare' && (
        <RouteAlternativesStep designs={routeDesigns} selectedDesignId={selectedRouteDesignId} routeExposure={routeExposure} etd={etd} tasKt={tasKt} metVisibility={metVisibility} onToggleMet={onToggleMet} aviationVisibility={aviationVisibility} onToggleAviation={onToggleAviation} onSelect={revealAlternativeOnMap(selectRouteDesign)} onDuplicate={revealAlternativeOnMap(duplicateSelectedRouteDesign)} onRemove={removeSelectedRouteDesign} onStartDraft={startAlternativeFrom} onUpdateDraft={updateSelectedDesignDraftText} onPreviewDraft={previewSelectedDesignDraft} onApplyDraft={applySelectedDesignDraft} onUndo={undoSelectedRouteDesign} routeError={routeError} classifyRouteTexts={classifyRouteTexts} onBack={goBackWorkflow} onContinue={continueToAltitudeComparison} hideStepActions />
      )}
      {workflowStep === 'altitude' && (
        <>
          <Field label="계획 순항고도 (ft)"><Input className={s.ctrl} type="number" min="500" max="60000" step="500" value={altitudeDraftFt} placeholder="예: 9,000" onChange={(_, d) => setAltitudeDraft(d.value)} /></Field>
          <Button appearance="primary" type="button" className={s.full} aria-label="고도 비교 실행" onClick={() => startAltitudeComparison({ openWindow: false })} disabled={altitudeComparisonLoading}>고도 비교</Button>
          {summaryStrip}
          {verticalProfile && <Button appearance="secondary" type="button" className="vertical-profile-open-button" onClick={() => setVerticalProfileWindowOpen(true)}>연직단면도 보기</Button>}
          {(altitudeComparison || altitudeComparisonLoading || altitudeComparisonError) ? <AltitudeWeatherComparison comparison={altitudeComparison} loading={altitudeComparisonLoading} error={altitudeComparisonError} selectedAltitudeFt={Number(cruiseAltitudeFt)} onSelect={selectCruiseAltitude} onBack={goBackWorkflow} onContinue={continueToBriefing} profileLoading={verticalProfileLoading} profileError={verticalProfileError} hideStepActions /> : <p className="rb-alternatives-status">고도 비교는 선택 사항입니다. 순항고도를 입력하면 바로 브리핑 준비로 갈 수 있습니다.</p>}
        </>
      )}
      {workflowStep === 'briefing' && <>{briefingPreparation}{briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}</>}
    </form>
  )

  // 경로는 토큰이 확정될 때마다 만들어진다(적용 버튼은 없다). Keep one shared
  // workflow footer for desktop and mobile, enabling each next step only when ready.
  const workflowFooter = workflowStep === 'settings' ? (
    <div className="route-check-actions is-step">
      {(depChosen || arrChosen || routeResult) && (
        <button type="button" className="route-check-secondary-button" onClick={armOrReset} disabled={routeLoading}>{resetArmed ? '초기화 확인' : '초기화'}</button>
      )}
      <button
        type="button"
        className="route-check-search-button"
        onClick={() => goToWorkflowStep('compare')}
        disabled={!routeResult}
      >
        경로비교로
      </button>
    </div>
  ) : workflowStep === 'briefing' ? (
    <div className="route-check-actions is-step">
      <button type="button" className="route-check-secondary-button" onClick={goBackWorkflow}>이전 단계</button>
      <button type="button" className="route-check-search-button" onClick={handleGenerateBriefing} disabled={!routeResult || briefingLoading}>{briefingLoading ? '브리핑 생성 중...' : '브리핑 생성'}</button>
    </div>
  ) : workflowStep === 'compare' ? (
    <div className="route-check-actions is-step">
      <button type="button" className="route-check-secondary-button" onClick={goBackWorkflow}>이전 단계</button>
      <button type="button" className="route-check-search-button" onClick={continueToAltitudeComparison} disabled={!selectedRouteDesignId}>{selectedRouteDesign?.kind === 'alternative' ? '이 우회안으로 고도 비교' : '기본 경로로 고도 비교'}</button>
    </div>
  ) : workflowStep === 'altitude' ? (
    <div className="route-check-actions is-step">
      <button type="button" className="route-check-secondary-button" onClick={goBackWorkflow}>이전 단계</button>
      <button type="button" className="route-check-search-button" onClick={() => continueToBriefing({ fitRoute: true })} disabled={!workflowAvailability.briefing}>브리핑 준비로</button>
    </div>
  ) : null

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
      peekDistance = `${buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap }).totalDistanceNm} NM`
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
          title={'경로 확인'}
          onClose={() => { setDetentTouched(true); setSheetDetent('peek') }}
          detent={sheetDetent}
          onDetentChange={(d) => { setDetentTouched(true); setSheetDetent(d) }}
          headerExtra={stepNav}
          peekContent={peekSummary}
          footer={workflowFooter}
        >
          {mobileBody}
        </MobileSheet>
      ) : (
        <section className="route-check-panel" aria-label={'경로 확인 패널'}>
          <div className="route-check-header">
            <div>
              <div className="route-check-eyebrow">Flight Plan</div>
              <h2 className="route-check-title">{'경로 확인'}</h2>
            </div>
            <div className="route-check-header-actions">
              <Badge appearance="tint" color="informative">{routeForm.flightRule}</Badge>
              {routeMenu}
            </div>
          </div>
          <div className="route-check-desktop-body">{desktopBody}</div>
          <footer className="route-check-desktop-footer">{workflowFooter}</footer>
        </section>
      )}
    </>
  )
}
