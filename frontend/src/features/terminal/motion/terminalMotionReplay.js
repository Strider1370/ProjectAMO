export function createTerminalMotionReplay({ clock, advance }) {
  let frame = null
  let version = 0
  return {
    schedule() {
      this.cancel()
      const scheduledVersion = version
      frame = clock.requestAnimationFrame(() => {
        if (scheduledVersion !== version) return
        frame = null
        advance()
      })
    },
    cancel() {
      version += 1
      if (frame !== null) clock.cancelAnimationFrame(frame)
      frame = null
    },
  }
}
