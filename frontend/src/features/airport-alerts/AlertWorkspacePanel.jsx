import { useEffect, useRef, useState } from 'react'
import AirportAlertInboxPage from './AirportAlertInboxPage.jsx'
import AirportAlertSettingsPage from './AirportAlertSettingsPage.jsx'
import './alertWorkspacePanel.css'

export default function AlertWorkspacePanel({ initialView = 'list', airportIcao, routeId, onClose, onLogin }) {
  const [view, setView] = useState(initialView)
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
  return <div className="alert-workspace-shade"><section ref={panelRef} tabIndex={-1} className="alert-workspace" role="dialog" aria-modal="true" aria-label="알림 관리">
    {view === 'settings'
      ? <AirportAlertSettingsPage embedded initialIcao={airportIcao} initialRouteId={routeId} onBack={() => setView('list')} onClose={onClose} onLogin={onLogin} />
      : <AirportAlertInboxPage embedded onSettings={() => setView('settings')} onClose={onClose} onLogin={onLogin} />}
  </section></div>
}
