export const STOP_GRACE_MS = 1_000

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true)

  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout)
      child.removeListener('exit', onExit)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const timeout = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
  })
}

function signalDetachedGroup(entry, signal) {
  try {
    process.kill(-entry.child.pid, signal)
  } catch {
    try {
      entry.child.kill(signal)
    } catch {}
  }
}

export async function stopProcess(entry, { graceMs = STOP_GRACE_MS } = {}) {
  if (!entry?.child?.pid || hasExited(entry.child)) return

  signalDetachedGroup(entry, 'SIGTERM')
  if (await waitForExit(entry.child, graceMs)) return

  signalDetachedGroup(entry, 'SIGKILL')
  if (await waitForExit(entry.child, graceMs)) return

  throw new Error(`[projectamo-dev] ${entry.name || 'managed process'} did not exit after SIGKILL`)
}
