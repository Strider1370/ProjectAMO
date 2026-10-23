import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from './useNotifications.js'
import { formatNotification } from './notificationFormat.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import './NotificationCenter.css'

const clock = (value, tz) => new Intl.DateTimeFormat('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))

export default function AirportAlertPopup() {
  const { user } = useAuth()
  const { tz } = useTimeZone()
  const isMobile = useIsMobile()
  const { notifications, initialized, markRead } = useNotifications({ pollMs: isMobile ? 60_000 : 15_000 })
  const seen = useRef(null)
  const [events, setEvents] = useState(null)

  useEffect(() => {
    if (!user) { seen.current = null; setEvents(null); return }
    if (!initialized) return
    const ids = new Set(notifications.map((item) => item.id))
    if (seen.current) {
      const arrived = notifications.filter((item) => ['airport', 'route', 'organization'].includes(item.source) && !item.readAt
        && item.payload?.popupEnabled !== false && !seen.current.has(item.id))
      if (arrived.length) setEvents(arrived)
    }
    seen.current = ids
  }, [notifications, user, initialized])

  useEffect(() => {
    const showPreview = (event) => setEvents([event.detail])
    window.addEventListener('airport-alert-preview', showPreview)
    return () => window.removeEventListener('airport-alert-preview', showPreview)
  }, [])

  if (isMobile || !events?.length) return null
  const single = events.length === 1 ? events[0] : null
  const targetCount = new Set(events.map((event) => event.airportIcao ?? `route:${event.routeId ?? event.id}`)).size
  async function open() {
    if (single?.test) { window.location.assign(`/?alertTest=${encodeURIComponent(single.testId)}`); return }
    if (single?.source === 'organization') { await markRead(single.id); window.location.assign(`/lounge/${encodeURIComponent(single.organizationId)}/alerts/${encodeURIComponent(single.id.slice(13))}`); return }
    if (single && !single.preview) { await markRead(single.id); window.location.assign(`/?alert=${encodeURIComponent(single.id)}`); return }
    window.location.assign('/alerts')
  }
  return <aside className="airport-alert-toast" role="alert" aria-label={single?.source === 'route' ? '새 경로 알림' : single?.source === 'organization' ? '새 기관 알림' : '새 공항 알림'}>
    <div className="airport-alert-toast-head"><span>{single?.test ? '테스트 · 모의 자료' : single?.source === 'route' ? '경로 알림' : single?.source === 'organization' ? '기관 알림' : `공항 알림${single?.preview ? ' · 미리보기' : ''}`}</span><time dateTime={events[0].detectedAt}>{clock(events[0].detectedAt, tz)} {tz}</time><button type="button" aria-label="알림 닫기" onClick={() => setEvents(null)}><X size={17} /></button></div>
    <button type="button" className="airport-alert-toast-body" onClick={open}>
      <strong>{single ? single.routeName : targetCount === 1 ? `${events[0].routeName} · 새 알림 ${events.length}건` : `${targetCount}개 대상에 새 알림`}</strong>
      {single?.type === 'metar' ? <span className="airport-alert-toast-metrics">{single.payload.metrics.map((metric) => <span key={metric.key}><span>{metric.label}</span><b>{metric.direction === 'event' ? '관측' : `${metric.value}${metric.unit}`}</b><small>{metric.direction === 'event' ? '' : `기준 ${metric.threshold}${metric.unit} ${metric.direction === 'below' ? '미만' : '이상'}`}</small></span>)}</span>
        : single?.type === 'taf' ? <span className="airport-alert-toast-summary"><strong>{single.payload.reportType === 'AMD' ? 'TAF AMD' : '새 TAF'} · 유효 {single.payload.validFrom} – {single.payload.validTo}</strong><pre className="airport-alert-toast-report">{single.payload.text}</pre></span>
          : single ? <span className="airport-alert-toast-summary">{formatNotification(single)}</span>
          : <span className="airport-alert-toast-summary">{events.slice(0, 3).map((event) => `${targetCount === 1 ? '' : `${event.routeName} `}${formatNotification(event)}`).join(' · ')}{events.length > 3 ? ` 외 ${events.length - 3}건` : ''}</span>}
      <small className="airport-alert-toast-link">{single?.test ? '시험 내용 보기 ↗' : single ? '알림 상세 보기 ↗' : '알림 목록 보기 ↗'}</small>
    </button>
  </aside>
}
