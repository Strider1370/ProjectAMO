import { Fragment, useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { KNOWN_AIRPORTS } from './lib/procedureData.js'
import { loadOverseasAirports } from './lib/routePlanner.js'
import { calcVfrDistance } from './lib/routePreview.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  ROUTE_SEQUENCE_COLORS,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  getVfrAirportAltitudeFt,
  getCurrentRouteLineString,
} from './lib/routeBriefingModel.js'
import { Button, Field, Dropdown, Combobox, Option, Input, SpinButton, TabList, Tab, Badge, MessageBar, MessageBarBody, DatePicker, TimePicker, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, Divider, Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, makeStyles, tokens } from '../../shared/ui/fluent.js'
import { listSavedRoutes, saveRoute, deleteSavedRoute } from './lib/routeStore.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import RouteImportChooser from './RouteImportChooser.jsx'
import { aviationLabel } from '../map/layerActions.js'
import { Folder, Trash2, GripVertical, Undo2, X, RotateCcw } from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import AirportPickerField from '../../shared/ui/AirportPickerField.jsx'
import PickerField from '../../shared/ui/PickerField.jsx'
import RouteAlternativesStep from './RouteAlternativesStep.jsx'
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
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalS },
  etdQuick: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS },
  detailToggleRow: { display: 'flex', justifyContent: 'flex-end' },
  etdRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM },
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

// FLIP: 리스트 자식들의 이전 위치를 기억했다가 순서가 바뀌면 부드럽게 미끄러뜨림.
// data-flip-key(안정적 uid)로 같은 줄을 추적 — 없으면 React가 remount해 애니메이션이 안 됨.
function useFlipRows(ref, dep) {
  const prevTop = useRef(new Map())
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 모션 민감 사용자: 슬라이드 애니메이션 생략(위치만 기록).
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    for (const child of el.children) {
      const key = child.dataset.flipKey
      if (!key) continue
      const top = child.getBoundingClientRect().top
      const old = prevTop.current.get(key)
      // 현재 끌고 있는 줄은 커서를 따라가므로 FLIP 미적용(이중 움직임 방지).
      if (!reduce && old !== undefined && Math.abs(old - top) > 0.5 && !child.classList.contains('is-dragging')) {
        child.style.transition = 'none'
        child.style.transform = `translateY(${old - top}px)`
        requestAnimationFrame(() => {
          child.style.transition = 'transform 180ms ease'
          child.style.transform = ''
        })
      }
      prevTop.current.set(key, top)
    }
  }, [ref, dep])
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

