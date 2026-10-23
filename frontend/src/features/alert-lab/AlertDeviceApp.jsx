import { useEffect, useRef, useState } from 'react'
import { Bell, Plane, X, Settings } from 'lucide-react'
import RouteAlertPreview, { SigmetSummary } from './RouteAlertPreview.jsx'
import AirportEventPreview, { AirportEventSummary, airportEventLabel, airportEventAlertLabel, airportEventOpenLabel } from './AirportEventPreview.jsx'
import PhonePushPreview from './PhonePushPreview.jsx'
import AlertSettingsDialog from './AlertSettingsDialog.jsx'
import AirportObservation from './AirportObservation.jsx'
import { metricValue, metricRule } from './model.js'

const time = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
function AlertMetric({ metric, popup = false }) {
  const lower = ['미만', '이하'].includes(metric.direction)
  const state = metric.kind === 'event' ? '보고됨' : metric.value === metric.threshold ? '기준 도달' : lower ? '기준 미달' : '기준 초과'
  const direction = metric.kind === 'event' ? '' : metric.value === metric.threshold ? '=' : lower ? '↓' : '↑'
  return <span className={`ad-alert-metric${popup ? ' ad-popup-metric' : ''}`}>
    <span className="ad-alert-metric-line"><span className="ad-metric-label">{metric.label} </span><strong>{metricValue(metric)} <span aria-label={state}>{direction}</span></strong></span>
    <span className="ad-alert-metric-rule">기준 {metricRule(metric)}</span>
  </span>
}

