import { useState } from 'react'
import { BellRing, Check, Settings2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import usePersonalSettings from '../personal/usePersonalSettings.js'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import useNotifications from '../notifications/useNotifications.js'
import { formatNotification } from '../notifications/notificationFormat.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import AlertCard from './AlertCard.jsx'
import './airportAlerts.css'

// 알림 패널 첫 화면: 진행 중 / 지난 알림. 알림마다 무엇이 일어났는지를 제목으로 크게, 대상·시각은 작게.
export default function AirportAlertInboxPage({ embedded = false, watchCount = null, onSettings, onClose, onLogin }) {
  const { user, loading } = useAuth()
  const { tz } = useTimeZone()
  const { pushEnabled } = usePersonalSettings()
  const isMobile = useIsMobile()
  const { notifications, markRead, markAllRead } = useNotifications()
  const [section, setSection] = useState('active')
  const userAlerts = notifications.filter((item) => ['airport', 'route', 'organization'].includes(item.source))
  const shown = userAlerts.filter((item) => section === 'active' ? item.active : !item.active)
  const fresh = shown.filter((item) => !item.readAt)
  const read = shown.filter((item) => item.readAt)
  const userUnread = userAlerts.filter((item) => !item.readAt).length
  if (!loading && !user) return <main className="aa-page"><div className="aa-shell"><button type="button" onClick={onClose}>← 지도</button><h1>알림</h1><p>알림을 보려면 로그인하세요.</p><button type="button" onClick={onLogin}>로그인</button></div></main>
  async function open(item) {
    await markRead(item.id)
    if (item.source === 'organization') window.location.assign(`/lounge/${encodeURIComponent(item.organizationId)}/alerts/${encodeURIComponent(item.id.slice(13))}`)
    else window.location.assign(`/?alert=${encodeURIComponent(item.id)}`)
  }
  const card = (item) => item.source === 'organization'
    ? <article key={item.id} className="aa-card"><div className="aa-card-top"><span className="aa-kind">기관 알림</span></div>
      <div className="aa-card-head"><div className="aa-card-title"><strong>{item.routeName}</strong><span>{formatNotification(item)}</span></div></div>
      <div className="aa-card-foot"><span /><button type="button" className="aa-open" onClick={() => open(item)}>보기</button></div></article>
    : <AlertCard key={item.id} item={item} tz={tz} onOpen={open} />
  return <main className="aa-page"><div className="aa-shell">
    <header className="aa-head">
      <BellRing size={20} aria-hidden="true" />
      <h1>알림</h1>
      {embedded
        ? <button type="button" className="aa-head-link" onClick={onSettings}><Settings2 size={16} aria-hidden="true" />감시 대상{watchCount != null ? ` ${watchCount}` : ''}</button>
        : <a className="aa-head-link" href="/alerts/settings"><Settings2 size={16} aria-hidden="true" />감시 대상</a>}
      {embedded && <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>}
    </header>
    <div className="aa-inbox-bar">
      <div className="aa-inbox-tabs" role="tablist" aria-label="알림 상태">
        <button type="button" role="tab" aria-selected={section === 'active'} onClick={() => setSection('active')}>진행 중 {userAlerts.filter((item) => item.active).length}</button>
        <button type="button" role="tab" aria-selected={section === 'history'} onClick={() => setSection('history')}>지난 알림</button>
      </div>
      {userUnread > 0 && <button type="button" className="aa-text-button" onClick={markAllRead}>모두 읽음</button>}
    </div>
    <p className={`aa-recv${isMobile && pushEnabled ? ' is-on' : ''}`}>{isMobile && pushEnabled ? <Check size={15} aria-hidden="true" /> : <BellRing size={15} aria-hidden="true" />}
      <span>{!isMobile ? '이 화면에서는 웹 팝업으로 받습니다 · 휴대폰 푸시는 휴대폰에서 켭니다'
        : pushEnabled ? '이 휴대폰으로 푸시 받는 중' : '이 휴대폰의 푸시가 꺼져 있습니다'}</span>
      {embedded && <button type="button" className="aa-text-button" onClick={onSettings}>받는 방법</button>}</p>
    {!shown.length && <p className="aa-empty">{section === 'active' ? '진행 중인 알림이 없습니다.' : '지난 알림이 없습니다.'}</p>}
    {fresh.length > 0 && <section className="aa-list" aria-label="새 알림"><h2 className="aa-list-title">새 알림 {fresh.length}</h2>{fresh.map(card)}</section>}
    {read.length > 0 && <section className="aa-list" aria-label="읽은 알림"><h2 className="aa-list-title">읽음 {read.length}</h2>{read.map(card)}</section>}
  </div></main>
}
