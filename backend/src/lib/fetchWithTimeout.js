/**
 * Wraps fetch() with an AbortController-based timeout.
 * Returns the raw Response — callers decide how to read the body.
 */
export async function fetchWithTimeout(url, timeoutMs, { signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    return await fetch(url, { signal: requestSignal })
  } finally {
    clearTimeout(timer)
  }
}
