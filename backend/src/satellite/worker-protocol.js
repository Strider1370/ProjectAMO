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
  seen.add(value)
  const safe = Object.values(value).every((entry) => isJsonSafe(entry, seen))
  seen.delete(value)
  return safe
}

function assertValidTime(now, errorMessage) {
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now))) throw new Error(errorMessage)
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

function assertFollowUp(followUp) {
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
}

export function successMessage(work) {
  if (!isPlainObject(work) || !Object.hasOwn(work, 'result') || !Array.isArray(work.followUps)) {
    throw new Error('invalid satellite worker success result')
  }
  if (!isJsonSafe(work.result)) throw new Error('JSON-safe satellite worker payload required')
  work.followUps.forEach(assertFollowUp)

  return { ok: true, result: { result: work.result, followUps: work.followUps } }
}

export function failureMessage(error) {
  return {
    ok: false,
    error: {
      name: typeof error?.name === 'string' ? error.name : 'Error',
      message: typeof error?.message === 'string' ? error.message : String(error ?? 'Unknown error'),
    },
  }
}
