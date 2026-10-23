import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { AIRPORT_NAME_KO } from '../../../api/weatherApi.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { briefingTimeFields, formatBriefingTime } from '../lib/briefingTime.js'
import { formatFlightDuration } from '../lib/etaCalc.js'
import { formatAltitudeFt, summaryCallouts } from './mapBriefingModel.js'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const ROTATE_MS = 4000 // 요약 칸이 다음 위험으로 넘어가는 간격 — 진행 막대가 다 차면 넘어간다
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
  const [holding, setHolding] = useState(false) // 마우스를 올리거나 키보드 포커스가 있는 동안(마우스로 누른 포커스는 제외)
  const callout = callouts[index % count]
  useEffect(() => { setIndex(0) }, [summary])
  const auto = count > 1 && !reducedMotion()
  const current = index % count
  // 줄 바꿈 전환: 나가는 줄(leaving)을 잠깐 함께 그려 들어오는 줄과 겹쳐 지나가게 한다(애니메이션이 끝나면 지움).
  const prevRef = useRef(current)
  const [leaving, setLeaving] = useState(null)
  useLayoutEffect(() => { // 그리기 전에 — 새 줄이 애니메이션 없이 한 프레임 보이지 않게
    if (prevRef.current === current) return
    if (!reducedMotion()) setLeaving({ index: prevRef.current, id: Date.now() })
    prevRef.current = current
  }, [current])
  const leavingLine = leaving ? callouts[leaving.index] : null
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
      <div className={`mb-callout-wrap${count > 1 ? ' has-steps' : ''}`} onMouseEnter={() => setHolding(true)} onMouseLeave={() => setHolding(false)}
        onFocus={(event) => { if (event.target.matches?.(':focus-visible')) setHolding(true) }} onBlur={() => setHolding(false)}>
        <button type="button" className={`mb-callout is-${callout.tone}`} onClick={callout.item ? () => onSelectSummary?.(callout.item) : undefined} disabled={!callout.item}
          aria-label={count > 1 ? `위험 ${current + 1}/${count}: ${callout.title}, ${callout.detail}` : undefined}>
          <span className="mb-callout-stage">
            {leavingLine && <CalloutLine key={`out-${leaving.id}`} line={leavingLine} className="is-out" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setLeaving(null) }} />}
            <CalloutLine key={`in-${current}`} line={callout} className={leaving ? 'is-in' : undefined} />
          </span>
        </button>
        {count > 1 && (
          // 진행 막대: 칸 안 아래쪽 가는 줄, 위험 하나에 한 칸. 지금 칸이 다 차면 다음으로(누르면 그 위험으로). 멈춤은 칸 오른쪽 위.
          <>
          <div className={`mb-callout-steps${paused || holding ? ' is-held' : ''}`} role="group" aria-label="경로상 위험 넘기기" style={{ '--mb-rotate': `${ROTATE_MS}ms` }}>
            {callouts.map((line, i) => (
              <button key={i} type="button" className={i < current ? 'is-done' : i === current ? 'is-active' : undefined}
                onClick={() => setIndex(i)} aria-label={`위험 ${i + 1}/${count}: ${line.title}`} aria-current={i === current ? 'true' : undefined} title={line.title}>
                <i className={`is-${line.tone}`} onAnimationEnd={i === current && auto ? () => setIndex((n) => (n + 1) % count) : undefined}
                  key={i === current ? `run-${index}` : 'idle'} data-auto={auto ? 'on' : 'off'} />
              </button>
            ))}
          </div>
          <button type="button" className="mb-callout-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
            aria-label={paused ? '자동 넘김 다시 시작' : '자동 넘김 멈추기'} title={paused ? '자동 넘김 다시 시작' : '자동 넘김 멈추기'}>
            {paused ? <Play size={11} aria-hidden="true" /> : <Pause size={11} aria-hidden="true" />}
          </button>
          </>
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

// 요약 한 줄(배지 · 제목 · 구간과 시각). 강도 색은 줄마다 들고 있어 나가는 줄이 새 색으로 바뀌지 않는다.
function CalloutLine({ line, className, onAnimationEnd }) {
  return (
    <span className={`mb-callout-slide is-${line.tone}${className ? ` ${className}` : ''}`} onAnimationEnd={onAnimationEnd} aria-hidden={className === 'is-out' || undefined}>
      <span className="mb-callout-badge">{line.badge}</span>
      <span className="mb-callout-text">
        <b>{line.title}</b>
        <span>{line.detail}</span>
      </span>
    </span>
  )
}
