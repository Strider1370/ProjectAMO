import { X } from 'lucide-react'
import { AIRPORT_NAME_KO } from '../../../api/weatherApi.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { briefingTimeFields, formatBriefingTime } from '../lib/briefingTime.js'
import { formatFlightDuration } from '../lib/etaCalc.js'
import { formatAltitudeFt, summaryCallout } from './mapBriefingModel.js'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const shortName = (icao) => (AIRPORT_NAME_KO[icao] ?? icao ?? '').replace('국제공항', '').replace('공항', '')

// 지도 왼쪽 위 브리핑 패널. 위험 판단은 위험 막대가 맡고, 여기는 요약 한 줄만 둔다.
export default function MapBriefingPanel({ briefing, distanceNm, tasKt, onClose, onDocumentView, onSave, onEdit, onEnd, onSelectSummary }) {
  const { tz } = useTimeZone()
  const { meta, sections } = briefing
  const hhmm = (iso) => formatBriefingTime(iso, tz).replace(` ${tz}`, '').replace('Z', '')
  const fields = briefingTimeFields(meta.etd, tz)
  const weekday = WEEKDAY_KO[new Date(Date.UTC(fields.year, fields.month - 1, fields.day)).getUTCDay()]
  const cruise = sections.enroute?.plannedCruiseAltitudeFt
  const summary = sections.enroute?.ribbon?.summary
  const callout = summaryCallout(summary, hhmm)
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
      <button type="button" className={`mb-callout is-${callout.tone}`} onClick={summary?.top ? onSelectSummary : undefined} disabled={!summary?.top}>
        <span className="mb-callout-badge">{callout.badge}</span>
        <span className="mb-callout-text">
          <b>{callout.title}</b>
          <span>{callout.detail}</span>
        </span>
      </button>
      <div className="mb-panel-actions">
        <button type="button" className="mb-btn is-primary" onClick={onDocumentView}>문서형 보기</button>
        {onSave && <button type="button" className="mb-btn" onClick={onSave}>저장</button>}
        <button type="button" className="mb-btn" onClick={onEdit}>수정</button>
      </div>
      <button type="button" className="mb-end" onClick={onEnd}>브리핑 종료 · 경로 입력으로</button>
    </aside>
  )
}
