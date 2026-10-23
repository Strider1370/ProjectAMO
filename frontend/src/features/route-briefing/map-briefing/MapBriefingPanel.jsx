import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'
import { AIRPORT_NAME_KO } from '../../../api/weatherApi.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { briefingTimeFields, formatBriefingTime } from '../lib/briefingTime.js'
import { formatFlightDuration } from '../lib/etaCalc.js'
import { formatAltitudeFt, summaryCallouts } from './mapBriefingModel.js'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const ROTATE_MS = 4000 // 요약 칸이 다음 위험으로 넘어가는 간격
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const shortName = (icao) => (AIRPORT_NAME_KO[icao] ?? icao ?? '').replace('국제공항', '').replace('공항', '')

// 지도 왼쪽 위 브리핑 패널. 위험 판단은 위험 막대가 맡고, 여기는 요약 한 줄 — 내 고도의 위험을 경로 순서로 차례로 넘겨 보여 준다.
// cardsAllCollapsed·onToggleAllCards: 공항 카드 모두 접기/펼치기(지도를 넓게 보고 싶을 때 한 번에).
export default function MapBriefingPanel({ briefing, distanceNm, tasKt, onClose, onDocumentView, onSave, onEdit, onEnd, onSelectSummary, cardsAllCollapsed = false, onToggleAllCards }) {
  const { tz } = useTimeZone()
  const { meta, sections } = briefing
  const hhmm = (iso) => formatBriefingTime(iso, tz).replace(` ${tz}`, '').replace('Z', '')
  const fields = briefingTimeFields(meta.etd, tz)
  const weekday = WEEKDAY_KO[new Date(Date.UTC(fields.year, fields.month - 1, fields.day)).getUTCDay()]
  const cruise = sections.enroute?.plannedCruiseAltitudeFt
  const summary = sections.enroute?.ribbon?.summary
  const callouts = summaryCallouts(summary, hhmm)
  const count = callouts.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false) // 사용자가 멈춘 것
  const [holding, setHolding] = useState(false) // 마우스를 올리거나 포커스가 있는 동안
  const callout = callouts[index % count]
  useEffect(() => { setIndex(0) }, [summary])
  useEffect(() => {
    if (count < 2 || paused || holding || reducedMotion()) return undefined
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => window.clearInterval(id)
  }, [count, paused, holding])
  const step = (delta) => setIndex((i) => (i + delta + count) % count)
  const duration = formatFlightDuration(distanceNm, tasKt)

  return (
    <aside className="mb-panel" aria-label="비행 전 브리핑">
      <div className="mb-panel-top">
        <span className="mb-eyebrow">비행 전 브리핑</span>
        <button type="button" className="mb-icon-btn" aria-label="패널 닫기" title="패널 닫기 (상단 브리핑 버튼과 같음)" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="mb-panel-route">
        <strong>{meta.departureAirport} → {meta.arrivalAirport}</strong>
        <span className={`mb-rule is-${String(meta.flightRule).toLowerCase()}`}>{meta.flightRule}</span>
      </div>
      <p className="mb-panel-sub">
        {shortName(meta.departureAirport)} → {shortName(meta.arrivalAirport)}
        {meta.alternateAirport ? ` · 교체 ${shortName(meta.alternateAirport)}` : ''}
        {` · ${fields.month}월 ${fields.day}일(${weekday})`}
      </p>
      <dl className="mb-panel-stats">
        <div><dt>ETD</dt><dd>{hhmm(meta.etd)}</dd></div>
        <div><dt>ETA</dt><dd>{hhmm(meta.eta)}</dd></div>
        <div><dt>순항</dt><dd>{formatAltitudeFt(cruise) ?? '—'}</dd></div>
      </dl>
      <p className="mb-panel-line">
        {Number.isFinite(distanceNm) && distanceNm > 0 ? `${Math.round(distanceNm)}NM` : '거리 —'}
        {duration ? ` · ${duration}` : ''}
        {tasKt ? ` · TAS ${tasKt}kt` : ''}
        {` · ${tz}`}
      </p>
      <div className="mb-callout-wrap" onMouseEnter={() => setHolding(true)} onMouseLeave={() => setHolding(false)}
        onFocus={() => setHolding(true)} onBlur={() => setHolding(false)}>
        <button type="button" className={`mb-callout is-${callout.tone}`} onClick={callout.item ? () => onSelectSummary?.(callout.item) : undefined} disabled={!callout.item}
          aria-label={count > 1 ? `위험 ${index % count + 1}/${count}: ${callout.title}, ${callout.detail}` : undefined}>
          <span className="mb-callout-badge">{callout.badge}</span>
          <span className="mb-callout-text">
            <b>{callout.title}</b>
            <span>{callout.detail}</span>
          </span>
        </button>
        {count > 1 && (
          <div className="mb-callout-nav" role="group" aria-label="경로상 위험 넘기기">
            <button type="button" onClick={() => step(-1)} aria-label="이전 위험" title="이전 위험"><ChevronLeft size={14} aria-hidden="true" /></button>
            <span>{index % count + 1} / {count}</span>
            <button type="button" onClick={() => step(1)} aria-label="다음 위험" title="다음 위험"><ChevronRight size={14} aria-hidden="true" /></button>
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? '자동 넘김 켜기' : '자동 넘김 멈추기'} title={paused ? '자동 넘김 켜기' : '자동 넘김 멈추기'} aria-pressed={paused}>
              {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
      <div className="mb-panel-actions">
        <button type="button" className="mb-btn is-primary" onClick={onDocumentView}>문서형 보기</button>
        {onSave && <button type="button" className="mb-btn" onClick={onSave}>저장</button>}
        <button type="button" className="mb-btn" onClick={onEdit}>수정</button>
      </div>
      <div className="mb-panel-links">
        {onToggleAllCards && <button type="button" className="mb-end" onClick={onToggleAllCards}>{cardsAllCollapsed ? '공항 카드 모두 펼치기' : '공항 카드 모두 접기'}</button>}
        <button type="button" className="mb-end" onClick={onEnd}>브리핑 종료 · 경로 입력으로</button>
      </div>
    </aside>
  )
}
