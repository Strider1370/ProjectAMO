const CONTEXT_KEYS = new Set([
  'readers',
  'weatherNow',
  'realNow',
  'clockMode',
  'displayTimezone',
])

const READER_KEYS = ['metar', 'taf', 'warning']

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function checkedClock(name, clock) {
  return () => {
    const value = clock()
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${name} must return finite epoch milliseconds`)
    }

    try {
      new Date(value).toISOString()
    } catch {
      throw new TypeError(`${name} must return representable epoch milliseconds`)
    }
    return value
  }
}

export function createDataContext(options) {
  if (!isPlainObject(options)) throw new TypeError('data context must be an object')
  if (Object.keys(options).some((key) => !CONTEXT_KEYS.has(key))) {
    throw new TypeError('data context contains unsupported fields')
  }

  const {
    readers,
    weatherNow,
    realNow,
    clockMode,
    displayTimezone,
  } = options

  if (!isPlainObject(readers)) {
    throw new TypeError('readers must be an object')
  }
  if (
    Object.keys(readers).some((key) => !READER_KEYS.includes(key))
    || !READER_KEYS.every((key) => typeof readers[key] === 'function')
  ) {
    throw new TypeError('readers.metar/taf/warning are required functions')
  }
  if (typeof weatherNow !== 'function' || typeof realNow !== 'function') {
    throw new TypeError('weatherNow and realNow are required functions')
  }
  if (!['live', 'fixture'].includes(clockMode)) {
    throw new TypeError('invalid clockMode')
  }
  if (typeof displayTimezone !== 'string' || displayTimezone.length === 0) {
    throw new TypeError('displayTimezone is required')
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: displayTimezone }).format()
  } catch {
    throw new TypeError('invalid displayTimezone')
  }

  return Object.freeze({
    readers: Object.freeze({ ...readers }),
    weatherNow: checkedClock('weatherNow', weatherNow),
    realNow: checkedClock('realNow', realNow),
    clockMode,
    displayTimezone,
  })
}
