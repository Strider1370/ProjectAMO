export function createOneShotNotifier(callback) {
  let notified = false
  return () => {
    if (notified) return
    notified = true
    callback?.()
  }
}
