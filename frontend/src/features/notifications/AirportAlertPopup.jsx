import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from './useNotifications.js'
import { formatNotification } from './notificationFormat.js'
import AlertCard from '../airport-alerts/AlertCard.jsx'
import '../airport-alerts/airportAlerts.css'
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
  // 가장 최근 1건을 카드로 펼치고 나머지는 "외 N건" 한 줄로 접는다.
  const [first, ...rest] = events
  async function open(event) {
    // 상세는 같은 화면 위에 띄운다(App의 open-alert-detail). 페이지를 다시 불러오면 지도에서 보던 상태가 사라진다.
    if (event.test) { setEvents(null); window.dispatchEvent(new CustomEvent('open-alert-detail', { detail: { testId: String(event.testId) } })); return }
    if (event.source === 'organization') { await markRead(event.id); window.location.assign(`/lounge/${encodeURIComponent(event.organizationId)}/alerts/${encodeURIComponent(event.id.slice(13))}`); return }
    if (!event.preview) { await markRead(event.id); setEvents(null); window.dispatchEvent(new CustomEvent('open-alert-detail', { detail: { eventId: event.id } })); return }
    window.location.assign('/alerts')
  }
  async function read() {
    if (!first.test && !first.preview) await markRead(first.id)
    if (rest.length) setEvents(rest); else setEvents(null)
  }
  return <aside className="airport-alert-toast" role="alert" aria-label={first.source === 'route' ? '새 경로 알림' : first.source === 'organization' ? '새 기관 알림' : '새 공항 알림'}>
    <button type="button" className="airport-alert-toast-close" aria-label="알림 닫기" onClick={() => setEvents(null)}><X size={17} /></button>
    {first.source === 'organization'
      ? <div className="aa-card is-compact"><div className="aa-card-top"><span className="aa-kind">기관 알림</span><span className="aa-when">{clock(first.detectedAt, tz)} {tz}</span></div>
        <div className="aa-card-head"><div className="aa-card-title"><strong>{first.routeName}</strong><span>{formatNotification(first)}</span></div></div></div>
      : <AlertCard item={first} tz={tz} compact />}
    <div className="airport-alert-toast-actions">
      <button type="button" className="aa-open" onClick={() => open(first)}>{first.test ? '시험 내용 보기' : '보기'}</button>
      {!first.test && <button type="button" onClick={read}>읽음</button>}
    </div>
    {rest.length > 0 && <button type="button" className="airport-alert-toast-more" onClick={() => window.dispatchEvent(new CustomEvent('open-alert-panel', { detail: { view: 'list' } }))}>외 {rest.length}건 · 알림 목록에서 보기</button>}
  </aside>
}
