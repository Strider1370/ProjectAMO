import { useRef } from 'react'
import { panRange } from './profileNavigation.js'

export default function RouteOverview({ total, range, onRange, waypointCount }) {
  const drag = useRef(null)
  const span = range[1] - range[0]
  const update = start => onRange(panRange(range, start, total))
  function begin(e) {
    if (e.button !== 0 || drag.current) return
    const b = e.currentTarget.getBoundingClientRect()
    const nm = (e.clientX - b.left) / b.width * total
    const offset = nm >= range[0] && nm <= range[1] ? nm - range[0] : span / 2
    drag.current = { id: e.pointerId, left: b.left, width: b.width, offset }
    e.currentTarget.setPointerCapture(e.pointerId)
    update(nm - offset)
  }
  function end(e) {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return <div className="vpc-overview">
    <span className="vpc-overview-caption">{Math.round(range[0]).toLocaleString()}–{Math.round(range[1]).toLocaleString()} / {total.toLocaleString()} NM</span>
    <div className="vpc-overview-track" role="slider" tabIndex="0" aria-label="확대 구간 이동" aria-valuemin={0} aria-valuemax={total - span} aria-valuenow={range[0]} aria-valuetext={`${Math.round(range[0])}부터 ${Math.round(range[1])} NM`} aria-disabled={span === total}
      onPointerDown={begin} onPointerMove={e => { const d = drag.current; if (d?.id === e.pointerId) update((e.clientX - d.left) / d.width * total - d.offset) }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={e => {
        const delta = { ArrowLeft: -span / 10, ArrowRight: span / 10, PageUp: -span, PageDown: span }[e.key]
        if (delta !== undefined || e.key === 'Home' || e.key === 'End') {
          e.preventDefault(); update(e.key === 'Home' ? 0 : e.key === 'End' ? total - span : range[0] + delta)
        }
      }}>
      <div className="vpc-overview-selection" style={{ left: `${range[0] / total * 100}%`, width: `${span / total * 100}%` }} />
    </div>
    <span className="vpc-overview-count">{waypointCount} 지점</span>
  </div>
}
