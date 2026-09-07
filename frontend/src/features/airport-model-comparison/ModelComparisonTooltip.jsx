import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ModelComparisonTooltip({ detail, rows, label, chartRef, onClose, onPointerEnter, onPointerLeave, tooltipId }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const place = useCallback(() => {
    const box = ref.current.getBoundingClientRect()
    const anchor = detail.anchor?.getBoundingClientRect()
    const x = anchor ? anchor.x + anchor.width / 2 : detail.x
    const y = anchor ? anchor.y + anchor.height / 2 : detail.y
    const gap = 12, inset = 8
    const left = x + gap + box.width <= window.innerWidth - inset ? x + gap : x - gap - box.width
    const top = y + gap + box.height <= window.innerHeight - inset ? y + gap : y - gap - box.height
    setPosition({ left: Math.max(inset, Math.min(left, window.innerWidth - box.width - inset)), top: Math.max(inset, Math.min(top, window.innerHeight - box.height - inset)) })
  }, [detail])
  useLayoutEffect(place, [place, rows])
  useEffect(() => {
    const outside = event => { if (!chartRef.current?.contains(event.target) && !ref.current?.contains(event.target)) onClose() }
    const escape = event => { if (event.key === 'Escape') onClose() }
    const scroll = event => {
      if (ref.current?.contains(event.target)) return
      // Focusing an SVG point can enqueue an automatic scroll after focusin.
      // Keep that keyboard tooltip attached to its point instead of dismissing it.
      if (detail.anchor === document.activeElement) place()
      else onClose()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [chartRef, onClose, detail.anchor, place])
  return createPortal(<div ref={ref} id={tooltipId} role="tooltip" className="mc-chart-tooltip" style={position} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
    <strong className="mc-tooltip-time">{label}</strong>
    {rows.map(row => <div className="mc-tooltip-row" key={row.id}>
      <span><i className="mc-series-key" style={{ '--series-color': row.color }} /><strong>{row.label}</strong></span><span>{row.value}</span>
      {row.metadata && <small>{row.metadata}</small>}
      {row.conditionText && <small>{row.conditionText}</small>}
    </div>)}
  </div>, document.body)
}
