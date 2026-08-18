export const SATELLITE_JOB_KINDS = new Set(['satellite', 'satellite_visible'])

const SATELLITE_MODES = new Set(['current', 'backfill', 'fog_retry'])
const FOLLOW_UP_MODES = new Set(['backfill', 'fog_retry'])

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonSafe(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || Buffer.isBuffer(value) || seen.has(value)) return false

  if (!Array.isArray(value) && !isPlainObject(value)) return false
  try {
    if (typeof value.toJSON === 'function') return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(value)

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) return false
      }
      if (keys.some((key) => key !== 'length' && (!Number.isInteger(Number(key)) || Number(key) < 0 || String(Number(key)) !== key))) return false
    }

    seen.add(value)
    const safe = keys.every((key) => {
      if (typeof key !== 'string' || key === 'length') return false
      const descriptor = descriptors[key]
      return descriptor.enumerable && Object.hasOwn(descriptor, 'value') && isJsonSafe(descriptor.value, seen)
    })
    seen.delete(value)
    return safe
  } catch {
    return false
  }
}

function assertValidTime(now, errorMessage) {
  const time = Date.parse(now)
  if (typeof now !== 'string' || !Number.isFinite(time) || new Date(time).toISOString() !== now) throw new Error(errorMessage)
}

export function assertSatelliteJob(message) {
  if (!isPlainObject(message) || !SATELLITE_JOB_KINDS.has(message.kind)) {
    throw new Error('invalid satellite worker kind')
  }
  if (!SATELLITE_MODES.has(message.mode) || (message.kind === 'satellite_visible' && message.mode !== 'current')) {
    throw new Error('invalid satellite worker mode')
  }
  assertValidTime(message.now, 'invalid satellite worker time')
  if ('frame' in message && !isJsonSafe(message.frame)) throw new Error('invalid satellite worker frame')

  return {
    kind: message.kind,
    mode: message.mode,
    now: message.now,
    ...('frame' in message ? { frame: message.frame } : {}),
  }
}

function normalizeFollowUp(followUp) {
  if (!isPlainObject(followUp)
    || followUp.kind !== 'satellite'
    || !FOLLOW_UP_MODES.has(followUp.mode)
    || !Number.isInteger(followUp.delayMs)
    || followUp.delayMs < 0) {
    throw new Error('invalid satellite worker follow-up')
  }

  try {
    assertValidTime(followUp.now, 'invalid satellite worker follow-up')
  } catch {
    throw new Error('invalid satellite worker follow-up')
  }
  if ('frame' in followUp && !isJsonSafe(followUp.frame)) throw new Error('invalid satellite worker follow-up')
  if (!isJsonSafe(followUp)) throw new Error('invalid satellite worker follow-up')

  return {
    kind: followUp.kind,
    mode: followUp.mode,
    now: followUp.now,
    ...('frame' in followUp ? { frame: followUp.frame } : {}),
    delayMs: followUp.delayMs,
  }
}

export function successMessage(work) {
  if (!isPlainObject(work) || !Object.hasOwn(work, 'result') || !Array.isArray(work.followUps)) {
    throw new Error('invalid satellite worker success result')
  }
  if (!isJsonSafe(work.result)) throw new Error('JSON-safe satellite worker payload required')
  const followUps = []
  for (let index = 0; index < work.followUps.length; index += 1) {
    if (!Object.hasOwn(work.followUps, index)) throw new Error('invalid satellite worker follow-up')
    followUps.push(normalizeFollowUp(work.followUps[index]))
  }

  return { ok: true, result: { result: work.result, followUps } }
}

export function failureMessage(error) {
  if (error?.name === 'SatelliteWorkerTimeoutError') {
    return { ok: false, error: { name: 'SatelliteWorkerTimeoutError', message: 'satellite worker timed out' } }
  }
  if (error?.name === 'AbortError') {
    return { ok: false, error: { name: 'SatelliteWorkerCancelledError', message: 'satellite worker cancelled' } }
  }
  return {
    ok: false,
    error: {
      name: 'SatelliteWorkerError',
      message: 'satellite worker failed',
    },
  }
}
