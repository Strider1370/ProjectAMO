import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { formatBriefingTime } from '../route-briefing/lib/briefingTime.js'

export function Button({ children, secondary = false, className = '', ...props }) {
  return <button type="button" className={`ol-button${secondary ? ' ol-button-secondary' : ''} ${className}`} {...props}>{children}</button>
}
export function Badge({ children, level = 'gray' }) { return <span className={`ol-badge ol-badge-${level}`}>{children}</span> }
export function EmptyState({ title, children, action }) { return <div className="ol-empty"><strong>{title}</strong>{children && <p>{children}</p>}{action}</div> }
export function Panel({ title, action, children, className = '' }) { return <section className={`ol-panel ${className}`}><header><h2>{title}</h2>{action}</header><div className="ol-panel-body">{children}</div></section> }
export function PageHeading({ title, description, action }) { return <div className="ol-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="ol-heading-actions">{action}</div>}</div> }
export function formatTime(value, tz, withDate = false) { return formatBriefingTime(value, tz, { withDate }) }
export function routeLabel(flight) {
  const form = flight?.snapshot?.base?.routeForm || {}
  return flight?.routeLabel || [form.departureAirport, form.arrivalAirport].filter(Boolean).join(' → ') || flight?.snapshot?.base?.routeString || '경로 정보 없음'
}
export function Dialog({ title, children, footer, onClose, labelledBy = 'ol-dialog-title' }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} className="ol-dialog" aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === ref.current) onClose() }}>
    <header><h2 id={labelledBy}>{title}</h2><button type="button" aria-label="닫기" onClick={onClose}><X /></button></header>
    <div className="ol-dialog-body">{children}</div>{footer && <footer>{footer}</footer>}
  </dialog>
}
