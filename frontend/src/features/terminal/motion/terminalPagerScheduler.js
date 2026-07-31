export function createTerminalPagerScheduler({ clock, intervalMs, transitionMs, dispatch }) {
  let intervalId = null
  let timeoutId = null
  let completionVersion = 0
  function clearCompletion() {
    completionVersion += 1
    if (timeoutId !== null) clock.clearTimeout(timeoutId)
    timeoutId = null
  }
  return {
    start() {
      if (intervalId !== null || intervalMs <= 0) return
      intervalId = clock.setInterval(() => dispatch({ type: 'ADVANCE', source: 'automatic' }), intervalMs)
    },
    scheduleCompletion() {
      clearCompletion()
      const version = completionVersion
      timeoutId = clock.setTimeout(() => {
        if (version !== completionVersion) return
        clock.clearTimeout(timeoutId)
        timeoutId = null
        dispatch({ type: 'COMPLETE' })
      }, transitionMs)
    },
    cancel() { clearCompletion(); dispatch({ type: 'CANCEL' }) },
    dispose() {
      clearCompletion()
      if (intervalId !== null) clock.clearInterval(intervalId)
      intervalId = null
    },
  }
}
