const STATUS_LABELS = {
  waiting: '대기 중',
  active: '전환 중',
  ended: '오늘 종료',
}

function MonitoringSlideOverlay({
  visible,
  imageUrl,
  scope,
  onStop,
  statusLabel,
  effect = 'fade',
  durationMs = 350,
}) {
  const label = statusLabel || STATUS_LABELS[scope] || null

  return (
    <div
      className={`monitoring-slide-overlay monitoring-slide-overlay--${scope} monitoring-slide-overlay--effect-${effect}${visible ? ' is-visible' : ''}`}
      style={{ '--monitoring-slide-transition-ms': `${durationMs}ms` }}
      aria-hidden={!visible}
    >
      {imageUrl && <img className="monitoring-slide-overlay-image" src={imageUrl} alt="" />}
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
    </div>
  )
}

export default MonitoringSlideOverlay
