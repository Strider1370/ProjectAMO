import { Fragment, useEffect, useRef, useState } from 'react'
import { Layers, CloudLightning, Waves, Snowflake, Wind, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Badge, Button, Card, TabList, Tab,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
  MessageBar, MessageBarBody, MessageBarTitle,
  Title3, Subtitle2, Body1, Caption1,
} from '../../shared/ui/fluent.js'
import VerticalProfileViewer from './VerticalProfileViewer.jsx'
import BriefingDock from './map-briefing/BriefingDock.jsx'
import './map-briefing/MapBriefing.css'
import BriefingBanner from './BriefingBanner.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import DataProvenance from '../../shared/ui/DataProvenance.jsx'
import ForecasterInquiry from './ForecasterInquiry.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import ReportTimeZone, { useReportTimeZone } from '../../shared/timezone/ReportTimeZone.jsx'
import useDemoMode from '../../shared/demoMode/useDemoMode.js'
import { formatBriefingTime } from './lib/briefingTime.js'
import { hazardMapLayers } from './lib/hazardLayers.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import { metLabel } from '../map/layerActions.js'
import { phenomenonKo } from '../../shared/weather/phenomenonKo.js'
import { buildAmosConsoleModel } from '../../shared/weather/amosViewModel.js'
import { buildMetarTacSegments, buildMetarViewModel } from '../airport-panel/lib/metarViewModel.js'
import EnhancedTafTab from '../airport-panel/tabs/TafTab.jsx'
import { useCrossSectionLayers } from './crossSectionLayers.jsx'
import { buildRawWindsTable } from './lib/rawWindsModel.js'
import { catColorOf, catDisplay, worstAirport, pctOf, tafBarSegments } from './lib/briefingViewModel.js'
import { deriveNotamTime, formatAltitude, formatValidPeriod, NOTAM_CATEGORIES } from '../notam/lib/notamViewModel.js'
import NotamCell from '../notam/NotamCell.jsx'
import RouteWeatherLegTable from './RouteWeatherLegTable.jsx'
import './BriefingView.css'

const NOTAM_CAT_LABEL = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))

// 위험현상 code → 아이콘 (substring 매칭, 코드 변종에 견고).
function hazardIcon(code) {
  const c = String(code || '').toUpperCase()
  if (c.includes('ICE')) return Snowflake
  if (c.includes('TURB')) return Waves
  if (c.includes('TS')) return CloudLightning
  if (c.includes('WS') || c.includes('SHEAR') || c.includes('WIND')) return Wind
  return AlertTriangle
}

