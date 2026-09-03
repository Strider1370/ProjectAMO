import productionConfig from './config.js'
import cron from 'node-cron'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const utc = (key, maxIntervalMs, graceMs, quiet) => (config) => ({ expression: config.schedule[key], timezone: 'Etc/UTC', maxIntervalMs, graceMs, ...(quiet ? { quiet } : {}) })
const kst = (key, maxIntervalMs, graceMs, quiet) => (config) => ({ expression: config.schedule[key], timezone: 'Asia/Seoul', maxIntervalMs, graceMs, ...(quiet ? { quiet } : {}) })
const enabled = () => true
const radarEnabled = (config) => Boolean(config.api?.radar_satellite_auth_key)
const graphicsEnabled = (config) => radarEnabled(config) && config.radar_graphics?.enabled !== false

function collector(type, schedule, isEnabled = enabled) {
  return { type, binding: type, label: type, schedule, enabled: isEnabled }
}

const scheduleKey = { kma_special_warning: 'warning', metar_overseas: 'metar', taf_overseas: 'taf', sigmet_overseas: 'sigmet' }
const standardSchedule = {
  metar: [5 * MINUTE, 5 * MINUTE], taf: [10 * MINUTE, 10 * MINUTE], warning: [5 * MINUTE, 5 * MINUTE],
  kma_special_warning: [5 * MINUTE, 5 * MINUTE], sigmet: [5 * MINUTE, 5 * MINUTE], airmet: [5 * MINUTE, 5 * MINUTE],
  sigwx_low: [6 * HOUR, 35 * MINUTE], amos: [5 * MINUTE, 5 * MINUTE], lightning: [5 * MINUTE, 5 * MINUTE],
  typhoon: [30 * MINUTE, 10 * MINUTE], metar_overseas: [5 * MINUTE, 5 * MINUTE], taf_overseas: [10 * MINUTE, 10 * MINUTE],
  sigmet_overseas: [5 * MINUTE, 5 * MINUTE], rainviewer: [10 * MINUTE, 10 * MINUTE], environment: [HOUR, 10 * MINUTE],
  notam: [6 * HOUR, 35 * MINUTE], flight_category: [20 * MINUTE, 10 * MINUTE],
}
const EARLY_MORNING = { fromHourKst: 0, toHourKst: 4 }

function graphicsSchedule(config) {
  const expression = config.radar_graphics?.interval || '*/10 * * * *'
  const match = /^\*\/([1-9]|[1-5]\d) \* \* \* \*$/.exec(expression)
  if (!match) throw new Error('invalid_graphics_schedule')
  return { expression, timezone: 'Etc/UTC', maxIntervalMs: Number(match[1]) * MINUTE, graceMs: 10 * MINUTE }
}

export const COLLECTOR_REGISTRY = [
  ...Object.keys(standardSchedule).map((type) => collector(type, utc(`${scheduleKey[type] || type}_interval`, ...standardSchedule[type]))),
  collector('kim_surface_wind', utc('kim_surface_wind_interval', 4 * HOUR, 35 * MINUTE), (config) => config.kim_nwp?.enabled !== false),
  collector('ktg', utc('ktg_interval', 5 * HOUR, 35 * MINUTE)),
  collector('ground_forecast', kst('ground_forecast_interval', 3 * HOUR, 35 * MINUTE)),
  collector('terminal_flights', kst('terminal_flight_interval', MINUTE, MINUTE, EARLY_MORNING)),
  collector('overseas_forecast', kst('overseas_forecast_interval', HOUR, 35 * MINUTE, EARLY_MORNING)),
  collector('airport_info', kst('airport_info_interval', 12.5 * HOUR, 35 * MINUTE)),
  collector('takeoff_fcst', kst('takeoff_fcst_interval', HOUR, 10 * MINUTE)),
  collector('asos_ceiling', kst('asos_ceiling_interval', HOUR, 10 * MINUTE)),
  ...['wissdom', 'qpf', 'hsr', 'hci'].map((type) => collector(type, graphicsSchedule, graphicsEnabled)),
  collector('echo_top', utc('echo_top_interval', 5 * MINUTE, 10 * MINUTE), (config) => radarEnabled(config) && config.radar_echo_top?.enabled !== false),
  collector('satellite', utc('satellite_interval', 5 * MINUTE, 10 * MINUTE), radarEnabled),
  collector('satellite_visible', utc('satellite_visible_interval', 5 * MINUTE, 10 * MINUTE), radarEnabled),
]

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergeConfig(defaults, override) {
  if (!isPlainObject(override)) return defaults
  const merged = { ...defaults }
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(defaults[key]) && isPlainObject(value) ? mergeConfig(defaults[key], value) : value
  }
  return merged
}

function resolveRegistry(registry, partialConfig) {
  const config = mergeConfig(productionConfig, partialConfig)
  return registry.filter((item) => item.enabled(config)).map((item) => {
    let schedule
    try {
      schedule = item.schedule(config)
    } catch {
      throw new Error(`invalid_collector_schedule:${item.type}`)
    }
    if (!validSchedule(schedule)) throw new Error(`invalid_collector_schedule:${item.type}`)
    return { ...item, schedule }
  })
}

export function activeCollectorRegistry(partialConfig = {}) {
  return resolveRegistry(COLLECTOR_REGISTRY, partialConfig)
}

function validQuiet(quiet) {
  return quiet === undefined || (isPlainObject(quiet)
    && Object.keys(quiet).sort().join(',') === 'fromHourKst,toHourKst'
    && Number.isInteger(quiet.fromHourKst) && quiet.fromHourKst >= 0 && quiet.fromHourKst <= 23
    && Number.isInteger(quiet.toHourKst) && quiet.toHourKst >= 0 && quiet.toHourKst <= 23
    && quiet.fromHourKst !== quiet.toHourKst)
}

function validSchedule(schedule) {
  if (!isPlainObject(schedule)
    || typeof schedule.expression !== 'string' || schedule.expression.length === 0
    || typeof schedule.timezone !== 'string' || schedule.timezone.length === 0
    || !Number.isFinite(schedule.maxIntervalMs) || schedule.maxIntervalMs <= 0
    || !Number.isFinite(schedule.graceMs) || schedule.graceMs < 0
    || !validQuiet(schedule.quiet)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone })
    return cron.validate(schedule.expression)
  } catch {
    return false
  }
}

export function assertCollectorRegistry(registry = COLLECTOR_REGISTRY, config = {}) {
  const ids = new Set()
  for (const item of registry) {
    if (!item?.type || !item.binding || typeof item.schedule !== 'function' || typeof item.enabled !== 'function' || ids.has(item.type)) {
      const error = new Error('invalid_collector_registry')
      error.code = 'invalid_collector_registry'
      throw error
    }
    ids.add(item.type)
  }
  for (const item of resolveRegistry(registry, config)) {
    if (!validSchedule(item.schedule)) throw new Error(`invalid_collector_schedule:${item.type}`)
  }
}
