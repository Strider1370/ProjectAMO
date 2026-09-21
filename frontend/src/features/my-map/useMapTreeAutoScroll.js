import { useEffect, useRef } from 'react'

const ownDrag = (event) => [...(event.dataTransfer?.types ?? [])].some((type) => type === 'application/x-projectamo-map-items' || type === 'application/x-projectamo-map-group')

function scrollParent(element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

// Native HTML dragging does not consistently scroll an overflow panel in every browser.
export default function useMapTreeAutoScroll(disabled) {
  const active = useRef(null), frame = useRef(null)
  const stop = () => { cancelAnimationFrame(frame.current); frame.current = null; active.current = null }
  const scrollAtPointer = (state) => {
    const bounds = state.element.getBoundingClientRect(), { x, y } = state.pointer
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return
    const edge = 48
    const speed = y < bounds.top + edge ? -Math.min(12, (bounds.top + edge - y) / 4) : y > bounds.bottom - edge ? Math.min(12, (y - bounds.bottom + edge) / 4) : 0
    if (speed) state.element.scrollTop += speed
  }
  useEffect(() => {
    if (disabled) stop()
    const track = (event) => {
      if (!active.current) return
      active.current.pointer = { x: event.clientX, y: event.clientY }
      // Native drag 중에는 일부 엔진이 animation frame을 드물게 준다. 각 drag/dragover
      // 이벤트에서도 한 번 움직이면 그 경우에도 가장자리 스크롤이 끊기지 않는다.
      scrollAtPointer(active.current)
    }
    // 항목/그룹 drop 대상은 중복 이동을 막으려고 dragover를 버블 단계에서 멈춘다.
    // 포인터 추적도 버블 단계에 두면 대상 위에서 마지막 좌표를 받지 못해 자동
    // 스크롤이 멈춘다. 캡처 단계는 그 방어보다 먼저 실행된다.
    window.addEventListener('dragover', track, true)
    window.addEventListener('drag', track, true)
    window.addEventListener('drop', stop)
    window.addEventListener('dragend', stop)
    return () => { stop(); window.removeEventListener('dragover', track, true); window.removeEventListener('drag', track, true); window.removeEventListener('drop', stop); window.removeEventListener('dragend', stop) }
  }, [disabled])
  const tick = () => {
    const state = active.current
    if (!state) return
    scrollAtPointer(state)
    frame.current = requestAnimationFrame(tick)
  }
  return {
    onDragOverCapture: (event) => {
      if (disabled || !ownDrag(event)) return
      if (!active.current) {
        const element = scrollParent(event.currentTarget)
        if (!element) return
        active.current = { element, pointer: { x: event.clientX, y: event.clientY } }
        frame.current = requestAnimationFrame(tick)
      } else active.current.pointer = { x: event.clientX, y: event.clientY }
    },
    onDropCapture: stop,
    onDragEndCapture: stop,
  }
}
