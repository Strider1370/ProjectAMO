import { Fragment, useEffect, useRef, useState } from 'react'
import { Layers, CloudLightning, Waves, Snowflake, Wind, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Badge, Button, Card, TabList, Tab,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
  MessageBar, MessageBarBody, MessageBarTitle,
  Title3, Subtitle2, Body1, Caption1,
} from '../../shared/ui/fluent.js'
import VerticalProfileChart from './VerticalProfileChart.jsx'
import BriefingBanner from './BriefingBanner.jsx'
import BriefingSynopsis from './BriefingSynopsis.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import DataProvenance from '../../shared/ui/DataProvenance.jsx'
import ForecasterInquiry from './ForecasterInquiry.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useDemoMode from '../../shared/demoMode/useDemoMode.js'
import { formatBriefingTime } from './lib/briefingTime.js'
import { hazardMapLayers } from './lib/hazardLayers.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import { metLabel } from '../map/layerActions.js'
import { phenomenonKo } from '../../shared/weather/phenomenonKo.js'
import { buildAmosConsoleModel } from '../../shared/weather/amosViewModel.js'
import { buildMetarTacSegments, buildMetarViewModel } from '../airport-panel/lib/metarViewModel.js'
import EnhancedTafTab from '../airport-panel/tabs/TafTab.jsx'
import { useCrossSectionLayers, CrossSectionToggles, ForecastHourNav } from './crossSectionLayers.jsx'
import { buildRawWindsTable } from './lib/rawWindsModel.js'
import { LEVEL_COLOR, catColorOf, catDisplay, worstAirport, worstInterval, pctOf, tafBarSegments } from './lib/briefingViewModel.js'
import { deriveNotamTime, formatAltitude, formatValidPeriod, NOTAM_CATEGORIES } from '../notam/lib/notamViewModel.js'
import NotamCell from '../notam/NotamCell.jsx'
import RouteWeatherLegTable from './RouteWeatherLegTable.jsx'
import './BriefingView.css'

const LEVEL_BADGE = { green: 'success', amber: 'warning', red: 'danger', gray: 'subtle' }
const FIELDS = [['바람', 'wind'], ['시정', 'visibility'], ['RVR', 'rvr'], ['운고', 'ceiling'], ['기온/노점', 'temp'], ['현상', 'weather'], ['QNH', 'qnh']]
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

const roleLabel = (r) => (r === 'departure' ? '출발' : r === 'arrival' ? '도착' : '교체')

// 카테고리 배지 — 라벨은 3단계 fold, 색은 심각도(level). MVFR="VFR"(green), IFR=amber, LIFR=red.
function CatBadge({ category }) {
  const c = catDisplay(category)
  return <Badge appearance="filled" style={{ backgroundColor: catColorOf(category), color: '#fff' }}>{c}</Badge>
}

