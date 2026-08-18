function queueError(message) {
  return new Error(message)
}

function retryKey(job) {
  if (job.mode === 'current' || !job.frame?.tm) return null
  return `${job.kind}:${job.mode}:${job.frame.tm}`
}

export function createSatelliteWorkQueue({
  runWorker,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (typeof runWorker !== 'function') throw new TypeError('runWorker is required')

  const pending = []
  const timers = new Set()
  const retryItems = new Map()
  const idleWaiters = new Set()
  let active = null

  const isIdle = () => active === null && pending.length === 0 && timers.size === 0
  const settleIdleWaiters = () => {
    if (!isIdle()) return
    for (const waiter of idleWaiters) {
      clearTimeoutImpl(waiter.timeoutId)
      waiter.resolve()
    }
    idleWaiters.clear()
  }

  const removePending = (item) => {
    const index = pending.indexOf(item)
    if (index >= 0) pending.splice(index, 1)
  }

  const clearItemSignal = (item) => item.signal?.removeEventListener('abort', item.onAbort)

  const drain = () => {
    if (active || pending.length === 0) {
      settleIdleWaiters()
      return
    }

    const item = pending.shift()
    clearItemSignal(item)
    const controller = new AbortController()
    active = { item, controller, completion: null }
    const running = active
    running.completion = Promise.resolve()
      .then(() => runWorker(item.job, { signal: controller.signal }))
      .then((work) => {
        if (retryItems.get(item.key) === item) retryItems.delete(item.key)
        active = null
        for (const followUp of work.followUps ?? []) scheduleFollowUp(followUp)
        item.resolve(work)
      }, (error) => {
        if (retryItems.get(item.key) === item) retryItems.delete(item.key)
        active = null
        item.reject(error)
      })
      .finally(() => {
        settleIdleWaiters()
        drain()
      })
  }

  const enqueue = (job, { signal } = {}) => {
    const key = retryKey(job)
    const existing = key ? retryItems.get(key) : null
    if (existing?.promise) return existing.promise
    if (signal?.aborted) return Promise.reject(signal.reason ?? queueError('satellite worker cancelled'))

    let resolve
    let reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    const item = {
      job,
      key,
      promise,
      resolve,
      reject,
      signal,
      onAbort: null,
    }
    item.onAbort = () => {
      if (active?.item === item) {
        active.controller.abort(signal.reason ?? queueError('satellite worker cancelled'))
        return
      }
      removePending(item)
      if (retryItems.get(key) === item) retryItems.delete(key)
      clearItemSignal(item)
      reject(signal.reason ?? queueError('satellite worker cancelled'))
      settleIdleWaiters()
      drain()
    }
    signal?.addEventListener('abort', item.onAbort, { once: true })
    if (key) retryItems.set(key, item)
    pending.push(item)
    drain()
    return promise
  }

  const scheduleFollowUp = (job) => {
    const key = retryKey(job)
    if (key && retryItems.has(key)) return
    const timer = { id: null, key }
    if (key) retryItems.set(key, timer)
    timers.add(timer)
    timer.id = setTimeoutImpl(() => {
      timers.delete(timer)
      if (retryItems.get(key) === timer) retryItems.delete(key)
      enqueue(job).catch(() => {})
      settleIdleWaiters()
      drain()
    }, job.delayMs)
  }

  return {
    enqueue,
    async cancel(reason = queueError('satellite worker cancelled')) {
      for (const timer of timers) {
        clearTimeoutImpl(timer.id)
        if (retryItems.get(timer.key) === timer) retryItems.delete(timer.key)
      }
      timers.clear()

      for (const item of pending.splice(0)) {
        if (retryItems.get(item.key) === item) retryItems.delete(item.key)
        clearItemSignal(item)
        item.reject(reason)
      }

      const running = active
      if (running) {
        running.controller.abort(reason)
        await running.completion.catch(() => {})
      }
      settleIdleWaiters()
    },
    whenIdle({ timeoutMs = 30_000, pollMs = 25 } = {}) {
      void pollMs
      if (isIdle()) return Promise.resolve()
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(queueError('invalid satellite queue idle timeout'))
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          timeoutId: setTimeoutImpl(() => {
            idleWaiters.delete(waiter)
            reject(queueError('satellite work queue did not become idle'))
          }, timeoutMs),
        }
        idleWaiters.add(waiter)
      })
    },
  }
}
