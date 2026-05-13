function SigwxHistoryBar({
  isVisible,
  selectedEntry,
  entryCount,
  historyIndex,
  issueLabel,
  validLabel,
  isElevated = false,
  onHistoryIndexChange,
}) {
  if (!isVisible || !selectedEntry) return null

  return (
    <div className={`sigwx-history-bar${isElevated ? ' sigwx-history-bar--elevated' : ''}`} aria-label="SIGWX history controls">
      <button
        type="button"
        className="sigwx-history-button"
        onClick={() => onHistoryIndexChange((prev) => Math.min(entryCount - 1, prev + 1))}
        disabled={historyIndex >= entryCount - 1}
      >
        Prev
      </button>
      <div className="sigwx-history-meta">
        <div className="sigwx-history-title">SIGWX_LOW {entryCount > 0 ? entryCount : ''}</div>
        <div className="sigwx-history-stamp">발표 {issueLabel}</div>
        <div className="sigwx-history-stamp">유효 {validLabel}</div>
      </div>
      <button
        type="button"
        className="sigwx-history-button"
        onClick={() => onHistoryIndexChange((prev) => Math.max(0, prev - 1))}
        disabled={historyIndex <= 0}
      >
        Next
      </button>
    </div>
  )
}

export default SigwxHistoryBar