export default function BriefingView({ briefing, verticalProfile = null, crossSection = null, advisories = [], onClose, onOpenProfile, onFocus, metVisibility, onToggleMetLayer, onEnterMapMode, onHighlightLeg, onSelectForecastHour, crossSectionHourLoading = false, nwpTimeSelection = null, onSetWaypointNwpOffset = null, routeSnapshot = null }) {
  const isMobile = useIsMobile()
  const { tz } = useTimeZone()
  const { nowMs } = useDemoMode()
  const containerRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  const [detent, setDetent] = useState('half')
  const [activeAirport, setActiveAirport] = useState(null)
  const [xsectionFull, setXsectionFull] = useState(false)
  const [showLayerChips, setShowLayerChips] = useState(false)
  const [expandedRoles, setExpandedRoles] = useState({})
  const [notamGroupOpen, setNotamGroupOpen] = useState({}) // ⑤ 공항별 NOTAM "더 보기" 펼침(role별)
  const [collapsed, setCollapsed] = useState(false) // 패널 접기 — 지도를 보려고 오른쪽으로 슬라이드아웃(닫기와 달리 브리핑 유지)
  const [expanded, setExpanded] = useState(false)
  const [pinnedLeg, setPinnedLeg] = useState(null) // NAVLOG에서 클릭해 고정한 구간
  const [activeLeg, setActiveLeg] = useState(null) // 지금 가리킨 구간(호버 또는 고정) — 단면도 강조용
  const headerRef = useRef(null)
  const [headerHidden, setHeaderHidden] = useState(false) // 헤더 스크롤아웃 시에만 sticky nav의 닫기 노출(중복 버튼 방지)
  const toggleRole = (role) => setExpandedRoles((m) => ({ ...m, [role]: !m[role] }))
  // 인라인 단면도 레이어 토글 — 해당 현상이 있으면 그 레이어를 기본 ON.
  // 현상 출처: SIGMET/AIRMET 위험기상 + enroute 모델(KTG 난류·KIM 착빙) 둘 다.
  const hazardCodes = (briefing?.sections?.adverse?.hazards ?? []).map((h) => h.code)
  const modelKinds = new Set((briefing?.sections?.enroute?.model?.elements ?? []).map((e) => e.kind))
  const hazHas = (codes) => codes.some((c) => hazardCodes.includes(c))
  // 기온·습도·바람·SIGMET/AIRMET은 항상 기본 ON. 착빙·난류는 해당 현상이 있을 때만.
  const icingOn = hazHas(['SEV_ICE', 'MOD_ICE']) || modelKinds.has('icing')
  const [xLayers, toggleXLayer] = useCrossSectionLayers({
    temp: true, wind: true, cloud: true, advisories: true,
    icing: icingOn,
    moisture: !icingOn, // 착빙과 습도는 같은 영역을 칠해 색이 겹친다 — 착빙이 켜지면 습도는 양보.
    turbulence: hazHas(['SEV_TURB', 'MOD_TURB']) || modelKinds.has('turbulence'),
  })
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus

  useEffect(() => { if (activeId) onFocusRef.current?.(activeId) }, [activeId])

  // 브리핑이 닫히면 지도에 남은 구간 강조도 같이 지운다.
  const onHighlightLegRef = useRef(onHighlightLeg)
  onHighlightLegRef.current = onHighlightLeg
  useEffect(() => () => onHighlightLegRef.current?.(null), [])

  const hasEnroute = Boolean(briefing?.sections?.enroute)
  const hasNotam = (briefing?.routeNotams ?? []).length > 0
  const destNum = hasNotam ? '⑥' : '⑤' // NOTAM(⑤)이 노선과 목적지 사이에 들어오면 목적지는 ⑥
  const steps = briefing
    ? [
        { id: 'adverse', label: '① 위험' },
        { id: 'current', label: '② 현재' },
        { id: 'synopsis', label: '③ 개황' },
        ...(hasEnroute ? [{ id: 'enroute', label: '④ 노선' }] : []),
        ...(hasNotam ? [{ id: 'notam', label: '⑤ NOTAM' }] : []),
        { id: 'destination', label: `${destNum} 목적지` },
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
  const mapLayerIds = hazardMapLayers(briefing) // 위험현상 → 켤 지도 레이어 id
  const rawWinds = buildRawWindsTable(crossSection, verticalProfile) // ④ 상층바람 원자료 표
  const airports = sections.current.airports
  const activeAirportObj = airports.find((a) => a.role === activeAirport) ?? airports[0]
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

  const board = (
    <div className="bv-board">
      {summary.map((s) => <Badge key={s.key} appearance="tint" color={LEVEL_BADGE[s.level] || 'subtle'}>{s.label}</Badge>)}
    </div>
  )

  // 경로상 위험과 연관된 지도 레이어 토글칩(위험 있을 때만). 버튼 → 지도 모드 + 칩 펼침(우측 간격).
  const layerChips = mapLayerIds.map((id) => ({
    key: id, label: metLabel(id),
    on: !!metVisibility?.[id], onToggle: () => onToggleMetLayer?.(id),
  }))
  const layerAction = mapLayerIds.length > 0 && onToggleMetLayer ? (
    <div className="bv-layer-action">
      <Button appearance="primary" size="small" icon={<Layers size={16} />}
        onClick={() => { if (!showLayerChips) onEnterMapMode?.(); setShowLayerChips((v) => !v) }}>
        지도에 관련 레이어 보기
      </Button>
      {showLayerChips && <LayerToggleChips items={layerChips} ariaLabel="관련 지도 레이어" />}
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
            {h.code ? <span className="bv-haz-code">{h.code}</span> : null}
            {/* 밴드는 경로위험만 — 공항경보는 고도밴드 개념 없음 */}
            {!h.airportScope && (
              <>
                {' · '}
                {h.bandFt ? <span className="tnum">{h.bandFt.lowFt}–{h.bandFt.highFt}ft</span>
                  : <Badge appearance="tint" color="warning" className="bv-haz-band-unk">밴드 미상</Badge>}
              </>
            )}
          </div>
          <Caption1 className="bv-haz-line2">
            <b>{h.source}</b>{locText ? ` · ${locText}` : ''} · <span className="tnum">{timeText}</span>
          </Caption1>
        </div>
      </div>
    )
  }

  const adverse = (
    <section data-bvid="adverse" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">① 위험 요약</Subtitle2>
          {hazards.length > 0 && <Caption1 style={{ color: 'var(--text-3)' }}>{hazards.length}건 · 심각도순</Caption1>}
        </div>
        {hazards.length === 0
          ? <Body1 style={{ color: 'var(--text-3)' }}>경로·시간에 걸린 위험기상 없음</Body1>
          : hazards.map(hazardRow)}
      </Card>
    </section>
  )

  const MATRIX_COLS = [['현상', 'weather'], ['바람', 'wind'], ['시정', 'visibility'], ['RVR', 'rvr'], ['운고', 'ceiling'], ['기온/이슬점', 'temp'], ['QNH', 'qnh']]
  const cellStyle = (f) => ({ fontVariantNumeric: 'tabular-nums', color: f?.flag ? 'var(--level-red)' : undefined, fontWeight: f?.flag ? 700 : undefined })
  const windCell = (f) => <span style={cellStyle(f)}>{f?.text ?? '-'}{f?.gust ? <span className="bv-gust"> G{f.gust}</span> : null}</span>

  // ② 행 확장 = 이륙예보(출발) + AMOS 지상실황(있으면 전부) + 원문 METAR.
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
  const amosExpansion = (a) => {
    const takeoff = a.role === 'departure' ? takeoffBlock(a) : null
    const amos = amosBlock(a)
    const prov = a.source ? <DataProvenance source={a.source} /> : null
    if (!takeoff && !amos && !prov) return <Caption1 style={{ color: 'var(--text-3)' }}>추가 정보 없음</Caption1>
    return <div className="bv-expand-stack">{takeoff}{amos}{prov}</div>
  }

  // ② 현재 실황 — 공항=행 비교 매트릭스 (범주 리딩 열, 관측시각+SPECI, 행 펼치기).
  const currentDesktop = (
    <section data-bvid="current" className="bv-section">
      <Card>
        <Subtitle2 as="h3">② 현재 실황</Subtitle2>
        <div className="bv-current-tac">
          {airports.map((a) => (
            <article className="bv-current-tac-card" key={a.role}>
              <div className="bv-current-tac-head">
                <span><Badge appearance="tint" color="informative">{roleLabel(a.role)}</Badge> <b>{a.icao} {a.reportType === 'SPECI' ? 'SPECI' : 'METAR'}</b></span>
                <span className="bv-current-tac-meta">{a.observationTime && <Caption1 style={{ color: 'var(--text-3)' }}>{formatBriefingTime(a.observationTime, tz)}</Caption1>}<CatBadge category={a.category} /></span>
              </div>
              <code className="bv-current-tac-raw">{metarTacSegments(a).map((segment, i) => <span key={i} className={segment.className}>{segment.text}</span>)}</code>
              {(a.role === 'departure' || a.amos || a.source) && (
                <details className="bv-current-tac-detail">
                  <summary>상세 관측·예보</summary>
                  {amosExpansion(a)}
                </details>
              )}
            </article>
          ))}
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
                  <tr className="bv-cur-row" onClick={() => toggleRole(a.role)}>
                    <td>
                      <div className="bv-cur-airport">
                        <span className="bv-cur-role"><Badge appearance="tint" color="informative">{roleLabel(a.role)}</Badge> <b>{a.icao}</b></span>
                        {a.observationTime && (
                          <Caption1 style={{ color: 'var(--text-3)' }}>
                            {formatBriefingTime(a.observationTime, tz)}
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

  const currentMobile = (
    <section data-bvid="current" className="bv-section">
      <Card>
        <Subtitle2 as="h3">② 현재 실황</Subtitle2>
        <TabList selectedValue={activeAirportObj?.role} onTabSelect={(_, d) => setActiveAirport(d.value)} size="small">
          {airports.map((a) => <Tab key={a.role} value={a.role}>{a.icao}</Tab>)}
        </TabList>
        {activeAirportObj && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 4px' }}>
              <Body1><b>{activeAirportObj.icao}</b> <Caption1 style={{ color: 'var(--text-3)' }}>{roleLabel(activeAirportObj.role)}</Caption1></Body1>
              <CatBadge category={activeAirportObj.category} />
            </div>
            <Table size="small" style={{ width: '100%' }}>
              <TableBody>
                {FIELDS.map(([label, key]) => {
                  const f = activeAirportObj.fields[key]
                  return (
                    <TableRow key={key}>
                      <TableCell><Caption1 style={{ color: 'var(--text-3)' }}>{label}</Caption1></TableCell>
                      <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: f?.flag ? 'var(--level-red)' : undefined, fontWeight: 700 }}>{f?.text ?? '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        )}
      </Card>
    </section>
  )

  const legs = sections.enroute?.legs ?? []
  const enroute = sections.enroute && (
    <section data-bvid="enroute" className="bv-section">
      <Card>
        <Subtitle2 as="h3">④ 노선·공역</Subtitle2>
        <Body1>계획고도 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{sections.enroute.plannedCruiseAltitudeFt}ft</b></Body1>
        {sections.enroute.encounters.length === 0
          ? <Body1 style={{ color: 'var(--text-3)' }}>계획고도에서 조우하는 위험 없음</Body1>
          : sections.enroute.encounters.map((h, i) => (
              <Body1 key={i}>
                <b>{phenomenonKo(h.code) || h.label}</b>
                {phenomenonKo(h.code) && h.code ? <Caption1 style={{ color: 'var(--text-3)' }}> ({h.code})</Caption1> : null}
                {h.bandFt ? ` ${h.bandFt.lowFt}–${h.bandFt.highFt}ft` : ''} · {h.routeIntervalNm.startNm}–{h.routeIntervalNm.endNm}NM
              </Body1>
            ))}
        {sections.enroute.model?.elements?.length > 0 && (
          <div className="bv-ribbon-legend" aria-label="난기류 강도 범례">
            <span><i style={{ background: 'var(--turb-mod)' }} />중(MOD)</span>
            <span><i style={{ background: 'var(--level-red)' }} />심(SEV)</span>
          </div>
        )}
        {sections.enroute.model?.elements?.length > 0 && (
          <div className="bv-ribbons">
            {sections.enroute.model.elements.map((el, i) => {
              const total = sections.enroute.model.totalDistanceNm || 1
              const worst = worstInterval(el.intervals)
              return (
                <div key={i} className="bv-ribbon-row">
                  <div className="bv-ribbon-head">
                    <span className="bv-ribbon-label">{el.label}</span>
                    {worst && <span className="bv-ribbon-cap">{worst.level} {worst.startNm}–{worst.endNm}NM</span>}
                  </div>
                  <div className="bv-ribbon">
                    {el.intervals.map((iv, j) => (
                      <span key={j} className={`bv-seg ${iv.level === '심' ? 'sev' : 'mod'}`}
                        style={{ left: `${Math.max(0, (iv.startNm / total) * 100)}%`, width: `${Math.max(1.5, ((iv.endNm - iv.startNm) / total) * 100)}%` }}
                        title={`${iv.level} ${iv.startNm}–${iv.endNm}NM`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {/* 연직단면도가 리본(착빙·난류 구간 막대) 바로 아래에 온다 — 둘 다 같은 경로 거리축을
            쓰므로 세로로 붙여야 "이 막대 구간이 단면도의 어디"인지 눈으로 이어진다.
            NAVLOG는 웨이포인트 단위라 축이 달라 그 아래로 내린다. */}
        {(verticalProfile || sections.enroute.crossSectionAvailable) && (
          <section className="bv-leg-briefing" aria-label="연직단면도">
            <div className="bv-leg-head">
              <div>
                <Subtitle2 as="h4">연직단면도</Subtitle2>
                <Caption1 className="bv-leg-sub">경로를 따라 자른 고도 단면 · 레이어로 표시 항목을 켜고 끕니다</Caption1>
              </div>
              <ForecastHourNav crossSection={crossSection} onSelect={onSelectForecastHour} loading={crossSectionHourLoading} />
            </div>
            {verticalProfile && (
              <>
                <CrossSectionToggles layers={xLayers} onToggle={toggleXLayer} />
                <div className={`bv-xsection${isMobile ? ' bv-xsection-scroll' : ''}`}>
                  <VerticalProfileChart profile={verticalProfile} crossSection={crossSection} layers={xLayers} advisories={advisories} highlightRangeNm={activeLeg} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} />
                </div>
              </>
            )}
            {sections.enroute.crossSectionAvailable && (isMobile ? verticalProfile : onOpenProfile) && (
              <Button appearance="secondary" size="small" onClick={isMobile ? () => setXsectionFull(true) : onOpenProfile}>단면도 크게 열기</Button>
            )}
          </section>
        )}
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
      return items.length ? { role, icao: items[0].airportIcao, items } : null
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
          <Subtitle2 as="h3">⑤ 경로·공항 NOTAM</Subtitle2>
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
              <div className="bv-notam-grouphead">{roleLabel(g.role)} 공항 {g.icao} <span className="dim">{criticalItems.length > 0 ? '필수 확인 ' + criticalItems.length : g.items.length}</span></div>
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
  const CAT3_LEGEND = [['VFR', 'green'], ['IFR', 'amber'], ['LIFR', 'red']]
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
  const periodTypeLabel = (t) => (t === 'base' ? 'base' : t.replace('_', ' '))
  const tzSuffix = tz === 'KST' ? 'KST' : 'Z'
  // 기간 표시(간결): 같은 날이면 "MM/DD HH:MM–HH:MM", 넘어가면 "MM/DD HH:MM → MM/DD HH:MM", 끝에 tz 표기.
  const kstParts = (iso) => {
    const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null
    const d = new Date(ms + (tz === 'UTC' ? 0 : 9 * 3600000)); const q = (n) => String(n).padStart(2, '0')
    return { date: `${q(d.getUTCMonth() + 1)}/${q(d.getUTCDate())}`, time: `${q(d.getUTCHours())}:${q(d.getUTCMinutes())}` }
  }
  const fmtPeriod = (start, end) => {
    const a = kstParts(start); const b = kstParts(end); if (!a || !b) return ''
    return (a.date === b.date ? `${a.date} ${a.time}–${b.time}` : `${a.date} ${a.time} → ${b.date} ${b.time}`) + ` ${tzSuffix}`
  }
  // 필드 위험 하이라이트 — ② 현재 실황과 동일(백엔드 levels 재사용)
  const destCellStyle = (lvl) => ({ fontVariantNumeric: 'tabular-nums', color: lvl === 'red' ? 'var(--level-red)' : undefined, fontWeight: lvl === 'red' ? 700 : undefined })

  const destination = (
    <section data-bvid="destination" className="bv-section">
      <Card>
        <Subtitle2 as="h3">{destNum} 목적지 예보</Subtitle2>
        {!dest.sourceTaf ? <Body1 style={{ color: 'var(--text-3)' }}>TAF 없음</Body1> : (
          <>
            <EnhancedTafTab taf={dest.sourceTaf} icao={dest.icao} eta={meta.eta} forceCompact />
            <div className="bv-dest-legacy">
            <div className="bv-dest-head">
              <CatBadge category={dest.category} />
              <b style={{ fontSize: 'var(--fs-400)' }}>{dest.icao}</b>
              <Caption1 style={{ color: 'var(--text-3)' }}>도착 · ETA {formatBriefingTime(meta.eta, tz)}</Caption1>
            </div>
            {catBar(dest.timeline, dest.validity, dest.eta, true)}
            <div className="bv-tafbar-legend">
              {CAT3_LEGEND.map(([label, k]) => <span key={k}><i style={{ background: LEVEL_COLOR[k] }} />{label}</span>)}
              <span className="dim">시간대별 최악 범주 · {tzSuffix}</span>
            </div>
            {dest.etaOutOfRange && (
              <MessageBar intent="warning"><MessageBarBody>도착(ETA)이 이 TAF 유효기간 밖입니다 — 표시된 TAF는 도착 시각을 포함하지 않습니다(최신 TAF 확인 필요).</MessageBarBody></MessageBar>
            )}
            {dest.periods.length > 0 && (
              <Table size="small" className="bv-dest-periods" style={{ width: '100%' }}>
                <TableHeader><TableRow>
                  <TableHeaderCell style={{ width: '30%' }}>기간</TableHeaderCell><TableHeaderCell style={{ width: 52 }}>범주</TableHeaderCell>
                  <TableHeaderCell style={{ width: 52 }}>현상</TableHeaderCell><TableHeaderCell style={{ width: 92 }}>바람</TableHeaderCell>
                  <TableHeaderCell style={{ width: 64 }}>시정</TableHeaderCell><TableHeaderCell>운고</TableHeaderCell>
                </TableRow></TableHeader>
                <TableBody>
                  {dest.periods.map((p, i) => {
                    const hl = p.etaActive === true // ETA 시점의 지속조건/TEMPO (백엔드 계산)
                    const L = p.levels || {}
                    return (
                      <TableRow key={i} className={hl ? 'bv-dest-row-hl' : undefined}>
                        <TableCell data-label="기간" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: 'var(--text-2)' }}>{fmtPeriod(p.start, p.end)}</span>{' '}
                          <span className="bv-dest-ptype" data-type={p.type}>{p.type === 'base' ? 'base' : periodTypeLabel(p.type)}</span>
                          {hl ? <span className="bv-dest-eta-tag">ETA</span> : null}
                        </TableCell>
                        <TableCell data-label="범주"><CatBadge category={p.category} /></TableCell>
                        <TableCell data-label="현상" style={destCellStyle(L.wxLevel)}>{p.wx}</TableCell>
                        <TableCell data-label="바람" className="tnum" style={destCellStyle(L.windLevel)}>{p.wind}</TableCell>
                        <TableCell data-label="시정" className="tnum" style={destCellStyle(L.visLevel)}>{p.vis}</TableCell>
                        <TableCell data-label="운고" className="tnum" style={destCellStyle(L.ceilLevel)}>{p.clouds}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            {(dest.rawLines?.length || dest.raw) && (
              <details className="bv-rawwinds bv-dest-raw">
                <summary>원문 TAF</summary>
                <pre className="bv-dest-raw-pre">
                  {dest.rawLines?.length
                    ? dest.rawLines.map((ln, i) => (
                      <div key={i} className={ln.etaActive ? 'bv-dest-raw-eta' : undefined}>
                        {ln.text}{i === dest.rawLines.length - 1 ? '=' : ''}
                      </div>
                    ))
                    : dest.raw}
                </pre>
              </details>
            )}
            </div>
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
              <Caption1 style={{ color: 'var(--text-3)' }}>교체 · ETA {formatBriefingTime(meta.eta, tz)}</Caption1>
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
            {etdEtaLine && <Caption1 style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{etdEtaLine}</Caption1>}
            <BriefingBanner banner={briefing.banner} routeConflicts={routeConflicts} unresolved={unresolvedNotams} onJump={jumpTo} />
            {nav}{board}{layerAction}{adverse}{currentDesktop}<BriefingSynopsis />{enroute}{notamSection}{destination}
            <ForecasterInquiry snapshot={routeSnapshot} disabled={!routeSnapshot} />
          </div>
        </MobileSheet>
        {xsectionFull && verticalProfile && (
          <div className="bv-xfull" role="dialog" aria-label="단면도 전체화면" onClick={() => setXsectionFull(false)}>
            <div className="bv-xfull-rotate" onClick={(e) => e.stopPropagation()}>
              <div className="bv-xfull-toolbar">
                <div className="bv-xfull-toolbar-main">
                  <span className="bv-xfull-summary">연직단면도</span>
                  <CrossSectionToggles layers={xLayers} onToggle={toggleXLayer} compact inline />
                  <button type="button" className="bv-xfull-close" onClick={() => setXsectionFull(false)} aria-label="닫기">×</button>
                </div>
              </div>
              <VerticalProfileChart profile={verticalProfile} crossSection={crossSection} layers={xLayers} advisories={advisories} highlightRangeNm={pinnedLeg} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} metaTrailing={<ForecastHourNav crossSection={crossSection} onSelect={onSelectForecastHour} loading={crossSectionHourLoading} />} />
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
            <Button appearance="secondary" size="small" onClick={() => setExpanded((value) => !value)}>{expanded ? '지도와 함께 보기' : '전체 보기'}</Button>
            <Button appearance="secondary" size="small" onClick={onClose}>닫기</Button>
          </div>
        </div>
        <BriefingBanner banner={briefing.banner} routeConflicts={routeConflicts} unresolved={unresolvedNotams} onJump={jumpTo} />
        {nav}{board}{layerAction}{adverse}{currentDesktop}<BriefingSynopsis />{enroute}{notamSection}{destination}
        <ForecasterInquiry snapshot={routeSnapshot} disabled={!routeSnapshot} />
      </div>
    </div>
  )
}
