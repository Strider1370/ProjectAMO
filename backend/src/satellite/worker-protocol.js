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
      if (keys.some((key) => key !== 'length' && (typeof key !== 'string' || !Number.isInteger(Number(key)) || Number(key) < 0 || String(Number(key)) !== key))) return false
    }

    seen.add(value)
    const safe = keys.every((key) => {
      if (Array.isArray(value) && key === 'length') return true
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

function isFrameTime(value) {
  return typeof value === 'string' && /^\d{12}$/.test(value)
}

function serializeFrame(frame, errorMessage) {
  if (!isPlainObject(frame) || !isJsonSafe(frame)) throw new Error(errorMessage)

  const result = {}
  for (const key of ['tm', 'requestTm', 'displayTm', 'request_tm_utc', 'tm_utc']) {
    if (!(key in frame)) continue
    if (!isFrameTime(frame[key])) throw new Error(errorMessage)
    result[key] = frame[key]
  }
  if ('fogAttempts' in frame) {
    if (!Number.isInteger(frame.fogAttempts) || frame.fogAttempts < 0) throw new Error(errorMessage)
    result.fogAttempts = frame.fogAttempts
  }
  if (Object.keys(result).length === 0) throw new Error(errorMessage)
  return result
}

function serializePublishedFrame(frame) {
  const result = serializeFrame(frame, 'invalid satellite worker success result')
  if ('path' in frame) {
    if (typeof frame.path !== 'string' || !frame.path.startsWith('/data/satellite/')) {
      throw new Error('invalid satellite worker success result')
    }
    result.path = frame.path
  }
  if ('bounds' in frame) {
    if (!Array.isArray(frame.bounds)
      || frame.bounds.length !== 2
      || !frame.bounds.every((point) => Array.isArray(point)
        && point.length === 2
        && point.every((coordinate) => Number.isFinite(coordinate)))) {
      throw new Error('invalid satellite worker success result')
    }
    result.bounds = frame.bounds
  }
  return result
}

function serializeResult(result) {
  if (!isPlainObject(result) || !isJsonSafe(result)) throw new Error('JSON-safe satellite worker payload required')

  const safe = {}
  if ('type' in result) {
    if (!['satellite', 'satellite_visible'].includes(result.type)) throw new Error('invalid satellite worker success result')
    safe.type = result.type
  }
  if ('saved' in result) {
    if (typeof result.saved !== 'boolean') throw new Error('invalid satellite worker success result')
    safe.saved = result.saved
  }
  for (const key of ['frameCount', 'deferredCount', 'maxLevel', 'bytes']) {
    if (!(key in result)) continue
    if (!Number.isFinite(result[key]) || result[key] < 0) throw new Error('invalid satellite worker success result')
    safe[key] = result[key]
  }
  for (const key of ['tm', 'request_tm_utc']) {
    if (!(key in result)) continue
    if (!isFrameTime(result[key])) throw new Error('invalid satellite worker success result')
    safe[key] = result[key]
  }
  if ('backgroundFillRunning' in result) {
    if (typeof result.backgroundFillRunning !== 'boolean') throw new Error('invalid satellite worker success result')
    safe.backgroundFillRunning = result.backgroundFillRunning
  }
  if ('reason' in result) {
    if (!['no data available', 'no-auth-key', 'already-collected', 'night'].includes(result.reason)
      && !(typeof result.reason === 'string' && /^http-(?:\d{3}|undefined)$/.test(result.reason))) {
      throw new Error('invalid satellite worker success result')
    }
    safe.reason = result.reason
  }
  if ('frames' in result) {
    if (!Array.isArray(result.frames)) throw new Error('invalid satellite worker success result')
    safe.frames = result.frames.map(serializePublishedFrame)
  }
  return safe
}

// 워커가 잰 API 허브 사용량. 부모가 이 숫자로 하루 예산을 집계하므로 엉터리 값을 통과시키면
// 멀쩡한 열쇠가 막히거나, 반대로 초과를 못 잡는다.
function serializeApiHubUsage(usage) {
  if (!Array.isArray(usage)) throw new Error('invalid satellite worker api hub usage')
  return usage.map((entry) => {
    if (!isPlainObject(entry)
      || typeof entry.endpoint !== 'string' || entry.endpoint.length === 0
      || !Number.isFinite(entry.bytes) || entry.bytes < 0
      || !Number.isFinite(entry.status)) {
      throw new Error('invalid satellite worker api hub usage')
    }
    return { endpoint: entry.endpoint, bytes: entry.bytes, status: entry.status }
  })
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
  if ('fillAll' in message && typeof message.fillAll !== 'boolean') {
    throw new Error('invalid satellite worker full history flag')
  }
  if (message.fillAll === true && message.mode !== 'current') {
    throw new Error('invalid satellite worker full history flag')
  }
  const frame = 'frame' in message ? serializeFrame(message.frame, 'invalid satellite worker frame') : undefined

  return {
    kind: message.kind,
    mode: message.mode,
    now: message.now,
    ...(frame ? { frame } : {}),
    ...(message.fillAll === true ? { fillAll: true } : {}),
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
  const frame = 'frame' in followUp ? serializeFrame(followUp.frame, 'invalid satellite worker follow-up') : undefined
  if (!isJsonSafe(followUp)) throw new Error('invalid satellite worker follow-up')

  return {
    kind: followUp.kind,
    mode: followUp.mode,
    now: followUp.now,
    ...(frame ? { frame } : {}),
    delayMs: followUp.delayMs,
  }
}

export function successMessage(work) {
  if (!isPlainObject(work) || !Object.hasOwn(work, 'result') || !Array.isArray(work.followUps)) {
    throw new Error('invalid satellite worker success result')
  }
  const result = serializeResult(work.result)
  const followUps = []
  for (let index = 0; index < work.followUps.length; index += 1) {
    if (!Object.hasOwn(work.followUps, index)) throw new Error('invalid satellite worker follow-up')
    followUps.push(normalizeFollowUp(work.followUps[index]))
  }

  // 사용량은 있을 때만 싣는다 — 없으면 필드를 만들지 않아 옛 메시지와 모양이 같다.
  const apiHubUsage = Object.hasOwn(work, 'apiHubUsage') ? serializeApiHubUsage(work.apiHubUsage) : []
  return { ok: true, result: { result, followUps, ...(apiHubUsage.length ? { apiHubUsage } : {}) } }
}

export function failureMessage(error) {
  let name
  try {
    name = error?.name
  } catch {
    name = undefined
  }
  if (name === 'SatelliteWorkerTimeoutError') {
    return { ok: false, error: { name: 'SatelliteWorkerTimeoutError', message: 'satellite worker timed out' } }
  }
  if (name === 'AbortError') {
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
