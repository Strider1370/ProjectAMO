import { useEffect, useRef, useState } from 'react'
import { clamp } from './profileNavigation.js'

function bounds() {
  const left = window.innerWidth > 719 ? 72 : 8
  return { left, top: 12, width: Math.max(240, window.innerWidth - left - 12), height: Math.max(240, window.innerHeight - 76) }
}
function contain(rect) {
  const b = bounds()
  const width = clamp(rect.width, Math.min(580, b.width), b.width)
  const height = clamp(rect.height, Math.min(window.innerWidth < 720 ? 700 : 500, b.height), b.height)
  return { width, height, x: clamp(rect.x, b.left, b.left + b.width - width), y: clamp(rect.y, b.top, b.top + b.height - height) }
}
function initialRect() {
  const b = bounds(), width = b.width - (window.innerWidth > 719 ? 40 : 0), height = Math.min(600, b.height * .78)
  return contain({ x: b.left + (b.width - width) / 2, y: b.top + (b.height - height) / 2, width, height })
}

export default function useFloatingWindow() {
  const [rect, setRect] = useState(initialRect)
  const [maximized, setMaximized] = useState(false)
  const [moving, setMoving] = useState(false)
  const [, redraw] = useState(0)
  const action = useRef(null)
  const pendingRect = useRef(null)
  const frame = useRef(null)
  function flushRect() {
    cancelAnimationFrame(frame.current)
    frame.current = null
    if (pendingRect.current) { setRect(pendingRect.current); pendingRect.current = null }
  }
  function scheduleRect(next) {
    pendingRect.current = next
    if (frame.current === null) frame.current = requestAnimationFrame(flushRect)
  }
  useEffect(() => {
    const resize = () => { cancelAnimationFrame(frame.current); frame.current = null; pendingRect.current = null; action.current = null; setMoving(false); setRect(contain); redraw(v => v + 1) }
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(frame.current) }
  }, [])
  function begin(e, mode) {
    if (maximized || e.button !== 0 || (mode === 'move' && e.target.closest('button, select, input, a'))) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    action.current = { x: e.clientX, y: e.clientY, rect, mode, pointerId: e.pointerId }
    setMoving(true)
  }
  function move(e) {
    const a = action.current
    if (!a || a.pointerId !== e.pointerId) return
    const dx = e.clientX - a.x, dy = e.clientY - a.y
    if (a.mode === 'move') return scheduleRect(contain({ ...a.rect, x: a.rect.x + dx, y: a.rect.y + dy }))
    const b = bounds(), minW = Math.min(580, b.width), minH = Math.min(window.innerWidth < 720 ? 700 : 500, b.height)
    let { x, y, width, height } = a.rect
    const right = x + width, bottom = y + height
    if (a.mode.includes('e')) width = clamp(width + dx, minW, b.left + b.width - x)
    if (a.mode.includes('s')) height = clamp(height + dy, minH, b.top + b.height - y)
    if (a.mode.includes('w')) { x = clamp(x + dx, b.left, right - minW); width = right - x }
    if (a.mode.includes('n')) { y = clamp(y + dy, b.top, bottom - minH); height = bottom - y }
    scheduleRect({ x, y, width, height })
  }
  function end(e) {
    flushRect()
    action.current = null; setMoving(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  function key(e, mode) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || maximized) return
    e.preventDefault()
    const step = e.shiftKey ? 40 : 10
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    setRect(r => mode === 'move' ? contain({ ...r, x: r.x + dx, y: r.y + dy }) : contain({ ...r, width: r.width + dx, height: r.height + dy }))
  }
  const b = bounds()
  return { rect: maximized ? { x: b.left, y: b.top, width: b.width, height: b.height } : rect, maximized, moving,
    toggleMaximize: () => setMaximized(v => !v),
    handlers: mode => ({ onPointerDown: e => begin(e, mode), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { flushRect(); action.current = null; setMoving(false) } }),
    key,
  }
}
