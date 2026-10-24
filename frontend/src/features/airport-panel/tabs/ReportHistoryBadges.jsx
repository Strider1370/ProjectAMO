import { useEffect, useRef } from 'react'
import { fmtKstShort } from '../lib/formatters.js'
import './ReportHistoryBadges.css'

function shortTime(iso, tz) {
  const formatted = fmtKstShort(iso, tz)
  if (formatted === '—') return '—'
  const hhmm = formatted.slice(11, 16)
  return tz === 'KST' ? hhmm : `${hhmm.replace(':', '')}Z`
}

export default function ReportHistoryBadges({ history, type, tz }) {
  const stripRef = useRef(null)
  useEffect(() => {
    const strip = stripRef.current
    const selected = strip?.querySelector('[aria-pressed="true"]')
    if (!selected) return
    const stripRect = strip.getBoundingClientRect()
    const selectedRect = selected.getBoundingClientRect()
    if (selectedRect.right > stripRect.right) strip.scrollLeft += selectedRect.right - stripRect.right
    if (selectedRect.left < stripRect.left) strip.scrollLeft -= stripRect.left - selectedRect.left
  }, [history.selected?.key, history.entries.length])
  if (history.entries.length === 0) return null
  const label = type === 'metar' ? 'METAR 관측 회차' : 'TAF 발표 회차'
  return (
    <span ref={stripRef} className="ap-history-badges" role="group" aria-label={label}>
      {[...history.entries].reverse().map((entry) => {
        const selected = entry.key === history.selected?.key
        const kind = entry.kind === 'AMENDMENT' ? 'AMD' : entry.kind
        const fullTime = fmtKstShort(entry.time, tz)
        return (
          <button key={entry.key} type="button"
            className={`ap-history-badge${selected ? ' is-selected' : ''}${entry.latest ? ' is-latest' : ''}${entry.category ? ` is-${entry.category.toLowerCase()}` : ''}`}
            aria-label={`${fullTime} ${kind}${entry.category ? ` ${entry.category}` : ''}${entry.latest ? ' 최신' : ''}`}
            aria-pressed={selected}
            title={`${fullTime} · ${kind}${entry.category ? ` · ${entry.category}` : ''}${entry.latest ? ' · 최신' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.closest('details').open = true
              history.select(entry.key)
            }}>
            {entry.category && <i className="ap-history-badge-dot" aria-hidden="true" />}
            {shortTime(entry.time, tz)}
            {kind === 'SPECI' && <span className="ap-history-badge-kind">S</span>}
            {kind === 'AMD' && <span className="ap-history-badge-kind">AMD</span>}
            {entry.latest && <span className="ap-history-badge-latest">최신</span>}
          </button>
        )
      })}
    </span>
  )
}
