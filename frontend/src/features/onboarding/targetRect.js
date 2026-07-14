// 스텝 → 뷰포트 기준 rect(스포트라이트 구멍용) 또는 null.
// 우선순위: ① revealSelector(열린 패널) — 클릭으로 패널이 열리면 그 패널을 강조(대상을 가리므로).
//          ② mapAirport(지도 마커) — 좌표 투영.  ③ target(DOM 셀렉터).
const MARKER_R = 28 // 마커 스포트라이트 반경(px)

const rectOf = (r) => ({
  left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
})

// 열린 패널(revealSelector)이 DOM에 있으면 그 rect, 없으면 null.
export function revealRect(step) {
  if (!step?.revealSelector || typeof document === 'undefined') return null
  const el = document.querySelector(step.revealSelector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? rectOf(r) : null
}

export function isRevealed(step) {
  return revealRect(step) != null
}

export function resolveTargetRect(step, getAirportPoint) {
  const rev = revealRect(step)
  if (rev) return rev
  if (step?.mapAirport) {
    const p = getAirportPoint?.(step.mapAirport)
    if (!p) return null
    return {
      left: p.x - MARKER_R, top: p.y - MARKER_R,
      width: MARKER_R * 2, height: MARKER_R * 2,
      right: p.x + MARKER_R, bottom: p.y + MARKER_R,
    }
  }
  if (typeof document === 'undefined' || !step?.target) return null
  const el = document.querySelector(step.target)
  if (!el) return null
  return rectOf(el.getBoundingClientRect())
}
