import { LockKeyhole, Plane, X } from 'lucide-react'
import { SigmetSummary } from './RouteAlertPreview.jsx'
import { AirportEventSummary, airportEventLabel, airportEventAlertLabel, airportEventOpenLabel } from './AirportEventPreview.jsx'
import { metricValue, metricRule } from './model.js'

export default function PhonePushPreview({ popup, onOpen, onDismiss, onOpenApp }) {
  const now = popup?.time ?? Date.now()
  const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(now)
  return <div className="ad-app ad-mobile ad-lockscreen">
    <div className="ad-lock-clock"><LockKeyhole size={21} aria-hidden="true" /><span>{date}</span><strong>{clock}</strong></div>
    <div className="ad-push-area">
      {popup ? <section className="ad-push-card" role="alert" aria-label={popup.type === 'route' ? '새 비행경로 알림' : popup.type ? airportEventAlertLabel(popup.type) : '새 공항 알림'}>
        <button className="ad-push-dismiss" aria-label="팝업 닫기" onClick={onDismiss}><X size={17} /></button>
        <div className="ad-popup-header ad-push-source"><span className="ad-push-icon"><Plane size={16} /></span><strong>ProjectAMO</strong><time dateTime={new Date(popup.time).toISOString()}>{clock} KST</time></div>
        <button className="ad-push-open" aria-label={popup.type === 'route' ? '비행경로 보기' : popup.type ? airportEventOpenLabel(popup.type) : '공항 알림 상세 보기'} onClick={onOpen}>
          <strong>{popup.type === 'route' ? '비행경로 알림' : popup.type ? airportEventLabel(popup.type) : '공항 알림'} · {popup.name}</strong>
          <span className="ad-push-airport ad-popup-airport">
            {popup.type === 'route' ? <SigmetSummary event={popup} /> : popup.type ? <AirportEventSummary event={popup} /> : popup.metrics.map(metric => <span className="ad-popup-metric" key={metric.key}>{metric.label} {metricValue(metric)} · 기준 {metricRule(metric)}</span>)}
          </span>
        </button>
      </section> : <p className="ad-push-empty">수신한 알림이 없습니다</p>}
    </div>
    <div className="ad-lock-footer"><p>푸시 미리보기 · 실제 발송 아님</p><small>OS에 따라 표시 모양이 달라집니다.</small><button onClick={onOpenApp}>웹앱 열기</button></div>
  </div>
}
