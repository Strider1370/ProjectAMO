import { BellRing, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from '../notifications/useNotifications.js'
import { formatNotification, relTime } from '../notifications/notificationFormat.js'
import './airportAlerts.css'

export default function AirportAlertInboxPage({ embedded = false, onSettings, onClose, onLogin }) {
  const { user, loading } = useAuth()
  const { notifications, markRead, markAllRead } = useNotifications()
  const [section, setSection] = useState('active')
  const userAlerts = notifications.filter((item) => ['airport', 'route', 'organization'].includes(item.source))
  const shown = userAlerts.filter((item) => section === 'active' ? item.active : !item.active)
  const userUnread = userAlerts.filter((item) => !item.readAt).length
  if (!loading && !user) return <main className="aa-page"><div className="aa-shell"><button type="button" onClick={onClose}>← 지도</button><h1>알림</h1><p>알림을 보려면 로그인하세요.</p><button type="button" onClick={onLogin}>로그인</button></div></main>
  async function open(item) {
    await markRead(item.id)
    if (item.source === 'airport') window.location.assign(`/?alert=${encodeURIComponent(item.id)}`)
    else if (item.source === 'route') window.location.assign(`/?alert=${encodeURIComponent(item.id)}`)
    else if (item.source === 'organization') window.location.assign(`/lounge/${encodeURIComponent(item.organizationId)}/alerts/${encodeURIComponent(item.id.slice(13))}`)
    else if (item.routeId != null) window.location.assign(`/?flight=${item.routeId}`)
  }
  return <main className="aa-page"><div className="aa-shell"><header className="aa-page-head">{embedded ? <button type="button" onClick={onClose}>← 지도</button> : <a href="/">← 지도</a>}<div><p>ProjectAMO</p><h1>알림</h1><span>현재 발생한 알림과 지난 이력을 확인합니다.</span></div>{embedded ? <button type="button" className="aa-settings-link" onClick={onSettings}><Settings2 size={17} /> 알림 설정</button> : <a className="aa-settings-link" href="/alerts/settings"><Settings2 size={17} /> 알림 설정</a>}{embedded && <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>}</header>
    <div className="aa-inbox-head"><div className="aa-inbox-tabs" role="tablist" aria-label="알림 상태"><button type="button" role="tab" aria-selected={section === 'active'} onClick={() => setSection('active')}>진행 중 {userAlerts.filter((item) => item.active).length}</button><button type="button" role="tab" aria-selected={section === 'history'} onClick={() => setSection('history')}>지난 알림</button></div>{userUnread > 0 && <button type="button" onClick={markAllRead}>모두 읽음</button>}</div>
    <div className="aa-inbox">{shown.length ? shown.map((item) => <button key={item.id} type="button" className="aa-inbox-item" onClick={() => open(item)}><BellRing size={19} /><span><strong>{item.routeName || '알림'}<small> · {item.active ? '진행 중' : '종료'}</small></strong><span>{formatNotification(item)}</span><small>{relTime(item.detectedAt)}{!item.readAt && ' · 새 알림'}</small></span></button>) : <p className="aa-empty">{section === 'active' ? '진행 중인 알림이 없습니다.' : '지난 알림이 없습니다.'}</p>}</div>
  </div></main>
}
