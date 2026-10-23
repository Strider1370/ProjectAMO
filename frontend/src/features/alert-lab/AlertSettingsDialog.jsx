import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import WatchManager from './WatchManager.jsx'

export default function AlertSettingsDialog({ onClose, ...props }) {
  const dialog = useRef(null)
  const close = useRef(null)
  useEffect(() => { close.current?.focus() }, [])
  function handleKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const targets = [...dialog.current.querySelectorAll('button, input, select, [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length)
    const first = targets[0], last = targets.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="ad-settings-backdrop">
    <section ref={dialog} className="ad-settings-dialog" role="dialog" aria-modal="true" aria-label="알림 설정" onKeyDown={handleKey}>
      <header className="ad-settings-heading"><h2>알림 설정</h2><button ref={close} aria-label="알림 설정 닫기" onClick={onClose}><X size={22} /></button></header>
      <div className="ad-settings-content"><WatchManager {...props} /></div>
    </section>
  </div>
}
