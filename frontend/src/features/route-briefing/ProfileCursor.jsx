import { memo, useEffect, useRef, useState } from 'react'

// Own the transient pointer state here so moving the cursor does not rebuild weather geometry.
export default memo(function ProfileCursor({ left, top, width, height, totalDistanceNm, maxAltitudeFt }) {
  const group = useRef(null)
  const [point, setPoint] = useState(null)
  useEffect(() => {
    const svg = group.current?.ownerSVGElement
    const scroll = svg?.parentElement
    if (!svg || !scroll) return
    let frame = null
    let dragging = false
    let touchStart = null
    const clear = () => { cancelAnimationFrame(frame); frame = null; setPoint(null) }
    const move = event => {
      if (event.pointerType === 'touch' || event.buttons || dragging) return clear()
      const { clientX, clientY } = event
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        const matrix = svg.getScreenCTM()
        if (!matrix) return
        const inverse = matrix.inverse()
        const p = new DOMPoint(clientX, clientY).matrixTransform(inverse)
        const viewport = scroll.getBoundingClientRect()
        const visibleLeft = new DOMPoint(viewport.left + left, clientY).matrixTransform(inverse).x
        const visibleRight = new DOMPoint(viewport.right, clientY).matrixTransform(inverse).x
        if (p.x < Math.max(left, visibleLeft) || p.x > left + width || p.y < top || p.y > top + height) return setPoint(null)
        setPoint({ x:p.x, y:p.y, minX:Math.max(left, visibleLeft), maxX:Math.min(left + width, visibleRight) })
      })
    }
    const down = event => { dragging = true; touchStart = event.pointerType === 'touch' ? { x:event.clientX, y:event.clientY } : null; clear() }
    const up = event => {
      dragging = false
      if (event.type === 'pointerup' && touchStart && Math.hypot(event.clientX-touchStart.x, event.clientY-touchStart.y) < 6) {
        move({ clientX:event.clientX, clientY:event.clientY, pointerType:'mouse', buttons:0 })
      }
      touchStart = null
    }
    const leave = event => { if (event.pointerType !== 'touch') clear() }
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerleave', leave)
    svg.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    scroll.addEventListener('scroll', clear)
    scroll.addEventListener('wheel', clear, { passive:true })
    clear()
    return () => {
      cancelAnimationFrame(frame)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerleave', leave)
      svg.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      scroll.removeEventListener('scroll', clear)
      scroll.removeEventListener('wheel', clear)
    }
  }, [left, top, width, height, totalDistanceNm, maxAltitudeFt])
  const nm = point ? (point.x - left) / width * totalDistanceNm : 0
  const ft = point ? Math.round((1 - (point.y - top) / height) * maxAltitudeFt) : 0
  const boxWidth = point ? Math.min(190, point.maxX - point.minX) : 190
  const boxX = point ? Math.max(point.minX, Math.min(point.x + 12, point.maxX - boxWidth)) : 0
  const boxY = point ? Math.max(top, Math.min(point.y - 34, top + height - 26)) : 0
  return <g ref={group} className="vertical-profile-cursor" pointerEvents="none" aria-hidden="true">
    {point && <>
      <line x1={point.x} x2={point.x} y1={top} y2={top + height}/>
      <line x1={left} x2={left + width} y1={point.y} y2={point.y}/>
      <circle cx={point.x} cy={point.y} r={4}/>
      <g transform={`translate(${boxX} ${boxY})`}>
        <rect width={boxWidth} height={26} rx={4}/>
        <text x={boxWidth / 2} y={17} textAnchor="middle">{nm.toFixed(1)} NM · {ft.toLocaleString()} ft</text>
      </g>
    </>}
  </g>
})
