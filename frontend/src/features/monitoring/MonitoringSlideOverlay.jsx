import { useEffect, useRef, useState } from 'react'

const STATUS_LABELS = {
  waiting: '대기 중',
  active: '전환 중',
  ended: '오늘 종료',
}

// A two-layer stage rather than a single sliding panel.
//
// A slide transition has to move the outgoing and the incoming slide together, like one strip of
// film winding past a window — otherwise the eye loses track of what left and what arrived. That
// needs both slides on screen at once, so the stage keeps the previous slide mounted for the
// length of the move and animates the pair.
//
// `live` (the map itself) is a slide with no content: it is the backdrop, already on screen, so its
// layer is simply not rendered. The pairing still holds — an invisible frame slides alongside — and
// every combination of slides animates the same way, including overlay-to-overlay.
function MonitoringSlideOverlay({
  slideId = 'live',
  content = null,
  scope,
  onStop,
  statusLabel,
  effect = 'fade',
  durationMs = 350,
}) {
  const label = statusLabel || STATUS_LABELS[scope] || null
  const [leaving, setLeaving] = useState(null)
  const shownRef = useRef({ id: slideId, content })

  useEffect(() => {
    const previous = shownRef.current
    shownRef.current = { id: slideId, content }
    if (previous.id === slideId) return undefined

    // A change arriving mid-move drops the older layer instead of stacking a third one.
    setLeaving(previous.content ? previous : null)
    const timer = setTimeout(() => setLeaving(null), durationMs)
    return () => clearTimeout(timer)
    // `content` changes on every parent render (it is a fresh element); only the slide identity
    // should start a transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId, durationMs])

  const showing = slideId !== 'live'

  return (
    <div
      className={`monitoring-slide-overlay monitoring-slide-overlay--${scope} monitoring-slide-overlay--effect-${effect}${showing ? ' is-visible' : ''}`}
      style={{ '--monitoring-slide-transition-ms': `${durationMs}ms` }}
      aria-hidden={!showing}
    >
      {leaving && (
        <div className="monitoring-slide-layer is-leaving" key={leaving.id}>
          {leaving.content}
        </div>
      )}
      {content && (
        <div className="monitoring-slide-layer is-entering" key={slideId}>
          {content}
        </div>
      )}
      {showing && (
        <div className="monitoring-slide-overlay-controls">
          {label && <span className="monitoring-slide-overlay-status">{label}</span>}
          <button
            type="button"
            className="monitoring-slide-overlay-exit"
            onClick={onStop}
            aria-label="화면 전환 종료"
          >
            종료
          </button>
        </div>
      )}
    </div>
  )
}

export default MonitoringSlideOverlay