export default function AlertDeviceApp({ phone, watches, history, popup, onAcknowledge, onDismiss, ...management }) {
  const [phoneUnlocked, setPhoneUnlocked] = useState(false)
  const [routeEvent, setRouteEvent] = useState(null)
  const [airportExample, setAirportExample] = useState(null)
  const [settings, setSettings] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  useEffect(() => { if (phone && popup && !settings) setPhoneUnlocked(false) }, [phone, popup?.id])
  const bell = useRef(null)
  const bellArea = useRef(null)
  const active = [...history.filter(item => item.type && !item.resolved && !item.ended), ...Object.entries(watches).flatMap(([icao, watch]) => {
    const events = history.filter(item => !item.type && item.icao === icao && !item.resolved && !item.ended)
    const metrics = [...new Map([...events].reverse().flatMap(item => item.metrics.filter(m => !item.resolvedKeys.includes(m.key))).map(m => [m.key, m])).values()]
    return metrics.length ? [{ ...events[0], icao, metrics, watch }] : []
  })]
  useEffect(() => {
    if (!bellOpen) return
    function dismiss(event) {
      if (event.type === 'keydown' && event.key === 'Escape') { setBellOpen(false); bell.current?.focus() }
      if (event.type === 'pointerdown' && !bellArea.current?.contains(event.target)) setBellOpen(false)
    }
    document.addEventListener('keydown', dismiss)
    document.addEventListener('pointerdown', dismiss)
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss) }
  }, [bellOpen])
  const [airportEvent, setAirportEvent] = useState(null)
  const [initialAirport] = useState(() => Object.keys(watches)[0] ?? 'RKSS')
  function closeSettings() { setSettings(false); requestAnimationFrame(() => bell.current?.focus()) }
  function openAirport(item) {
    setBellOpen(false)
    setSettings(false)
    setRouteEvent(item.type === 'route' ? item : null)
    setAirportExample(item.type && item.type !== 'route' ? item : null)
    setAirportEvent(item.type ? null : item)
    if (item.id) onAcknowledge(item.id)
  }
  if (phone && !phoneUnlocked) return <PhonePushPreview popup={popup} onDismiss={onDismiss} onOpenApp={() => setPhoneUnlocked(true)} onOpen={() => { setPhoneUnlocked(true); openAirport(popup) }} />
  return <div className={`ad-app ad-unified ${phone ? 'ad-mobile' : 'ad-desktop'}`}>
    {phone && <button className="ad-lock-return" onClick={() => setPhoneUnlocked(false)}>잠금화면 미리보기</button>}
    <header className="ad-header" inert={settings}><div className="ad-brand"><span className="ad-brand-mark"><Plane size={19} /></span><strong>ProjectAMO</strong></div>
      <div className="ad-bell-area" ref={bellArea}>
        <button ref={bell} className="ad-bell-button" aria-label={`알림 열기 · 진행 중 ${active.length}건`} aria-expanded={bellOpen} onClick={() => { setBellOpen(!bellOpen); onDismiss() }}><Bell size={22} />{active.length > 0 && <b>{active.length}</b>}</button>
        {bellOpen && <section className="ad-bell-popover" aria-label="현재 알림">
          <div className="ad-bell-heading"><strong>현재 알림 <span>{active.length}</span></strong><button aria-label="알림창 닫기" onClick={() => { setBellOpen(false); bell.current?.focus() }}><X size={18} /></button></div>
          <div className="ad-bell-items">{active.length ? active.map(item => <button className="ad-bell-item" key={item.type ? item.id : item.icao} onClick={() => openAirport(item)}>
            <span className="ad-alert-heading"><strong>{item.name} <small>{item.icao}</small></strong><time title="알림 발생 시각 · KST">{time(item.time)}</time></span>
            {item.type === 'route' ? <SigmetSummary event={item} /> : item.type ? <AirportEventSummary event={item} /> : item.metrics.map(metric => <AlertMetric key={metric.key} metric={metric} />)}
            {!item.type && (item.watch?.paused ? <small>감시 일시정지 · 해소 미확인</small> : item.metrics.some(m => ['unknown', 'off'].includes(item.watch?.states[m.key])) && <small>자료 없음 · 해소 미확인</small>)}
          </button>) : <p className="ad-bell-empty">진행 중인 알림이 없습니다.</p>}</div>
          <small className="ad-snapshot-caption">발생 당시 관측 · KST</small>
          <button className="ad-bell-settings" onClick={() => { setBellOpen(false); setSettings(true) }}><Settings size={18} />알림 설정</button>
        </section>}
      </div>
    </header>
    <div className="ad-body" inert={settings}><div className="ad-main">
      {routeEvent ? <RouteAlertPreview event={routeEvent} onBack={() => setRouteEvent(null)} /> : airportExample ? <AirportEventPreview event={airportExample} onBack={() => setAirportExample(null)} /> : <AirportObservation code={airportEvent?.icao ?? initialAirport} watch={watches[airportEvent?.icao ?? initialAirport]} event={airportEvent} />}
    </div></div>
    {settings && <AlertSettingsDialog watches={watches} onClose={closeSettings} {...management} />}
    {popup && !phone && !settings && <aside className="ad-notification ad-toast" role="alert" aria-label={popup.type === 'route' ? '새 비행경로 알림' : popup.type ? airportEventAlertLabel(popup.type) : '새 공항 알림'}>
      <button className="ad-notification-close" aria-label="팝업 닫기" onClick={onDismiss}><X size={18} /></button>
      <div className="ad-popup-header"><span>{popup.type === 'route' ? '비행경로 알림' : popup.type ? airportEventLabel(popup.type) : '공항 알림'}</span><time dateTime={new Date(popup.time).toISOString()} title="알림 발생 시각" aria-label={`알림 발생 시각 ${time(popup.time)} KST`}>{time(popup.time)} KST</time></div>
      <button className="ad-banner-open ad-compact-open" onClick={() => openAirport(popup)} aria-label={popup.type === 'route' ? '비행경로 보기' : popup.type ? airportEventOpenLabel(popup.type) : '공항 상세 보기'}>
        <span className="ad-alert-heading"><strong>{popup.name} <small>{popup.icao}</small></strong></span>
        {popup.type === 'route' ? <SigmetSummary event={popup} /> : popup.type ? <AirportEventSummary event={popup} /> : popup.metrics.map(metric => <AlertMetric key={metric.key} metric={metric} popup />)}
      </button>

    </aside>}
  </div>
}