// 검색-추가: airport·navaid·waypoint 후보를 좌표와 함께 인덱싱 → Combobox로 골라
// 경로 중간(가장 가까운 구간)에 삽입. 좌표: airports는 평면 lon/lat, navpoint는 coordinates.{lon,lat}.
function VfrFixSearch({ airports, navpointsById, onAdd }) {
  const [query, setQuery] = useState('')
  const candidates = useMemo(() => {
    const list = []
    for (const a of airports) {
      if (Number.isFinite(a.lon) && Number.isFinite(a.lat)) {
        list.push({ key: `ap:${a.icao}`, id: a.icao, kind: 'airport', typeLabel: '공항', lon: a.lon, lat: a.lat })
      }
    }
    for (const p of Object.values(navpointsById ?? {})) {
      const lon = p?.coordinates?.lon, lat = p?.coordinates?.lat
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        // navaid는 종류(VORTAC 등), 일반 지점은 '지점'.
        const isNavaid = p.kind === 'navaid'
        list.push({ key: `np:${p.id}`, id: p.id, kind: isNavaid ? 'navaid' : 'waypoint', typeLabel: isNavaid ? (p.type || 'NAVAID') : '지점', lon, lat })
      }
    }
    return list
  }, [airports, navpointsById])
  const byKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates])
  const q = query.trim().toUpperCase()
  const matches = (q ? candidates.filter((c) => c.id.toUpperCase().includes(q)) : candidates).slice(0, 20)
  const badgeColor = { airport: 'brand', navaid: 'success', waypoint: 'informative' }
  return (
    <Combobox
      className="vfr-fix-search-input"
      aria-label="경유점 추가 검색 (공항·VOR·지점)"
      placeholder="공항·VOR·지점 검색…"
      freeform
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onOptionSelect={(_, d) => {
        const cand = byKey.get(d.optionValue)
        if (cand) { onAdd(cand); setQuery('') }
      }}
    >
      {matches.map((c) => (
        <Option key={c.key} value={c.key} text={`${c.id} ${c.typeLabel}`}>
          <span className="vfr-fix-opt">
            <span className="vfr-fix-opt-id">{c.id}</span>
            <Badge appearance="tint" color={badgeColor[c.kind]} size="small">{c.typeLabel}</Badge>
          </span>
        </Option>
      ))}
    </Combobox>
  )
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
  const {
    routeForm,
    routeResult,
    routeError,
    routeLoading,
    cruiseAltitudeFt,
    verticalProfile,
    verticalProfileLoading,
    verticalProfileError,
    verticalProfileStale,
    editingVfrAltitudeIndex,
    vfrWaypoints,
    vfrLegs = [],
    importCandidates,
    importWarning,
    importError,
    navpointsById,
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
    routeCandidates,
    selectedCandidateId,
    routeExposure,
    altitudeComparison,
    altitudeComparisonLoading,
    altitudeComparisonError,
    verticalProfileWindowOpen,
    altitudeDraftFt,
    workflowStep,
    workflowAvailability,
    briefingLoading,
    briefingError,
  } = state
  const { hideTimerRef } = refs
  const { isFirInMode, isFirExitMode, selectedIap, visibleSidOptions, canUndoVfr } = derived
  const {
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
    setAlternateAirport,
    setEtd,
    setTasKt,
    setEta,
    selectRouteCandidate,
    continueToAltitudeComparison,
    setAltitudeDraft,
    startAltitudeComparison,
    selectCruiseAltitude,
    continueToBriefing,
    goToWorkflowStep,
    goBackWorkflow,
    handleGenerateBriefing,
  } = actions

  const isIfr = routeForm.flightRule === 'IFR'
  // S8: IFR은 지도 볼 일 없는 순수 입력 폼이라 시트를 기본 full로 — VFR ①은 지도에서
  // 경유점을 찍어야 하니 half 유지. 사용자가 손수 드래그(detentTouched)했으면 존중하고
  // 자동 전환을 멈춘다(스텝/규칙 전환마다 되돌리면 성가심).
  useEffect(() => {
    if (detentTouched) return
    const wantsFull = isIfr || workflowStep !== 'settings'
    setSheetDetent(wantsFull ? 'full' : 'half')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIfr, workflowStep, detentTouched])
  // 출발·도착이 모두 있어야 검색 가능(빈 입력으로 검색→서버 오류를 사전 차단).
  const canSearch = !!routeForm.departureAirport && !!routeForm.arrivalAirport
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
  const dragFromRef = useRef(null)
  const vfrListRef = useRef(null)
  useFlipRows(vfrListRef, vfrWaypoints)
  // 경로 저장/불러오기 (localStorage). 저장은 입력값만; 로드는 재검색으로 복원.
  const [menuOpen, setMenuOpen] = useState(false)
  const [savedRoutes, setSavedRoutes] = useState([])
  const refreshSaved = async () => setSavedRoutes(await listSavedRoutes())
  async function handleSaveCurrentRoute() {
    const def = `${routeForm.departureAirport || '?'} → ${routeForm.arrivalAirport || '?'}`
    const name = window.prompt('경로 이름', def)
    if (name == null) return
    // #13 서버측 재브리핑용 경로 기하 저장(IFR은 프론트 플래너 산출물이라 서버 재구성 불가). saveRoute는 입력값만이나 기하는 예외.
    const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
    // 경로/브리핑 통일 Phase 1.1: IFR은 절차 증강 전 스켈레톤(route-preview-line)도 저장 → 로드 시 재검색 없이 조립·절차 재도출.
    // VFR은 routeGeometry가 곧 스켈레톤이라 중복 저장 안 함(0.1 실측 결정). 스켈레톤 없으면 저장 안 함(구버전 폴백은 로드 측).
    const enrouteGeometry = routeForm.flightRule === 'IFR'
      ? routeResult?.previewGeojson?.features?.find((f) => f.properties.role === 'route-preview-line')?.geometry ?? null
      : null
    await saveRoute(name.trim() || def, {
      routeForm, vfrWaypoints, cruiseAltitudeFt, tasKt, alternateAirport, etd, routeGeometry,
      ...(enrouteGeometry ? { enrouteGeometry } : {}),
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
        accept=".geojson,.json,.gpx,.kml"
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
              <span className="rb-import-dropzone-text">{'GeoJSON · GPX · KML 파일을 여기에 드래그하세요'}</span>
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
      {importWarning && <MessageBar intent="warning"><MessageBarBody>{importWarning}</MessageBarBody></MessageBar>}
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
  const setEtdFromNow = (mins) => setEtd(new Date(Date.now() + mins * 60000).toISOString())
  // ETD(ISO/UTC) ↔ tz 벽시계 변환 — DatePicker/TimePicker는 Date의 로컬 필드를 쓰므로 tz 보정.
  const tzOffsetMs = tz === 'KST' ? 9 * 3600 * 1000 : 0
  const etdBaseMs = Number.isFinite(Date.parse(etd)) ? Date.parse(etd) : Date.now()
  const w0 = new Date(etdBaseMs + tzOffsetMs)
  const etdWall = new Date(w0.getUTCFullYear(), w0.getUTCMonth(), w0.getUTCDate(), w0.getUTCHours(), w0.getUTCMinutes())
  const setEtdWall = (y, mo, d, h, mi) => setEtd(new Date(Date.UTC(y, mo, d, h, mi) - tzOffsetMs).toISOString())
  // ETD·TAS·ETA 입력. 고도는 고도 비교 단계에서만 선택한다.
  const perfFields = (
    <>
      <Field label={`ETD (${tz})`}>
        <div className={s.etdRow}>
          <DatePicker className={s.picker} value={etdWall}
            formatDate={(d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`}
            onSelectDate={(date) => date && setEtdWall(date.getFullYear(), date.getMonth(), date.getDate(), etdWall.getHours(), etdWall.getMinutes())} />
          <TimePicker key={etd} className={s.picker} freeform hourCycle="h23" increment={5} dateAnchor={etdWall} defaultSelectedTime={etdWall}
            defaultValue={`${String(etdWall.getHours()).padStart(2, '0')}:${String(etdWall.getMinutes()).padStart(2, '0')}`}
            onTimeChange={(_, data) => data.selectedTime && setEtdWall(etdWall.getFullYear(), etdWall.getMonth(), etdWall.getDate(), data.selectedTime.getHours(), data.selectedTime.getMinutes())} />
        </div>
      </Field>
      <Field label="순항속도 (TAS, kt)">
        <SpinButton className={s.ctrl} value={Number(tasKt) || 0} min={60} max={600} step={5}
          onChange={(_, d) => { const v = d.value ?? Number(d.displayValue); if (Number.isFinite(v)) setTasKt(v) }} />
      </Field>
      <Field label="예상 ETA (UTC)">
        <Input className={s.ctrl} value={eta ?? ''} placeholder="경로 검색 후 TAS 기준으로 계산" onChange={(_, d) => setEta(d.value || null)} />
      </Field>
      <div className={s.etdQuick}>
        {[['지금', 0], ['+30분', 30], ['+1시간', 60], ['+2시간', 120]].map(([lbl, m]) => (
          <Button key={lbl} size="small" appearance="secondary" onClick={() => setEtdFromNow(m)}>{lbl}</Button>
        ))}
      </div>
    </>
  )
  // 모바일 ③단계에서 사용(입력 + 요약)
  const perfTimeBlock = (<>{perfFields}{summaryStrip}</>)

  function swapAirports() {
    const dep = routeForm.departureAirport
    const arr = routeForm.arrivalAirport
    handleDepartureAirportChange(arr)
    handleArrivalAirportChange(dep)
  }

  // Shared between the desktop panel and the mobile sheet.
  const errorBlock = routeError && (
    <MessageBar intent="error"><MessageBarBody>{routeError}</MessageBarBody></MessageBar>
  )

  // VFR 결과 조각 — 레이아웃별로 다르게 배치(데스크톱은 경유점 구성과 총거리 요약을 분리).
  const isVfrResult = routeResult?.flightRule === 'VFR' && vfrWaypoints.length >= 2
  const vfrTotalDist = isVfrResult && (
    <div className="route-check-total-dist">
      {'총 거리'}: <strong>{calcVfrDistance(vfrWaypoints).toFixed(1)} NM</strong>
    </div>
  )
  // 지도 레이어 토글칩 — VFR 경로 구성 시 웨이포인트/항행시설/항공로를 지도에서 보며 작업.
  const aviationLayerChips = [
    { key: 'waypoint', label: aviationLabel('waypoint'), on: !!aviationVisibility.waypoint, onToggle: () => onToggleAviation?.('waypoint') },
    { key: 'navaid', label: aviationLabel('navaid'), on: !!aviationVisibility.navaid, onToggle: () => onToggleAviation?.('navaid') },
    {
      key: 'airways', label: '항공로',
      on: !!(aviationVisibility['ats-route'] && aviationVisibility['rnav-route']),
      onToggle: () => {
        const target = !(aviationVisibility['ats-route'] && aviationVisibility['rnav-route'])
        if (!!aviationVisibility['ats-route'] !== target) onToggleAviation?.('ats-route')
        if (!!aviationVisibility['rnav-route'] !== target) onToggleAviation?.('rnav-route')
      },
    },
  ]
  const vfrRouteBuilder = isVfrResult && (
    <>
      {onToggleAviation && (
        <div className="vfr-layer-toggles" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-m)', flexWrap: 'wrap', marginBottom: 'var(--space-s)' }}>
          <span className="vfr-fix-search-title">{'지도 레이어'}</span>
          <LayerToggleChips items={aviationLayerChips} ariaLabel="항공 레이어" />
        </div>
      )}
      <div className="vfr-fix-search">
        <div className="vfr-fix-search-head">
          <span className="vfr-fix-search-title">{'＋ 경유점 추가'}</span>
          <Badge appearance="tint" color="brand" size="small">{'검색·추가'}</Badge>
        </div>
        <VfrFixSearch airports={airports} navpointsById={navpointsById} onAdd={addVfrWaypointByFix} />
      </div>
      <div className="vfr-waypoint-list-head">
        <span className="vfr-waypoint-list-title">{'경유점 · 계획고도'}</span>
        <Button appearance="subtle" size="small" type="button" icon={<Undo2 size={14} />} disabled={!canUndoVfr} onClick={undoVfrWaypoints}>{'되돌리기'}</Button>
      </div>
      <div className="vfr-waypoint-altitude-list" ref={vfrListRef}>
        {vfrWaypoints.map((wp, index) => {
          const fallbackAltitudeFt = Number(cruiseAltitudeFt)
          const displayAltitudeFt = wp.fixed
            ? getVfrAirportAltitudeFt(airports, wp)
            : Number.isFinite(Number(wp.altitudeFt))
            ? Number(wp.altitudeFt)
            : fallbackAltitudeFt
          const isEditing = !wp.fixed && editingVfrAltitudeIndex === index
          const endpointLabel = wp.fixed ? (index === 0 ? '출발' : '도착') : null
          return (
            <Fragment key={wp.uid ?? wp.id}>
            <div
              className={`vfr-waypoint-altitude-row${wp.fixed ? ' is-fixed' : ''}${dragIndex === index ? ' is-dragging' : ''}${dragOverIndex === index && dragIndex !== index ? ' is-drop-target' : ''}`}
              data-flip-key={wp.uid ?? wp.id}
              draggable={!wp.fixed}
              onDragStart={!wp.fixed ? () => { dragFromRef.current = index; beginVfrReorder(); setDragIndex(index) } : undefined}
              onDragOver={(e) => {
                if (dragFromRef.current === null) return
                e.preventDefault()
                // 끄는 동안엔 '들어갈 자리'만 강조(실제 교체는 drop에서). 양끝/자기 자신 제외.
                const target = wp.fixed ? null : index
                if (target !== dragOverIndex) setDragOverIndex(target)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragFromRef.current
                if (from !== null && !wp.fixed && from !== index) reorderVfrWaypoint(from, index)
                dragFromRef.current = null; setDragIndex(null); setDragOverIndex(null)
              }}
              onDragEnd={() => { dragFromRef.current = null; setDragIndex(null); setDragOverIndex(null) }}
            >
              {wp.fixed
                ? <span className="vfr-waypoint-handle is-placeholder" aria-hidden="true" />
                : <button
                    type="button"
                    className="vfr-waypoint-handle"
                    aria-label={`${wp.id} 순서 변경 (방향키 위/아래)`}
                    title="끌거나 방향키(↑/↓)로 순서 변경"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); beginVfrReorder(); reorderVfrWaypoint(index, index - 1) }
                      else if (e.key === 'ArrowDown') { e.preventDefault(); beginVfrReorder(); reorderVfrWaypoint(index, index + 1) }
                    }}
                  ><GripVertical size={16} /></button>}
              <span className="vfr-waypoint-altitude-id">
                {wp.id}{endpointLabel && <span className="vfr-waypoint-endpoint">{endpointLabel}</span>}
              </span>
              {isEditing ? (
                <input
                  className="vfr-waypoint-altitude-input"
                  type="number"
                  min="100"
                  step="100"
                  autoFocus
                  value={Number.isFinite(displayAltitudeFt) ? Math.round(displayAltitudeFt) : ''}
                  onChange={(e) => updateVfrWaypointAltitude(index, e.target.value)}
                  onBlur={() => setEditingVfrAltitudeIndex(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditingVfrAltitudeIndex(null)
                  }}
                />
              ) : wp.fixed ? (
                <span className="vfr-waypoint-altitude-pill is-fixed" title="공항 고도">
                  {`${Math.round(displayAltitudeFt).toLocaleString()} ft`}
                </span>
              ) : (
                <button
                  className="vfr-waypoint-altitude-pill"
                  type="button"
                  onClick={() => setEditingVfrAltitudeIndex(index)}
                >
                  {Number.isFinite(displayAltitudeFt)
                    ? `${Math.round(displayAltitudeFt).toLocaleString()} ft`
                    : '고도 입력'}
                </button>
              )}
              {!wp.fixed ? (
                <button
                  type="button"
                  className="vfr-waypoint-delete-btn"
                  aria-label="경유점 삭제"
                  onClick={() => deleteVfrWaypoint(index)}
                ><Trash2 size={16} /></button>
              ) : <span className="vfr-waypoint-delete-placeholder" aria-hidden="true" />}
            </div>
            {index < vfrWaypoints.length - 1 && vfrLegs[index] && (
              <div className="vfr-leg-info">
                <span className="vfr-leg-terrain">{'최고지형 '}
                  <strong>{Number.isFinite(vfrLegs[index].maxTerrainFt) ? `${vfrLegs[index].maxTerrainFt.toLocaleString()} ft` : '—'}</strong>
                </span>
                {vfrLegs[index].targetEditable && vfrLegs[index].recommendedFt != null && (
                  vfrLegs[index].compliant ? (
                    <span className="vfr-leg-hint is-static">{'VFR 고도 준수 ✓'}</span>
                  ) : (
                    <button
                      type="button"
                      className="vfr-leg-hint"
                      onClick={() => updateVfrWaypointAltitude(vfrLegs[index].targetIndex, vfrLegs[index].recommendedFt)}
                      title={`${vfrLegs[index].eastbound ? '동' : '서'}쪽 방향 · 눌러서 이 고도로 맞추기`}
                    >
                      {`VFR 권장 ${vfrLegs[index].recommendedFt.toLocaleString()} ft로 맞추기`}
                    </button>
                  )
                )}
              </div>
            )}
            </Fragment>
          )
        })}
      </div>
      <div className="vfr-altitude-apply">
        <button type="button" onClick={applyCruiseAltitudeToVfrWaypoints}>
          {'순항고도 전체 적용'}
        </button>
      </div>
    </>
  )

  const routePreview = routeResult && (
    <div className="route-check-result">
      {routeResult.flightRule === 'IFR' && (() => {
        const displayTokens = buildIfrSequenceTokens(routeResult, { selectedSid, selectedStar, selectedIap })
        const { totalDistanceNm } = buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })
        const sequenceVisible = showDetailRoute

        return (
          <>
            <div className="route-check-total-dist">
              <div className="route-check-total-dist-head">
                <span>{'총 거리'} <strong>{totalDistanceNm} NM</strong></span>
                <Button appearance="subtle" size="small" type="button" aria-expanded={showDetailRoute}
                  onClick={() => setShowDetailRoute((v) => !v)}>
                  {'세부경로'} {showDetailRoute ? '▴' : '▾'}
                </Button>
              </div>
            </div>
            {sequenceVisible && (
              <div className="route-check-sequence">
                {displayTokens.map((token, index) => (
                  <span key={`${token.kind}-${token.text}-${index}`}>
                    {index > 0 && <span className="route-check-sequence-sep">{' -> '}</span>}
                    <span
                      className={`route-check-sequence-token is-${token.kind}`}
                      style={{ color: ROUTE_SEQUENCE_COLORS[token.kind] }}
                    >
                      {token.text}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </>
        )
      })()}
      {isVfrResult && <>{vfrTotalDist}{vfrRouteBuilder}</>}
    </div>
  )

  // 연직단면도: 버튼 하나로 — 생성되면 같은 버튼이 '열기'로 전환(경로 변경 시 다시 '생성').
  const profileReady = verticalProfile && !verticalProfileStale
  const crossSectionBlock = routeResult && (
    <div className="route-check-result">
      <Button appearance="secondary" type="button" className={s.full} disabled={verticalProfileLoading}
        onClick={profileReady ? () => setVerticalProfileWindowOpen(true) : handleVerticalProfileRequest}>
        {verticalProfileLoading ? '생성 중...' : profileReady ? '연직단면도 열기' : '연직단면도 생성'}
      </Button>
      {verticalProfileStale && verticalProfile && (
        <MessageBar intent="warning"><MessageBarBody>경로가 변경되었습니다. 연직단면도를 다시 생성해주세요.</MessageBarBody></MessageBar>
      )}
      {verticalProfileError && <MessageBar intent="error"><MessageBarBody>{verticalProfileError}</MessageBarBody></MessageBar>}
    </div>
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

  // 데스크톱 섹션 번호 — VFR 경유점(③)이 떠 있을 때만 브리핑/결과가 ④⑤로 밀림(없으면 ③④, 번호 빈칸 방지).
  const vfrExpanded = !isIfr && isVfrResult
  const condNo = vfrExpanded ? '④' : '③'
  const resultNo = vfrExpanded ? '⑤' : '④'
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

  // 경로 결과 요약 — IFR: 거리/세부경로/ETD→ETA, VFR: 총거리 + ETD→ETA(요약 strip).
  // VFR은 공항 입력 전에도 껍데기로 노출(거리 0 NM, ETA —). IFR은 호출부에서 routeResult로 게이트.
  const resultSummarySection = (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>{`${resultNo} 경로 결과`}</h3>
      {isIfr ? (
        <>
          <div className={s.summary}>
            <span style={{ color: tokens.colorNeutralForeground3 }}>거리 {Math.round(derived.plannedDistanceNm)} NM</span>
            <Button appearance="subtle" size="small" type="button" aria-expanded={showDetailRoute} onClick={() => setShowDetailRoute((v) => !v)}>
              {'세부경로'} {showDetailRoute ? '▴' : '▾'}
            </Button>
          </div>
          <div className={s.detailToggleRow}>
            <span style={{ fontWeight: tokens.fontWeightSemibold }}>ETD {formatBriefingTime(etd, tz)} → ETA {etaIso ? formatBriefingTime(etaIso, tz) : '—'}</span>
          </div>
          {showDetailRoute && (
            <div className="route-check-sequence">
              {buildIfrSequenceTokens(routeResult, { selectedSid, selectedStar, selectedIap }).map((token, index) => (
                <span key={`${token.kind}-${token.text}-${index}`}>
                  {index > 0 && <span className="route-check-sequence-sep">{' -> '}</span>}
                  <span className={`route-check-sequence-token is-${token.kind}`} style={{ color: ROUTE_SEQUENCE_COLORS[token.kind] }}>{token.text}</span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        summaryStrip
      )}
    </div>
  )

  const desktopBody = (
    <>
      <div className="rb-workflow-tabs" role="tablist" aria-label="비행 브리핑 단계">
        {[
          ['settings', '비행 설정'], ['compare', '경로 비교'], ['altitude', '고도 비교'], ['briefing', '브리핑'],
        ].map(([step, label]) => <button key={step} type="button" role="tab" aria-selected={workflowStep === step} disabled={!workflowAvailability[step]} className={workflowStep === step ? 'is-active' : (!workflowAvailability[step] ? 'is-disabled' : '')} onClick={() => goToWorkflowStep(step)}>{label}</button>)}
      </div>
      {workflowStep === 'settings' && <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (isIfr) handleRouteSearch(e) }}>
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
            {renderDesktopAirportSelect('출발 공항', routeForm.departureAirport, handleDepartureAirportChange, FIR_IN_AIRPORT, 'FIR 진입', routeForm.arrivalAirport, 'left')}
            <Button className={s.swapBtn} appearance="subtle" type="button" aria-label="출발 도착 교환"
              disabled={routeForm.departureAirport === FIR_IN_AIRPORT || routeForm.arrivalAirport === FIR_EXIT_AIRPORT}
              onClick={swapAirports}>⇄</Button>
            {renderDesktopAirportSelect('도착 공항', routeForm.arrivalAirport, handleArrivalAirportChange, FIR_EXIT_AIRPORT, 'FIR 이탈', routeForm.departureAirport, 'right')}
          </div>
          {isIfr && (
            <>
              <Field label="교체 공항">
                <FDropdown className={s.ctrl} value={alternateAirport} onChange={setAlternateAirport} placeholder="-- 없음 --"
                  options={[{ value: '', label: '-- 없음 --' }, ...allAirportOptions.filter((airport) => airport.value !== routeForm.departureAirport && airport.value !== routeForm.arrivalAirport).map((airport) => ({ value: airport.value, label: airport.value }))]} />
              </Field>
              {perfFields}
            </>
          )}
          {isIfr && (
            <Field label="경로 유형">
              <TabList selectedValue={routeForm.routeType} onTabSelect={(_, d) => updateRouteField('routeType', d.value)}>
                <Tab value="ALL">전체</Tab><Tab value="RNAV">RNAV</Tab><Tab value="ATS">ATS</Tab>
              </TabList>
            </Field>
          )}
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
        </div>

        {/* VFR은 출발·도착 선택 시 경로 자동 생성(검색 버튼 없음). 초기화는 ② 경로 헤더로 이동(IFR·VFR 공통). */}
        {isIfr && (
          <div className={s.actions}>
            <Button appearance="primary" type="submit" disabled={routeLoading || !canSearch}
              title={canSearch ? undefined : '출발·도착 공항을 먼저 선택하세요'}>{routeLoading ? '검색 중...' : '검색'}</Button>
            <Button appearance="secondary" type="button" onClick={handleAutoRecommend} disabled={routeLoading}>{'자동검색'}</Button>
          </div>
        )}

        {importFeedback}
        {errorBlock}

        {/* IFR: 브리핑 조건 → (검색 후)결과. VFR: (검색 후)경유점 → 브리핑 조건 → 결과(껍데기라도 항상). */}
        {isIfr ? (
          <>{routeResult && resultSummarySection}</>
        ) : (
          <>{vfrWaypointSection}{briefingCondSection}{resultSummarySection}</>
        )}

        {briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}
        {crossSectionBlock}
      </form>}
      {workflowStep === 'compare' && (
        <div className={s.form}>
          <RouteAlternativesStep candidates={routeCandidates} selectedCandidateId={selectedCandidateId} routeExposure={routeExposure} metVisibility={metVisibility} onToggleMet={onToggleMet} onSelect={selectRouteCandidate} onBack={goBackWorkflow} onContinue={continueToAltitudeComparison} />
        </div>
      )}
      {workflowStep === 'altitude' && (
        <div className={s.form}>
          <Field label="계획 순항고도 (ft)"><Input className={s.ctrl} type="number" min="500" max="60000" step="500" value={altitudeDraftFt} placeholder="예: 9,000" onChange={(_, d) => setAltitudeDraft(d.value)} /></Field>
          <Button appearance="primary" type="button" className={s.full} onClick={startAltitudeComparison} disabled={altitudeComparisonLoading}>고도 비교</Button>
          {(altitudeComparison || altitudeComparisonLoading || altitudeComparisonError) ? <AltitudeWeatherComparison comparison={altitudeComparison} loading={altitudeComparisonLoading} error={altitudeComparisonError} selectedAltitudeFt={Number(cruiseAltitudeFt)} onSelect={selectCruiseAltitude} onBack={goBackWorkflow} onContinue={continueToBriefing} profileLoading={verticalProfileLoading} profileError={verticalProfileError} profileOpen={verticalProfileWindowOpen} onShowProfile={() => setVerticalProfileWindowOpen(true)} /> : <div className="rb-step-actions"><button type="button" className="route-check-secondary-button" onClick={goBackWorkflow}>이전 단계</button><p className="rb-alternatives-status">계획 순항고도를 입력한 뒤 고도 비교를 선택하세요.</p></div>}
        </div>
      )}
      {workflowStep === 'briefing' && (
        <div className={s.form}>
          <div className={s.summary}><span>{`${routeForm.departureAirport} → ${routeForm.arrivalAirport}`}</span><span>{`${Math.round(Number(cruiseAltitudeFt) || 0)} ft · ETD ${formatBriefingTime(etd, tz)} · ETA ${eta ? formatBriefingTime(eta, tz) : '—'}`}</span></div>
          {briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}
          <div className="rb-step-actions"><Button appearance="secondary" type="button" onClick={goBackWorkflow}>이전 단계</Button><Button appearance="primary" type="button" onClick={handleGenerateBriefing} disabled={briefingLoading}>{briefingLoading ? '브리핑 생성 중...' : '브리핑 생성'}</Button></div>
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
      {[['settings', '비행 설정'], ['compare', '경로 비교'], ['altitude', '고도 비교'], ['briefing', '브리핑']].map(([step, label]) => (
        <button key={step} type="button" className={`rb-step${workflowStep === step ? ' is-active' : ''}${!workflowAvailability[step] ? ' is-disabled' : ''}`} disabled={!workflowAvailability[step]} onClick={() => goToWorkflowStep(step)}>{label}</button>
      ))}
    </div>
  )

  const mobileBody = (
    <form id="rb-mobile-form" className="route-check-form rb-mobile" onSubmit={(e) => { e.preventDefault(); if (isIfr) handleRouteSearch(e) }}>
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
            <AirportPickerField label="출발" value={routeForm.departureAirport} options={allAirportOptions} firOption={{ value: FIR_IN_AIRPORT, label: 'FIR 진입' }} onChange={handleDepartureAirportChange} disabledValue={routeForm.arrivalAirport} />
            <div className="rb-swap"><button type="button" className="rb-swap-btn" onClick={swapAirports} disabled={firOnEitherSide} aria-label="출발 도착 교환">⇅</button></div>
            <AirportPickerField label="도착" value={routeForm.arrivalAirport} options={allAirportOptions} firOption={{ value: FIR_EXIT_AIRPORT, label: 'FIR 이탈' }} onChange={handleArrivalAirportChange} disabledValue={routeForm.departureAirport} />
          </div>
          {(step1MoreOpen || (depChosen && arrChosen)) ? (
            <>
              <label className="rb-altn">{'교체 공항'}
                <select value={alternateAirport} onChange={(e) => setAlternateAirport(e.target.value)}>
                  <option value="">{'-- 없음 --'}</option>
                  {allAirportOptions.filter((airport) => airport.value !== routeForm.departureAirport && airport.value !== routeForm.arrivalAirport).map((airport) => <option key={airport.value} value={airport.value}>{airport.value}</option>)}
                </select>
              </label>
              {isIfr && perfFields}
              {isIfr && (
                <div className="route-type-segmented">
                  {[['ALL', '전체'], ['RNAV', 'RNAV'], ['ATS', 'ATS']].map(([val, lbl]) => (
                    <button key={val} type="button" className={`route-type-seg${routeForm.routeType === val ? ' is-active' : ''}`} onClick={() => updateRouteField('routeType', val)}>{lbl}</button>
                  ))}
                </div>
              )}
              {isIfr && (depChosen || arrChosen) && (
                <button type="button" className="route-check-secondary-button rb-auto-search" onClick={handleAutoRecommend} disabled={routeLoading}>
                  {routeLoading ? '검색 중...' : '자동검색 (SID·STAR 추천)'}
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
                {!isIfr && <div className="rb-vfr-note">VFR — 지도에서 경유점을 추가하세요</div>}
              </div>
            </>
          ) : (
            <button type="button" className="rb-detail-toggle" aria-expanded={false} onClick={() => setStep1MoreOpen(true)}>
              {'교체공항·경로유형·절차 더보기'} <span className="rb-detail-caret">{'▾'}</span>
            </button>
          )}
          {importFeedback}
          {errorBlock}
          {routePreview}
        </>
      )}
      {workflowStep === 'compare' && (
        <RouteAlternativesStep candidates={routeCandidates} selectedCandidateId={selectedCandidateId} routeExposure={routeExposure} metVisibility={metVisibility} onToggleMet={onToggleMet} onSelect={selectRouteCandidate} onBack={goBackWorkflow} onContinue={continueToAltitudeComparison} />
      )}
      {workflowStep === 'altitude' && (
        <>
          <Field label="계획 순항고도 (ft)"><Input className={s.ctrl} type="number" min="500" max="60000" step="500" value={altitudeDraftFt} placeholder="예: 9,000" onChange={(_, d) => setAltitudeDraft(d.value)} /></Field>
          <Button appearance="primary" type="button" className={s.full} onClick={startAltitudeComparison} disabled={altitudeComparisonLoading}>고도 비교</Button>
          {summaryStrip}
          {(altitudeComparison || altitudeComparisonLoading || altitudeComparisonError) ? <AltitudeWeatherComparison comparison={altitudeComparison} loading={altitudeComparisonLoading} error={altitudeComparisonError} selectedAltitudeFt={Number(cruiseAltitudeFt)} onSelect={selectCruiseAltitude} onBack={goBackWorkflow} onContinue={continueToBriefing} profileLoading={verticalProfileLoading} profileError={verticalProfileError} profileOpen={verticalProfileWindowOpen} onShowProfile={() => setVerticalProfileWindowOpen(true)} /> : <div className="rb-step-actions"><button type="button" className="route-check-secondary-button" onClick={goBackWorkflow}>이전 단계</button><p className="rb-alternatives-status">계획 순항고도를 입력한 뒤 고도 비교를 선택하세요.</p></div>}
        </>
      )}
      {workflowStep === 'briefing' && <>{summaryStrip}{briefingError && <MessageBar intent="error"><MessageBarBody>{briefingError}</MessageBarBody></MessageBar>}</>}
    </form>
  )

  // Action bar lives in the sheet footer (outside the scroll area) so it stays
  // flush to the bottom task bar regardless of form height.
  // Progressive footer: before a route exists, the primary action is 검색
  // (+자동검색/초기화). Once a route is found, the footer's primary action
  // advances to 브리핑 생성 (the final deliverable) with 초기화 alongside.
  const mobileFooter = workflowStep === 'settings' ? (
    <div className="route-check-actions is-step">
      {(depChosen || arrChosen || routeResult) && (
        <button type="button" className="route-check-secondary-button" onClick={armOrReset} disabled={routeLoading}>{resetArmed ? '초기화 확인' : '초기화'}</button>
      )}
      {isIfr ? (
        <button type="button" className="route-check-search-button" onClick={() => handleRouteSearch({ preventDefault() {} })} disabled={routeLoading || !canSearch}>{routeLoading ? '검색 중...' : '경로 검색'}</button>
      ) : null}
    </div>
  ) : workflowStep === 'briefing' ? (
    <div className="route-check-actions is-step">
      <button type="button" className="route-check-search-button" onClick={handleGenerateBriefing} disabled={!routeResult || briefingLoading}>{briefingLoading ? '브리핑 생성 중...' : '브리핑 생성'}</button>
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
          onClick={() => deleteVfrWaypoint(hoveredWpInfo.idx)}
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
          footer={mobileFooter}
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
          {desktopBody}
        </section>
      )}
    </>
  )
}
