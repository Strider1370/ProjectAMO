import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCloseOnBackButton } from './useCloseOnBackButton.js'
import './MobileSheet.css'

// Shared non-modal mobile bottom sheet: grabber handle, peek/half/full detents
// with pointer-drag snapping, and a scrollable body. Anchored flush to the
// bottom of its positioned parent (the map wrapper) so it sits on the task bar.
// Degrades to a fixed half-height sheet when pointer events are unavailable.

const DETENTS = ['peek', 'half', 'full']
const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window

function detentHeight(detent, fullPx) {
  const h = (typeof window !== 'undefined' && window.innerHeight) || 800
  if (detent === 'peek') return 66
  // Full = flush to the top of the positioned parent (the map wrapper, which is
  // 100dvh minus the task bar). Falls back to 0.9h before the parent is measured.
  if (detent === 'full') return fullPx ?? Math.round(h * 0.9)
  return Math.round(h * 0.55)
}

export default function MobileSheet({
  open,
  eyebrow,
  title,
  onClose,
  headerExtra,
  peekContent,
  footer,
  children,
  detent: detentProp,
  onDetentChange,
}) {
  const [internalDetent, setInternalDetent] = useState('half')
  const detent = detentProp ?? internalDetent
  const setDetent = (next) => {
    if (onDetentChange) onDetentChange(next)
    else setInternalDetent(next)
  }

  const dragRef = useRef(null)
  const rootRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Measure the positioned parent (map wrapper) so the full detent sits flush to
  // its top edge — no sliver of map peeking above the sheet. A ResizeObserver
  // catches the initial layout and any viewport change.
  const [fullPx, setFullPx] = useState(null)
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!open || !parent) return undefined
    const measure = () => setFullPx(parent.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [open])

  // At the full detent, flag the document so the map chrome (status strip, layer
  // chips, basemap switcher) hides behind the now full-screen sheet.
  useEffect(() => {
    const isFull = open && detent === 'full'
    document.body.classList.toggle('amo-sheet-full', isFull)
    return () => document.body.classList.remove('amo-sheet-full')
  }, [open, detent])

  // 모바일 브라우저 뒤로가기가 시트만 닫고 앱을 벗어나지 않게.
  useCloseOnBackButton(open, onClose)

  // H3 사용자 제어: Escape로 닫기. H13 접근성: 열릴 때 포커스를 시트로 옮기고
  // 닫힐 때 이전 요소로 복귀(non-modal이라 포커스 트랩은 두지 않음 — 지도는 계속 조작 가능).
  useEffect(() => {
    if (!open) return undefined
    const prevFocus = document.activeElement
    rootRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prevFocus instanceof HTMLElement) prevFocus.focus()
    }
  }, [open])

  function onPointerDown(event) {
    if (!hasPointer) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startH: detentHeight(detent, fullPx),
      currentH: detentHeight(detent, fullPx),
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocityY: 0,
      moved: false,
    }
    rootRef.current?.classList.add('is-dragging')
  }

  function onPointerMove(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = event.clientY - drag.startY
    if (Math.abs(delta) > 5) drag.moved = true
    const elapsed = event.timeStamp - drag.lastAt
    if (elapsed > 0) drag.velocityY = (event.clientY - drag.lastY) / elapsed
    drag.lastY = event.clientY
    drag.lastAt = event.timeStamp
    // 아래로는 peek 밑(닫기 존)까지 끌 수 있게 최소를 0으로 — 스와이프-다운-투-디스미스.
    const next = Math.min(detentHeight('full', fullPx), Math.max(0, drag.startH - delta))
    drag.currentH = next
    // Pointer move마다 React를 다시 렌더하지 않고, 현재 시트 DOM만 갱신한다.
    rootRef.current?.style.setProperty('height', `${next}px`)
  }

  function onPointerUp(event) {
    const drag = dragRef.current
    if (!drag || (event && drag.pointerId !== event.pointerId)) return
    dragRef.current = null
    rootRef.current?.classList.remove('is-dragging')
    if (!drag.moved) {
      // Tap on the grabber cycles detents (discoverability fallback).
      const idx = DETENTS.indexOf(detent)
      setDetent(DETENTS[(idx + 1) % DETENTS.length])
      return
    }
    const current = drag.currentH
    // peek 아래로 충분히 끌어내리면 닫기(그래버가 × 역할까지 일괄).
    if (current < detentHeight('peek', fullPx) * 0.6) {
      onClose?.()
      return
    }
    let nearest = 'half'
    let best = Infinity
    for (const candidate of DETENTS) {
      const diff = Math.abs(detentHeight(candidate, fullPx) - current)
      if (diff < best) { best = diff; nearest = candidate }
    }
    if (drag.velocityY <= -0.5 && nearest !== 'full') nearest = DETENTS[DETENTS.indexOf(nearest) + 1]
    if (drag.velocityY >= 0.5 && nearest !== 'peek') nearest = DETENTS[DETENTS.indexOf(nearest) - 1]
    rootRef.current?.style.setProperty('height', `${detentHeight(nearest, fullPx)}px`)
    setDetent(nearest)
  }

  function onPointerCancel(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    rootRef.current?.classList.remove('is-dragging')
    rootRef.current?.style.setProperty('height', `${detentHeight(detent, fullPx)}px`)
  }

  if (!open) return null

  const height = detentHeight(detent, fullPx)
  const dragHandlers = hasPointer
    ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
    : {}
  const showPeek = detent === 'peek' && peekContent != null

  return (
    <div
      ref={rootRef}
      className={`mobile-sheet${detent === 'full' ? ' is-full' : ''}`}
      style={{ height: `${height}px` }}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="mobile-sheet-grab" role="button" tabIndex={0} aria-label="시트 크기 변경"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          const idx = DETENTS.indexOf(detent)
          setDetent(DETENTS[(idx + 1) % DETENTS.length])
        }}
        {...dragHandlers}>
        <span className="mobile-sheet-grab-handle" aria-hidden="true" />
      </div>
      {showPeek ? (
        <button
          type="button"
          className="mobile-sheet-peek"
          onClick={() => setDetent('half')}
          aria-label="브리핑 펼치기"
        >
          {peekContent}
        </button>
      ) : (
        <>
          <div className="mobile-sheet-header">
            <div className="mobile-sheet-titles">
              {eyebrow && <div className="mobile-sheet-eyebrow">{eyebrow}</div>}
              <div className="mobile-sheet-title">{title}</div>
            </div>
            {headerExtra && <div className="mobile-sheet-header-extra">{headerExtra}</div>}
          </div>
          <div className="mobile-sheet-body">{children}</div>
          {footer && <div className="mobile-sheet-footer">{footer}</div>}
        </>
      )}
    </div>
  )
}
