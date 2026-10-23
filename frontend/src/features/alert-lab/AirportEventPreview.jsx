import { ArrowLeft } from 'lucide-react'

const time = value => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(value)
const periodTime = value => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(value)

const EVENT_LABELS = {
  airport_warning: '공항경보', lightning: '낙뢰', taf_publication: 'TAF 발표',
  weather_phenomenon: 'METAR 특이기상',
}
export const airportEventLabel = type => EVENT_LABELS[type] ?? '공항 알림'
export const airportEventAlertLabel = type => type === 'airport_warning' ? '새 공항경보 알림'
  : type === 'lightning' ? '새 낙뢰 알림' : `새 ${airportEventLabel(type)} 알림`
export const airportEventOpenLabel = type => type === 'lightning' ? '낙뢰 정보 보기' : `${airportEventLabel(type)} 보기`
export const airportEventPanelLabel = type => type === 'lightning' ? '낙뢰 패널'
  : type === 'taf_publication' ? '공항 TAF 패널'
    : type === 'weather_phenomenon' ? '공항 METAR 패널' : '공항경보 패널'

export function AirportEventSummary({ event }) {
  if (event.type === 'taf_publication') return <span className="ad-airport-event-summary">
    <strong>{event.headline}</strong><span>TAF 전문 · 모의 자료</span>
    <code className="ad-taf-text">{event.tafText}</code>
    <small>발표 {time(event.time)} · 유효 {periodTime(event.validFrom)}–{periodTime(event.validTo)} KST</small>
  </span>
  if (event.headline) return <span className="ad-airport-event-summary">
    <strong>{event.headline}</strong><span>{event.summary}</span>
  </span>
  if (event.type === 'airport_warning') {
    return <span className="ad-airport-event-summary">
      <strong>{event.warningName} 발표</strong>
      <span>유효 {periodTime(event.validFrom)}–{periodTime(event.validTo)} KST</span>
    </span>
  }
  return <span className="ad-airport-event-summary">
    <strong>최근 {event.windowMinutes}분 낙뢰 {event.count}건</strong>
    <span>공항 반경 {event.radiusKm}km · 최근접 {event.nearestDistanceKm}km</span>
  </span>
}

export default function AirportEventPreview({ event, onBack }) {
  const tab = event.type === 'taf_publication' ? 'TAF' : event.type === 'weather_phenomenon' ? 'METAR' : null
  const note = event.type === 'taf_publication' ? '새 발표 사실과 TAF 전문을 보여주는 예시입니다. 이전 TAF보다 악화됐는지는 판정하지 않습니다.'
    : event.type === 'weather_phenomenon' ? 'METAR 현재 기상에 어는 비(FZRA)가 보고된 예시입니다.'
      : event.type === 'airport_warning' ? '공항경보의 종류와 유효 시각을 확인합니다.' : '공항 주변 낙뢰의 관측 범위와 건수를 확인합니다.'
  return <section className="ad-airport-event-panel" aria-label={airportEventPanelLabel(event.type)}>
    <button className="ad-back" onClick={onBack}><ArrowLeft size={20} />돌아가기</button>
    <span className="ad-kicker">{airportEventLabel(event.type)} · {time(event.time)} KST</span>
    <h1>{event.name}</h1>
    <p className="ad-management-note">{event.icao} · 실험실 예시</p>
    {tab && <div className="ad-observation-tab">{tab} <span>{event.type === 'taf_publication' ? '발표 정보' : '현재 관측'}</span></div>}
    <div className="ad-airport-event-card">
      <AirportEventSummary event={event} />
      <p>{note}</p>
    </div>
    <p className="ad-management-note">모의 자료입니다. 실제 관측·예보·경보 결과가 아닙니다.</p>
  </section>
}