const ROLE_KO = { departure: '출발', arrival: '도착' }
const SOURCE_KO = { TYPHOON: '태풍' }
// 고도는 FL로(SIGMET·NAVLOG와 같은 표기). 내부 코드 SEV_TURB는 표준 약어 SEV TURB로 보인다.
const flText = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`
const codeText = (code) => String(code).replace(/_/g, ' ')
// 일기도 바로가기: 지도에 실제 자료 레이어를 켠다. SIGWX HIGH는 발표 시각이 정해져 있어 시각을 고르지 않는다.
const CHART_TILES = [
  { layer: 'surfaceChart', title: '지상일기도', text: 'KIM 전구모델 · 등압선, 고·저기압, 강수, 지상풍', timed: true },
  { layer: 'tropopause', title: '권계면·제트', text: 'KIM 전구모델 · 권계면 고도, 제트 축과 최대풍', timed: true },
  { layer: 'sigwxHigh', title: 'SIGWX HIGH', text: 'WAFS 발표 · FL250–FL630 중요기상', timed: false },
]
// 지도에서 보기 칩: 위험에 걸린 레이어 + 늘 참고하는 권계면·제트, SIGWX HIGH.
const REFERENCE_LAYERS = ['tropopause', 'sigwxHigh']
// 출발·도착이 같은 공항이면 역할이 여럿이다 — '출발/도착' 한 배지로 낸다.
const roleLabel = (r) => (Array.isArray(r) ? r : [r]).map((one) => ROLE_KO[one] ?? '교체').join('/')

// 카테고리 배지 — 라벨은 3단계 fold, 색은 심각도(level). MVFR="VFR"(green), IFR=amber, LIFR=red.
function CatBadge({ category }) {
  const c = catDisplay(category)
  return <Badge appearance="filled" style={{ backgroundColor: catColorOf(category), color: '#fff' }}>{c}</Badge>
}

export default function BriefingView({ frozenNotice = null, organizationContext = null, organizationBundle = null, organizationError = null, onOrganizationReload = null, briefing, verticalProfile = null, crossSection = null, advisories = [], onClose, onOpenProfile, onFocus, metVisibility, onToggleMetLayer, onEnterMapMode, onHighlightLeg, onSelectForecastHour, crossSectionHourLoading = false, nwpTimeRefreshError = null, onRetryNwpTimeRefresh = null, nwpTimeSelection = null, onSetWaypointNwpOffset = null, routeSnapshot = null, onSaveBriefing = null, externalHighlight = null, onMapView = null, onOpenAirport = null, onSetMapTime = null }) {
  const isMobile = useIsMobile()
  const { tz } = useTimeZone()
  const reportKey = `${briefing?.meta?.departureAirport}-${briefing?.meta?.arrivalAirport}`
  const [metarTz, setMetarTz] = useReportTimeZone(reportKey)
  const [tafTz, setTafTz] = useReportTimeZone(reportKey)
  const { nowMs } = useDemoMode()
  const containerRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  const [detent, setDetent] = useState('half')
  const [xsectionFull, setXsectionFull] = useState(false)
  const [chartTimes, setChartTimes] = useState({}) // 일기도 칸별 ETD/ETA 선택
  const [ribbonHover, setRibbonHover] = useState(null) // 위험 막대에서 가리킨 칸 — 단면도 같은 구간 강조
  const [hiddenRibbonRows, setHiddenRibbonRows] = useState([])
  const [expandedRoles, setExpandedRoles] = useState({})
  const [notamGroupOpen, setNotamGroupOpen] = useState({}) // 공항별 NOTAM "더 보기" 펼침(role별)
  const [collapsed, setCollapsed] = useState(false) // 패널 접기 — 지도를 보려고 오른쪽으로 슬라이드아웃(닫기와 달리 브리핑 유지)
  const [expanded, setExpanded] = useState(false)
  const [pinnedLeg, setPinnedLeg] = useState(null) // NAVLOG에서 클릭해 고정한 구간
  const [activeLeg, setActiveLeg] = useState(null) // 지금 가리킨 구간(호버 또는 고정) — 단면도 강조용
  const headerRef = useRef(null)
  const [headerHidden, setHeaderHidden] = useState(false) // 헤더 스크롤아웃 시에만 sticky nav의 닫기 노출(중복 버튼 방지)
  const toggleRole = (role) => setExpandedRoles((m) => ({ ...m, [role]: !m[role] }))
  // 인라인 단면도 레이어 토글 — 해당 현상이 있으면 그 레이어를 기본 ON.
  // 현상 출처: SIGMET/AIRMET 위험기상 + enroute 모델(KTG 난류·KIM 착빙) 둘 다.
  // 공유 차트의 기상 레이어는 자료 유무와 무관하게 기본 선택을 유지한다.
  const [xLayers, toggleXLayer] = useCrossSectionLayers({
    temp: true, wind: true, cloud: false, advisories: true,
    icing: true, tropopause: true, isotachs: true,
    moisture: true,
    turbulence: true,
  })
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus

  useEffect(() => { if (activeId) onFocusRef.current?.(activeId) }, [activeId])

  // 브리핑이 닫히면 지도에 남은 구간 강조도 같이 지운다.
  const onHighlightLegRef = useRef(onHighlightLeg)
  onHighlightLegRef.current = onHighlightLeg
  useEffect(() => () => onHighlightLegRef.current?.(null), [])
  // A stretch chosen outside the table (기상이 브리핑 카드) pins like a NAVLOG row.
  useEffect(() => {
    if (!externalHighlight) return
    const leg = { ...externalHighlight, key: `external:${externalHighlight.startNm}-${externalHighlight.endNm}`, pinned: true }
    setPinnedLeg(leg)
    setActiveLeg(leg)
    onHighlightLegRef.current?.(leg)
  }, [externalHighlight])

  const hasEnroute = Boolean(briefing?.sections?.enroute)
  const hasNotam = (briefing?.routeNotams ?? []).length > 0
  // 섹션 번호는 쓰지 않는다 — NOTAM 유무에 따라 목적지 번호가 바뀌던 문제가 없어진다.
  const steps = briefing
    ? [
        { id: 'adverse', label: '위험' },
        { id: 'current', label: '현재 실황' },
        ...(onToggleMetLayer ? [{ id: 'charts', label: '일기도' }] : []),
        ...(hasEnroute ? [{ id: 'enroute', label: '노선' }] : []),
        ...(hasNotam ? [{ id: 'notam', label: 'NOTAM' }] : []),
        { id: 'destination', label: '목적지' },
      ]
    : []

  useEffect(() => {
    const scope = containerRef.current
    if (!scope) return undefined
    const els = [...scope.querySelectorAll('[data-bvid]')]
    if (els.length === 0) return undefined
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActiveId(visible[0].target.dataset.bvid)
    }, { root: isMobile ? null : scope, rootMargin: isMobile ? '-8% 0px -60% 0px' : '-12% 0px -68% 0px', threshold: 0 })
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [briefing, isMobile])

  useEffect(() => {
    const header = headerRef.current
    const scope = containerRef.current
    if (!header || !scope) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderHidden(!entry.isIntersecting),
      { root: isMobile ? null : scope, threshold: 0 },
    )
    observer.observe(header)
    return () => observer.disconnect()
  }, [briefing, isMobile])

  if (!briefing) return null
  const { meta, summary, sections } = briefing
  const organizationStatuses = { ...organizationBundle?.componentStatus, ...organizationBundle?.componentStatus?.models }
  delete organizationStatuses.models
  const organizationWeatherIncomplete = Boolean(organizationContext && (
    !organizationBundle ||
    Object.values(organizationStatuses).some((value) => (value?.status ?? value) !== 'available') ||
    (!organizationStatuses.kim && !organizationStatuses.nwp) ||
    (sections.current?.airports ?? []).some((airport) => !airport.metar)
  ))
  const weatherIncomplete = organizationWeatherIncomplete || Boolean(frozenNotice)
  const hasAirmet = (sections.adverse?.hazards ?? []).some((h) => h.source === 'AIRMET')
  const mapLayerIds = [...new Set([...hazardMapLayers(briefing).map(id => ['temp', 'cloud', 'icing'].includes(id) ? 'cloudIcing' : id), ...(hasAirmet ? ['airmet'] : []), ...REFERENCE_LAYERS])]
  const rawWinds = buildRawWindsTable(crossSection, verticalProfile) // 상층바람 원자료 표
  const airports = sections.current.airports
  const metarTacSegments = (a) => {
    const raw = a.metar?.header?.raw_text ?? a.raw
    if (!raw || !a.metar) return [{ text: raw || 'METAR 원문 없음' }]
    const vm = buildMetarViewModel({ metar: a.metar, amosData: null, icao: a.icao, airportMeta: {} })
    return buildMetarTacSegments(raw, vm)
  }

  const etdEtaLine = (meta.etd || meta.eta)
    ? `ETD ${formatBriefingTime(meta.etd, tz)} → ETA ${formatBriefingTime(meta.eta, tz, { withDate: (meta.eta || '').slice(0, 10) !== (meta.etd || '').slice(0, 10) })}`
    : null

  const jumpTo = (id) => {
    setActiveId(id)
    containerRef.current?.querySelector(`[data-bvid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const nav = (
    <div className="bv-navwrap">
      <TabList selectedValue={activeId} onTabSelect={(_, d) => jumpTo(d.value)} size="small">
        {steps.map((s) => <Tab key={s.id} value={s.id}>{s.label}</Tab>)}
      </TabList>
      {headerHidden && <Button appearance="secondary" size="small" className="bv-nav-closebtn" onClick={onClose}>닫기</Button>}
    </div>
  )

  // 공항별 범주 칩 줄은 배너와 같은 내용이라 뺐다. 자료가 모자라 위험을 확정할 수 없다는 표시만 남긴다.
  const board = weatherIncomplete ? <div className="bv-board"><Badge appearance="tint" color="warning">위험 판단 제한</Badge></div> : null

  // 관련 지도 레이어 칩은 처음부터 펼쳐 둔다. 켜면 지도와 함께 보기로 바꿔 레이어가 보이게 한다.
  const layerChips = mapLayerIds.map((id) => ({
    key: id, label: metLabel(id),
    on: !!metVisibility?.[id], onToggle: () => { if (!metVisibility?.[id]) onEnterMapMode?.(); onToggleMetLayer?.(id) },
  }))
  const layerAction = onToggleMetLayer ? (
    <div className="bv-layer-action">
      <Caption1 className="bv-layer-caption">지도에서 보기</Caption1>
      <LayerToggleChips items={layerChips} ariaLabel="관련 지도 레이어" />
    </div>
  ) : null

  const hazards = sections.adverse.hazards
  const hazardRow = (h, i) => {
    const Icon = hazardIcon(h.code)
    const nm = h.routeIntervalNm
    // 경로위험 = NM 구간, 공항경보 = "RKPC 도착"(scope 있고 NM 없음).
    const locText = h.airportScope
      ? `${h.airportScope} ${roleLabel(h.role) || ''}`.trim()
      : nm ? `${nm.startNm}–${nm.endNm}NM`
      : h.airports?.length ? `공항 ${h.airports.join(', ')}`
      : h.airportsUnknown?.length ? `공항 좌표 없음 ${h.airportsUnknown.join(', ')}`
      : null
    const timeText = `${formatBriefingTime(h.validFrom, tz, { withDate: true })}~${formatBriefingTime(h.validTo, tz, { withDate: true })}`
    return (
      <div key={i} className="bv-haz-row" style={{ borderLeftColor: h.level === 'red' ? 'var(--level-red)' : 'var(--level-amber)' }}>
        <Badge appearance={h.encounter === 'on' ? 'filled' : 'tint'} color={h.level === 'red' ? 'danger' : 'warning'} className="bv-haz-enc">
          {h.encounter === 'on' ? '조우' : h.airportScope ? roleLabel(h.role) : '주변'}{h.verticalKnown === false ? '?' : ''}
        </Badge>
        <div className="bv-haz-main">
          <div className="bv-haz-line1">
            <Icon size={16} className="bv-haz-icon" aria-hidden />
            {/* 태풍은 코드(TC)가 아니라 번호·이름이 식별자다 — "태풍"만 띄우면 어느 태풍인지 알 수 없다 */}
            <span>{h.source === 'TYPHOON' ? (h.label || phenomenonKo(h.code)) : (phenomenonKo(h.code) || h.label)}</span>
            {h.code ? <span className="bv-haz-code">{codeText(h.code)}</span> : null}
            {/* 밴드는 경로위험만 — 공항경보는 고도밴드 개념 없음 */}
            {!h.airportScope && (
              <>
                {' · '}
                {h.bandFt ? <span className="tnum">{flText(h.bandFt.lowFt)}–{flText(h.bandFt.highFt)}</span>
                  : <Badge appearance="tint" color="warning" className="bv-haz-band-unk">고도 미상</Badge>}
              </>
            )}
          </div>
          <Caption1 className="bv-haz-line2">
            <b>{SOURCE_KO[h.source] ?? h.source}</b>{locText ? ` · ${locText}` : ''} · <span className="tnum">{timeText}</span>
          </Caption1>
        </div>
      </div>
    )
  }

  const adverse = (
    <section data-bvid="adverse" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">위험 요약</Subtitle2>
          {hazards.length > 0 && <Caption1 style={{ color: 'var(--text-3)' }}>{hazards.length}건 · 심각도순</Caption1>}
        </div>
        {hazards.length === 0
          ? <Body1 style={{ color: 'var(--text-3)' }}>{weatherIncomplete ? '자료의 완전성을 확인할 수 없어 위험 여부를 확정할 수 없습니다.' : '경로·시간에 걸린 위험기상 없음'}</Body1>
          : hazards.map(hazardRow)}
      </Card>
    </section>
  )

  const MATRIX_COLS = [['현상', 'weather'], ['바람', 'wind'], ['시정', 'visibility'], ['RVR', 'rvr'], ['운고', 'ceiling'], ['기온/이슬점', 'temp'], ['QNH', 'qnh']]
  const cellStyle = (f) => ({ fontVariantNumeric: 'tabular-nums', color: f?.flag ? 'var(--level-red)' : undefined, fontWeight: f?.flag ? 700 : undefined })
  const windCell = (f) => <span style={cellStyle(f)}>{f?.text ?? '-'}{f?.gust ? <span className="bv-gust"> G{f.gust}</span> : null}</span>

  const takeoffBlock = (a) => {
    const fc = a.takeoffFcst?.forecasts ?? []
    if (fc.length === 0) {
      return (
        <div className="bv-amos">
          <div className="bv-amos-head"><b>이륙예보 ({a.icao})</b><Caption1 style={{ color: 'var(--text-3)' }}>발표 없음</Caption1></div>
          <Caption1 style={{ color: 'var(--text-3)' }}>ETD 전후 이륙예보(바람·기온·QNH)가 아직 없습니다.</Caption1>
        </div>
      )
    }
    const etdMs = Date.parse(meta.etd)
    let etdIdx = -1
    let best = Infinity
    fc.forEach((f, i) => { const d = Math.abs(Date.parse(f.time) - etdMs); if (Number.isFinite(d) && d < best) { best = d; etdIdx = i } })
    const fmtW = (f) => (Number.isFinite(f.windDir) && Number.isFinite(f.windSpeedKt)
      ? `${String(f.windDir).padStart(3, '0')}/${String(f.windSpeedKt).padStart(2, '0')}kt` : '-')
    return (
      <div className="bv-amos">
        <div className="bv-amos-head"><b>이륙예보 ({a.icao})</b><Caption1 style={{ color: 'var(--text-3)' }}>매시 · KMA (이륙 성능용)</Caption1></div>
        <table className="bv-takeoff">
          <thead><tr><th>시각</th><th>풍향/풍속</th><th>기온</th><th>QNH</th></tr></thead>
          <tbody>
            {fc.map((f, i) => (
              <tr key={f.tmFc} className={i === etdIdx ? 'bv-dest-row-hl' : undefined}>
                <td>{formatBriefingTime(f.time, tz)}{i === etdIdx ? <b style={{ color: 'var(--accent)' }}> ◀ETD</b> : ''}</td>
                <td>{fmtW(f)}</td>
                <td>{f.tempC != null ? `${f.tempC}℃` : '-'}</td>
                <td>{f.qnhHpa ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const amosBlock = (a) => {
    if (!a.amos) return null
    const m = buildAmosConsoleModel(a.amos, null, { icao: a.icao }, tz)
    return (
      <div className="bv-amos">
        <div className="bv-amos-head"><b>AMOS 지상실황</b><Caption1 style={{ color: 'var(--text-3)' }}>{m.observedTimeLabel}</Caption1></div>
        <div className="bv-amos-grid">
          {m.prioritySummary.map((s) => <div key={s.key}><span className="mut">{s.label}</span><b>{s.value}</b></div>)}
          {m.visibilityRows.map((v) => <div key={v.label}><span className="mut">{v.label}</span><span className={v.isRvrGood ? undefined : 'red'}>{v.rvrValue} / {v.morValue}</span></div>)}
          {m.commonCells.filter((c) => c.label !== 'QNH(inHg)').map((c) => <div key={c.label}><span className="mut">{c.label}</span><span>{c.value}</span></div>)}
        </div>
      </div>
    )
  }
  // 행 펼치기 = 원문 METAR(기준치를 넘는 값은 표와 같은 색) + 이륙예보(출발) + AMOS + 공항 패널 바로가기.
  const amosExpansion = (a, { withRaw = true } = {}) => {
    const takeoff = a.role === 'departure' ? takeoffBlock(a) : null
    const amos = amosBlock(a)
    const prov = a.source ? <DataProvenance source={a.source} displayTimeZone={metarTz} /> : null
    return (
      <div className="bv-expand-stack">
        {withRaw && <code className="bv-current-tac-raw">{metarTacSegments(a).map((segment, i) => <span key={i} className={segment.className}>{segment.text}</span>)}</code>}
        {(takeoff || amos) && <div className="bv-expand-grid">{takeoff}{amos}</div>}
        {prov}
        {onOpenAirport && a.icao && (
          <button type="button" className="bv-link" onClick={(e) => { e.stopPropagation(); onOpenAirport(a.icao) }}>{a.icao} 공항 상세 열기</button>
        )}
      </div>
    )
  }

  // 현재 실황(데스크톱) — 공항=행 비교표 (범주 리딩 열, 관측시각+SPECI, 행 펼치기).
  const currentDesktop = (
    <section data-bvid="current" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">현재 실황 <ReportTimeZone tz={metarTz} onChange={setMetarTz} label="브리핑 METAR" /></Subtitle2>
          <Caption1 style={{ color: 'var(--text-3)' }}>행을 누르면 원문과 상세가 펼쳐집니다</Caption1>
        </div>
        <table className="bv-current-matrix">
          <thead><tr>
            <th>공항</th><th>범주</th>
            {MATRIX_COLS.map(([l]) => <th key={l}>{l}</th>)}
            <th aria-label="펼치기" />
          </tr></thead>
          <tbody>
            {airports.map((a) => {
              const open = !!expandedRoles[a.role]
              return (
                <Fragment key={a.role}>
                  <tr className="bv-cur-row" onClick={() => toggleRole(a.role)} aria-expanded={open}>
                    <td>
                      <div className="bv-cur-airport">
                        <span className="bv-cur-role"><Badge appearance="tint" color="informative">{roleLabel(a.roles ?? a.role)}</Badge> <b>{a.icao}</b></span>
                        {a.observationTime && (
                          <Caption1 style={{ color: 'var(--text-3)' }}>
                            {formatBriefingTime(a.observationTime, metarTz, { withDate: true })}
                            {a.reportType === 'SPECI' ? <Badge appearance="tint" color="warning" className="bv-speci">SPECI</Badge> : null}
                          </Caption1>
                        )}
                      </div>
                    </td>
                    <td><CatBadge category={a.category} /></td>
                    {MATRIX_COLS.map(([, k]) => (
                      <td key={k} style={k === 'wind' ? undefined : cellStyle(a.fields[k])}>
                        {k === 'wind' ? windCell(a.fields[k]) : (a.fields[k]?.text ?? '-')}
                      </td>
                    ))}
                    <td className="bv-cur-caret">{open ? '▾' : '▸'}</td>
                  </tr>
                  {open && <tr className="bv-cur-expand"><td colSpan={MATRIX_COLS.length + 3}>{amosExpansion(a)}</td></tr>}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
    </section>
  )

  // 폰(시트 폭): 비교표는 읽히지 않아 공항마다 원문 카드로 둔다(2026-07 결정).
  const currentMobile = (
    <section data-bvid="current" className="bv-section">
      <Card>
        <Subtitle2 as="h3">현재 실황 <ReportTimeZone tz={metarTz} onChange={setMetarTz} label="브리핑 METAR" /></Subtitle2>
        <div className="bv-current-tac">
          {airports.map((a) => (
            <article className="bv-current-tac-card" key={a.role}>
              <div className="bv-current-tac-head">
                <span><Badge appearance="tint" color="informative">{roleLabel(a.roles ?? a.role)}</Badge> <b>{a.icao} {a.reportType === 'SPECI' ? 'SPECI' : 'METAR'}</b></span>
                <span className="bv-current-tac-meta">{a.observationTime && <Caption1 style={{ color: 'var(--text-3)' }}>{formatBriefingTime(a.observationTime, metarTz, { withDate: true })}</Caption1>}<CatBadge category={a.category} /></span>
              </div>
              <code className="bv-current-tac-raw">{metarTacSegments(a).map((segment, i) => <span key={i} className={segment.className}>{segment.text}</span>)}</code>
              <details className="bv-current-tac-detail">
                <summary>상세 관측·예보</summary>
                {amosExpansion(a, { withRaw: false })}
              </details>
            </article>
          ))}
        </div>
      </Card>
    </section>
  )

  // 일기도 바로가기: 지도에 실제 자료 레이어를 ETD 또는 ETA 시각으로 띄운다. 브리핑은 옆에 남는다(지도와 함께 보기).
  const chartTimeMs = (key) => Date.parse(key === 'eta' ? meta.eta : meta.etd)
  const openChart = (tile) => {
    onEnterMapMode?.()
    if (!metVisibility?.[tile.layer]) onToggleMetLayer?.(tile.layer)
    const ms = tile.timed ? chartTimeMs(chartTimes[tile.layer] ?? 'etd') : NaN
    if (Number.isFinite(ms)) onSetMapTime?.(ms)
  }
  const chartsSection = onToggleMetLayer && (
    <section data-bvid="charts" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">일기도</Subtitle2>
          <Caption1 style={{ color: 'var(--text-3)' }}>지도에 실제 자료를 띄웁니다</Caption1>
        </div>
        <div className="bv-chart-tiles">
          {CHART_TILES.map((tile) => {
            const pick = chartTimes[tile.layer] ?? 'etd'
            return (
              <div key={tile.layer} className="bv-chart-tile">
                <b>{tile.title}</b>
                <Caption1 className="bv-chart-text">{tile.text}</Caption1>
                <div className="bv-chart-foot">
                  {tile.timed && onSetMapTime && (meta.etd || meta.eta) ? (
                    <div className="bv-chart-seg" role="group" aria-label={`${tile.title} 시각`}>
                      {[['etd', 'ETD', meta.etd], ['eta', 'ETA', meta.eta]].filter(([, , iso]) => iso).map(([key, label, iso]) => (
                        <button key={key} type="button" aria-pressed={pick === key} onClick={() => setChartTimes((m) => ({ ...m, [tile.layer]: key }))}>
                          {label} {formatBriefingTime(iso, tz).replace(` ${tz}`, '')}
                        </button>
                      ))}
                    </div>
                  ) : <Caption1 style={{ color: 'var(--text-3)' }}>{tile.timed ? '지도 시각 그대로' : '발표 시각 고정'}</Caption1>}
                  {/* 켜져 있으면 같은 자리에서 끈다(시각은 그대로). */}
                  {metVisibility?.[tile.layer]
                    ? <Button appearance="primary" size="small" aria-pressed="true" onClick={() => onToggleMetLayer?.(tile.layer)}>지도에서 끄기</Button>
                    : <Button appearance="secondary" size="small" onClick={() => openChart(tile)}>지도에서 보기</Button>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )

  const legs = sections.enroute?.legs ?? []
  // "위험 없음"은 SIGMET·AIRMET만 본 판정이었다. 수치모델 MOD 이상이 있거나 모델 자료가
  // 없으면 그 사실을 같은 줄에 적어, 바로 아래 SEVERE 난류와 어긋나지 않게 한다(F1).
  const ribbonSummary = sections.enroute?.ribbon?.summary
  const modelTop = ribbonSummary?.top?.kind === 'model' ? ribbonSummary.top : null
  const noEncounterText = weatherIncomplete
    ? '예보 범위와 누락 자료를 확인해야 합니다. 계획고도의 위험 여부를 확정할 수 없습니다.'
    : modelTop
      ? `SIGMET·AIRMET 해당 없음 · 수치모델 ${modelTop.label} ${modelTop.level === 'SEV' ? 'SEVERE' : 'MODERATE'} ${modelTop.from && modelTop.to ? `${modelTop.from}→${modelTop.to} ` : ''}${modelTop.startNm}–${modelTop.endNm}NM`
      : ribbonSummary?.status === 'unknown'
        ? 'SIGMET·AIRMET 해당 없음 · 수치모델 난류·착빙은 자료가 없어 확인 불가'
        : '계획고도에서 조우하는 위험 없음'
  const ribbon = sections.enroute?.ribbon ?? null
  // 위험 막대 칸을 누르면 NAVLOG 행처럼 그 구간을 고정한다(다시 누르면 해제).
  const pinRange = (range) => {
    const key = range ? `ribbon:${range.startNm}-${range.endNm}` : null
    const next = range && pinnedLeg?.key !== key ? { ...range, key, pinned: true } : null
    setPinnedLeg(next)
    setActiveLeg(next)
    onHighlightLeg?.(next)
  }
  const enroute = sections.enroute && (
    <section data-bvid="enroute" className="bv-section">
      <Card>
        <Subtitle2 as="h3">노선·공역</Subtitle2>
        <Body1>계획고도 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{sections.enroute.plannedCruiseAltitudeFt}ft</b></Body1>
        {sections.enroute.encounters.length === 0
          ? <Body1 style={{ color: modelTop ? (modelTop.level === 'SEV' ? 'var(--level-red)' : 'var(--level-amber)') : 'var(--text-3)' }}>{noEncounterText}</Body1>
          : sections.enroute.encounters.map((h, i) => (
              <Body1 key={i}>
                <b>{phenomenonKo(h.code) || h.label}</b>
                {phenomenonKo(h.code) && h.code ? <Caption1 style={{ color: 'var(--text-3)' }}> ({h.code})</Caption1> : null}
                {h.bandFt ? ` ${h.bandFt.lowFt}–${h.bandFt.highFt}ft` : ''} · {h.routeIntervalNm.startNm}–{h.routeIntervalNm.endNm}NM
              </Body1>
            ))}
        {/* 데스크톱: 지도형 브리핑 독과 같은 부품(위험 막대 + 압축 연직단면도, 가로축 맞춤).
            모바일: 막대 없이 기존 단면도 + "단면도 크게 열기" — 시트 폭에서는 압축 단면도가 읽히지 않는다. */}
        {!isMobile && (ribbon || verticalProfile) && (
          <BriefingDock variant="document" ribbon={ribbon} verticalProfile={verticalProfile} crossSection={crossSection} advisories={advisories}
            nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} onSelectForecastHour={onSelectForecastHour}
            crossSectionHourLoading={crossSectionHourLoading} selectedId={null}
            onHover={(target) => setRibbonHover(target?.item ? { startNm: target.item.startNm, endNm: target.item.endNm } : null)}
            onSelect={(target) => pinRange(target?.item ? { startNm: target.item.startNm, endNm: target.item.endNm, from: target.item.from, to: target.item.to } : null)}
            hiddenRows={hiddenRibbonRows} onToggleRow={(key) => setHiddenRibbonRows((rows) => rows.includes(key) ? rows.filter((r) => r !== key) : [...rows, key])}
            highlightRangeNm={ribbonHover ?? activeLeg} />
        )}
        {isMobile && (verticalProfile || sections.enroute.crossSectionAvailable) && (
          <section className="bv-leg-briefing" aria-label="연직단면도">
            <div className="bv-leg-head">
              <div>
                <Subtitle2 as="h4">연직단면도</Subtitle2>
                <Caption1 className="bv-leg-sub">경로를 따라 자른 고도 단면 · 레이어로 표시 항목을 켜고 끕니다</Caption1>
              </div>
            </div>
            {verticalProfile && (
              <div className="bv-xsection bv-xsection-scroll">
                <VerticalProfileViewer embedded profile={verticalProfile} crossSection={crossSection} layers={xLayers} onToggleLayer={toggleXLayer} advisories={advisories} highlightRangeNm={activeLeg} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} onSelectForecastHour={onSelectForecastHour} crossSectionHourLoading={crossSectionHourLoading} />
              </div>
            )}
            {sections.enroute.crossSectionAvailable && verticalProfile && (
              <Button appearance="secondary" size="small" onClick={() => setXsectionFull(true)}>단면도 크게 열기</Button>
            )}
          </section>
        )}
        {crossSectionHourLoading && <p className="bv-leg-sub" role="status">예보 시각 반영 중…</p>}
        {nwpTimeRefreshError && <p className="bv-leg-sub" role="alert">예보 시각 반영 실패 <button type="button" onClick={onRetryNwpTimeRefresh}>다시 시도</button></p>}
        {(legs.length > 0 || (sections.enroute.procedures ?? []).length > 0) && <RouteWeatherLegTable
          legs={legs}
          procedures={sections.enroute.procedures ?? []}
          selectedAltitudeFt={sections.enroute.plannedCruiseAltitudeFt}
          pinnedLegKey={pinnedLeg?.key ?? null}
          onHighlightLeg={(leg) => {
            if (leg?.pinned || !leg) setPinnedLeg(leg?.pinned ? leg : null)
            setActiveLeg(leg)
            onHighlightLeg?.(leg)
          }}
        />}
        {rawWinds && (
          <details className="bv-rawwinds">
            <summary>상층바람·기온 원자료 <span className="dim">(격자·층별)</span></summary>
            <div className="bv-rawwinds-scroll">
              <Table size="extra-small" className="bv-rawwinds-table">
                <TableHeader><TableRow>
                  <TableHeaderCell>고도</TableHeaderCell>
                  {rawWinds.columns.map((c) => <TableHeaderCell key={`${c.label}-${c.distanceNm}`}>{c.label}</TableHeaderCell>)}
                </TableRow></TableHeader>
                <TableBody>
                  {rawWinds.rows.map((r) => (
                    <TableRow key={r.fl}>
                      <TableCell style={{ color: 'var(--text-3)' }}>{r.fl}</TableCell>
                      {r.cells.map((cell, ci) => (
                        <TableCell key={ci} className={cell.highlight ? 'bv-rw-hl' : undefined}>
                          {cell.wind}{cell.temp != null ? <span className="bv-rw-temp"> {cell.temp}</span> : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Caption1 className="bv-rawwinds-cap"><span className="bv-rw-swatch" /> 실제 비행경로 고도(연직 프로파일) · KIM NWP</Caption1>
          </details>
        )}
      </Card>
    </section>
  )

  const routeNotams = briefing.routeNotams ?? []
  const routeConflicts = briefing.routeConflicts ?? []
  const unresolvedNotams = routeNotams.filter((n) => n.positionStatus === 'unresolved')
  // 분류: 공항 소속(출/도착/교체) 우선 → 나머지 순수 경로상. 도착공항 NOTAM이 경로 끝과 겹쳐도
  // "경로상"이 아니라 "도착 공항"으로 가야 보는 사람이 헷갈리지 않는다(공항 매칭 우선).
  const notamAirportGroups = ['departure', 'arrival', 'alternate']
    .map((role) => {
      const items = routeNotams.filter((n) => n.airportRole === role)
      return items.length ? { role, roles: items[0].airportRoles ?? [role], icao: items[0].airportIcao, items } : null
    })
    .filter(Boolean)
  const notamRouteGroup = routeNotams.filter((n) => n.onRoute && !n.airportRole) // 어느 공항에도 안 속한 순수 경로 통과
  // 경로 NOTAM은 camelCase 형태라 뷰모델 필드명으로 맞춰 넘긴다. D)까지 봐야 목록·지도와 일치한다.
  const notamCell = (n, showPriority = false) => (
    <NotamCell
      key={n.id}
      category={n.category}
      timeState={deriveNotamTime({ valid_from: n.validFrom, valid_to: n.validTo, schedule_text: n.scheduleText }, nowMs).state}
      summary={n.summary || n.id}
      metaText={`${NOTAM_CAT_LABEL[n.category] || n.category} · ${n.id}${n.routeIntervalNm ? ` · ${n.routeIntervalNm.startNm}–${n.routeIntervalNm.endNm}NM` : ''}`}
      altitude={formatAltitude(n.altitude)}
      rawText={n.rawText}
      validText={formatValidPeriod(n.validFrom, n.validTo, tz)}
      conflict={n.conflict}
      priority={showPriority ? n.operational?.priority : undefined}
    />
  )
  const notamSection = routeNotams.length > 0 && (
    <section data-bvid="notam" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">경로·공항 NOTAM</Subtitle2>
          <Caption1 style={{ color: 'var(--text-3)' }}>
            {routeNotams.length}건{routeConflicts.length ? ` · 저촉 ${routeConflicts.length}` : ''}
          </Caption1>
        </div>
        {onToggleMetLayer && (
          // 이 섹션 전용: 지도로 가서 경로에 걸린 NOTAM만 켠다(Task 6 경로전용 필터가 자동 적용).
          <Button appearance="primary" size="small" icon={<Layers size={16} />} className="bv-notam-layerbtn"
            onClick={() => { onEnterMapMode?.(); if (!metVisibility?.notam) onToggleMetLayer('notam') }}>
            지도에 NOTAM 레이어 보기
          </Button>
        )}
        {notamRouteGroup.length > 0 && (
          <>
            <div className="bv-notam-grouphead">경로상 <span className="dim">{notamRouteGroup.length}</span></div>
            <div className="notam-cellgrid">{notamRouteGroup.map((n) => notamCell(n))}</div>
          </>
        )}
        {notamAirportGroups.map((g) => {
          const open = !!notamGroupOpen[g.role]
          const criticalItems = g.items.filter((n) => n.operational?.priority === 'critical')
          const otherItems = g.items.filter((n) => n.operational?.priority !== 'critical')
          const initialItems = criticalItems.length > 0 ? criticalItems : g.items
          return (
            <div key={g.role} className="bv-airport-notam">
              <div className="bv-notam-grouphead">{roleLabel(g.roles ?? g.role)} 공항 {g.icao} <span className="dim">{criticalItems.length > 0 ? '필수 확인 ' + criticalItems.length : g.items.length}</span></div>
              <div className="notam-cellgrid">{initialItems.map((n) => notamCell(n, true))}</div>
              {open && otherItems.length > 0 && <><div className="bv-notam-grouphead">기타 직접 해당 <span className="dim">{otherItems.length}</span></div><div className="notam-cellgrid">{otherItems.map((n) => notamCell(n, true))}</div></>}
              {criticalItems.length > 0 && otherItems.length > 0 && (
                <button type="button" className="bv-notam-more"
                  onClick={() => setNotamGroupOpen((m) => ({ ...m, [g.role]: !m[g.role] }))}>
                  {open ? '필수 항목만 보기' : '기타 직접 해당 ' + otherItems.length + '건 보기'}
                  <ChevronDown size={13} className={open ? 'notam-more-chev is-open' : 'notam-more-chev'} aria-hidden="true" />
                </button>
              )}
            </div>
          )
        })}
      </Card>
    </section>
  )

  const dest = sections.destination
  const catBar = (timeline, validity, eta, tall) => {
    const segs = tafBarSegments(timeline, validity)
    if (segs.length === 0) return null
    const s = Date.parse(validity?.start); const e = Date.parse(validity?.end)
    const span = e - s
    const etaLeft = (Number.isFinite(s) && Number.isFinite(e) && span > 0 && eta)
      ? Math.max(0, Math.min(100, pctOf(eta, s, span))) : null
    // 눈금 = 색(범주) 전환 시각 + 끝점(유효종료). "언제 바뀌는지"를 그 자리에 표기. 날짜는 바뀔 때만.
    const ticks = []
    let prevDate = null
    const pushTick = (iso, left) => {
      const p = kstParts(iso); if (!p) return
      ticks.push({ left, time: p.time, day: p.date !== prevDate ? p.date : null }); prevDate = p.date
    }
    for (const sg of segs) pushTick(sg.time, sg.left)
    if (Number.isFinite(e)) pushTick(validity.end, 100)
    const etaT = etaLeft != null ? kstParts(eta) : null
    return (
      <div className={`bv-tafbar${tall ? ' bv-tafbar-tall' : ''}`}>
        {etaLeft != null && <span className="bv-tafbar-eta" style={{ left: `${etaLeft}%` }}><span className="bv-tafbar-eta-mark">▼ETA {etaT?.time} {tzSuffix}</span></span>}
        <div className="bv-tafbar-track">
          {segs.map((sg, i) => <span key={i} style={{ left: `${sg.left}%`, width: `${sg.width}%`, background: sg.color }} />)}
        </div>
        {ticks.length > 0 && (
          <div className="bv-tafbar-axis" aria-hidden="true">
            {ticks.map((tk, i) => (
              <span key={i} className="bv-tafbar-tick" data-align={tk.left <= 2 ? 'start' : tk.left >= 98 ? 'end' : 'mid'} style={{ left: `${tk.left}%` }}>
                {tk.day ? <b>{tk.day}</b> : null}{tk.time}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  const tzSuffix = tafTz === 'KST' ? 'KST' : 'Z'
  const kstParts = (iso) => {
    const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null
    const d = new Date(ms + (tafTz === 'UTC' ? 0 : 9 * 3600000)); const q = (n) => String(n).padStart(2, '0')
    return { date: `${q(d.getUTCMonth() + 1)}/${q(d.getUTCDate())}`, time: `${q(d.getUTCHours())}:${q(d.getUTCMinutes())}` }
  }

  const destination = (
    <section data-bvid="destination" className="bv-section">
      <Card>
        <Subtitle2 as="h3">목적지 예보 <ReportTimeZone tz={tafTz} onChange={setTafTz} label="브리핑 TAF" /></Subtitle2>
        {!dest.sourceTaf ? <Body1 style={{ color: 'var(--text-3)' }}>TAF 없음</Body1> : (
          <>
            <EnhancedTafTab taf={dest.sourceTaf} icao={dest.icao} eta={meta.eta} forceCompact displayTimeZone={tafTz} />
            {dest.etaOutOfRange && (
              <MessageBar intent="warning"><MessageBarBody>도착(ETA)이 이 TAF 유효기간 밖입니다 — 표시된 TAF는 도착 시각을 포함하지 않습니다(최신 TAF 확인 필요).</MessageBarBody></MessageBar>
            )}
          </>
        )}
        {dest.alternateRequired === true && (
          <MessageBar intent="warning"><MessageBarBody><MessageBarTitle>교체공항 필요</MessageBarTitle> {dest.alternateReason}</MessageBarBody></MessageBar>
        )}
        {dest.alternate && (
          <div className="bv-dest-alt">
            <div className="bv-dest-head">
              {dest.alternate.category ? <CatBadge category={dest.alternate.category} /> : <Badge appearance="tint">정보 없음</Badge>}
              <b style={{ fontSize: 'var(--fs-400)' }}>{dest.alternate.icao}</b>
              <Caption1 style={{ color: 'var(--text-3)' }}>교체 · ETA {formatBriefingTime(meta.eta, tafTz)}</Caption1>
            </div>
            {dest.alternate.noTaf
              ? <Caption1 style={{ color: 'var(--text-3)' }}>TAF 없음 — 교체공항 예보 미확보</Caption1>
              : catBar(dest.alternate.timeline, dest.alternate.validity, dest.eta, false)}
          </div>
        )}
      </Card>
    </section>
  )

  if (isMobile) {
    const worst = worstAirport(airports)
    const peek = (
      <span className="bv-peek">
        <b>{meta.departureAirport} → {meta.arrivalAirport}</b>
        <Badge appearance="tint">{meta.flightRule}</Badge>
        {worst && <CatBadge category={worst.category} />}
      </span>
    )
    return (
      <>
        <MobileSheet open eyebrow="비행 전 브리핑" title={`${meta.departureAirport} → ${meta.arrivalAirport}`}
          headerExtra={<Badge appearance="tint">{meta.flightRule}</Badge>}
          onClose={onClose} detent={detent} onDetentChange={setDetent} peekContent={peek}
          // 브리핑은 경로 패널 위에 뜨는 별도 화면이라 패널의 "이전 단계" 푸터를 물려받지
          // 않는다. 모바일 시트에는 헤더 닫기 버튼도 없어서(그래버 스와이프가 그 역할을 겸함)
          // 경로를 고치러 돌아갈 길이 화면에 안 보였다. 데스크톱 "닫기"와 같은 동작을
          // 앞 단계들과 같은 표현으로 노출한다 — 닫으면 경로 패널로 돌아간다.
          footer={(
            <div className="bv-sheet-footer">
              <button type="button" className="bv-back-step" onClick={onClose}>이전 단계</button>
            </div>
          )}>
          <div className="bv-mobile" ref={containerRef}>
            {frozenNotice}
            {etdEtaLine && <Caption1 style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{etdEtaLine}</Caption1>}
            {organizationError && <MessageBar intent="warning"><MessageBarBody>기상자료를 갱신하지 못했습니다. 마지막 조회 결과를 표시합니다. <Button size="small" onClick={() => onOrganizationReload?.()}>다시 시도</Button></MessageBarBody></MessageBar>}
            <BriefingBanner banner={weatherIncomplete && briefing.banner?.worst?.category === 'VFR' ? { ...briefing.banner, worst: null } : briefing.banner} routeConflicts={routeConflicts} unresolved={unresolvedNotams} onJump={jumpTo} />
            {nav}{board}{layerAction}{adverse}{currentMobile}{chartsSection}{enroute}{notamSection}{destination}
            {!organizationContext && !frozenNotice && <ForecasterInquiry snapshot={routeSnapshot} disabled={!routeSnapshot} />}
          </div>
        </MobileSheet>
        {xsectionFull && verticalProfile && (
          <div className="bv-xfull" role="dialog" aria-label="단면도 전체화면" onClick={() => setXsectionFull(false)}>
            <div className="bv-xfull-rotate" onClick={(e) => e.stopPropagation()}>
              <div className="bv-xfull-toolbar">
                <div className="bv-xfull-toolbar-main">
                  <span className="bv-xfull-summary">연직단면도</span>
                  <button type="button" className="bv-xfull-close" onClick={() => setXsectionFull(false)} aria-label="닫기">×</button>
                </div>
              </div>
              <VerticalProfileViewer embedded fillContainer profile={verticalProfile} crossSection={crossSection} layers={xLayers} onToggleLayer={toggleXLayer} advisories={advisories} highlightRangeNm={pinnedLeg} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} onSelectForecastHour={onSelectForecastHour} crossSectionHourLoading={crossSectionHourLoading} />
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={`briefing-view${collapsed ? ' is-collapsed' : ''}${expanded ? ' is-expanded' : ''}`}>
      {!expanded && <button type="button" className="bv-collapse-tab" onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? '브리핑 펼치기' : '브리핑 접기'} aria-expanded={!collapsed}>
        <ChevronRight size={22} strokeWidth={2.5} className={collapsed ? 'is-collapsed' : ''} aria-hidden="true" />
      </button>}
      <div className="bv-scroll" ref={containerRef}>
        <div className="bv-header" ref={headerRef}>
          <div>
            <Caption1 style={{ color: 'var(--text-3)' }}>비행 전 브리핑</Caption1>
            <div className="bv-title-row">
              <Title3 as="h2" block>{meta.departureAirport} → {meta.arrivalAirport}</Title3>
              <Badge appearance="filled" color={meta.flightRule === 'IFR' ? 'danger' : 'success'} size="large">{meta.flightRule}</Badge>
            </div>
            <Caption1 style={{ color: 'var(--text-3)', display: 'block' }}>{meta.alternateAirport ? `교체 ${meta.alternateAirport}` : '단일 목적지'}</Caption1>
            {etdEtaLine && <Caption1 style={{ color: 'var(--accent)', display: 'block', fontVariantNumeric: 'tabular-nums' }}>{etdEtaLine}</Caption1>}
          </div>
          <div className="bv-head-side">
            {onMapView && <Button appearance="secondary" size="small" onClick={onMapView}>지도형 보기</Button>}
            {onSaveBriefing && (
              <Button appearance="primary" size="small" onClick={onSaveBriefing}>브리핑 저장</Button>
            )}
            <Button appearance="secondary" size="small" onClick={() => setExpanded((value) => !value)}>{expanded ? '지도와 함께 보기' : '전체 보기'}</Button>
            <Button appearance="secondary" size="small" onClick={onClose}>닫기</Button>
          </div>
        </div>
        {organizationError && <MessageBar intent="warning"><MessageBarBody>기상자료를 갱신하지 못했습니다. 마지막 조회 결과를 표시합니다. <Button size="small" onClick={() => onOrganizationReload?.()}>다시 시도</Button></MessageBarBody></MessageBar>}
        {frozenNotice}
        <BriefingBanner banner={weatherIncomplete && briefing.banner?.worst?.category === 'VFR' ? { ...briefing.banner, worst: null } : briefing.banner} routeConflicts={routeConflicts} unresolved={unresolvedNotams} onJump={jumpTo} />
        {nav}{board}{layerAction}{adverse}{currentDesktop}{chartsSection}{enroute}{notamSection}{destination}
        {!organizationContext && !frozenNotice && <ForecasterInquiry snapshot={routeSnapshot} disabled={!routeSnapshot} />}
      </div>
    </div>
  )
}
