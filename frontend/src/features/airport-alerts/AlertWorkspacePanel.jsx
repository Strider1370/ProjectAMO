import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from '../notifications/useNotifications.js'
import AirportAlertInboxPage from './AirportAlertInboxPage.jsx'
import AirportAlertSettingsPage from './AirportAlertSettingsPage.jsx'
import AlertWatchesPage from './AlertWatchesPage.jsx'
import RouteAlertSettings from './RouteAlertSettings.jsx'
import useAlertWatches from './useAlertWatches.js'
import './alertWorkspacePanel.css'

// 알림 패널: 알림(진행 중·지난) → 감시 대상 → 공항 편집 / 경로 편집. 공항·경로의 종 버튼은 해당 편집 화면으로 바로 연다.
function firstView(initialView, airportIcao, routeId) {
  if (initialView !== 'settings') return { name: 'list' }
  if (routeId != null) return { name: 'route', routeId: Number(routeId) }
  if (airportIcao) return { name: 'airport', icao: airportIcao }
  return { name: 'watches' }
}

export default function AlertWorkspacePanel({ initialView = 'list', airportIcao, routeId, onClose, onLogin }) {
  const { user } = useAuth()
  const [view, setView] = useState(() => firstView(initialView, airportIcao, routeId))
  const watches = useAlertWatches(user)
  const { notifications } = useNotifications()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previousFocus = document.activeElement
    panelRef.current?.focus()
    const onKey = (event) => {
      if (document.querySelector('.auth-overlay')) return
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onCloseRef.current(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const controls = [...panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((node) => node.getClientRects().length > 0)
      if (!controls.length) { event.preventDefault(); panelRef.current.focus(); return }
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])
  // 편집 화면을 바꿀 때 스크롤을 맨 위로.
  useEffect(() => { panelRef.current?.querySelector('.aa-page')?.scrollTo?.(0, 0) }, [view])

  const watchCount = watches.airport.watches.length + watches.route.watches.length
  const toWatches = () => setView({ name: 'watches' })
  let body
  // 로그인 전에는 감시 대상·경로 화면 대신 로그인 안내(공항 편집 화면이 그 안내를 그린다).
  if (!user && view.name !== 'list') body = <AirportAlertSettingsPage initialIcao={view.icao} watches={watches} onBack={() => setView({ name: 'list' })} onClose={onClose} onLogin={onLogin} />
  else if (view.name === 'airport') body = <AirportAlertSettingsPage key={view.icao} initialIcao={view.icao} watches={watches} onBack={toWatches} onClose={onClose} onLogin={onLogin} />
  else if (view.name === 'route') body = <RouteAlertSettings key={view.routeId} routeId={view.routeId} watches={watches} notifications={notifications} onBack={toWatches} onClose={onClose} />
  else if (view.name === 'watches') body = <AlertWatchesPage watches={watches} notifications={notifications} onBack={() => setView({ name: 'list' })} onClose={onClose}
    onEditAirport={(icao) => setView({ name: 'airport', icao })} onEditRoute={(id) => setView({ name: 'route', routeId: id })} />
  else body = <AirportAlertInboxPage embedded watchCount={watchCount} onSettings={toWatches} onClose={onClose} onLogin={onLogin} />
  return <div className="alert-workspace-shade"><section ref={panelRef} tabIndex={-1} className="alert-workspace" role="dialog" aria-modal="true" aria-label="알림 관리">
    {body}
  </section></div>
}
