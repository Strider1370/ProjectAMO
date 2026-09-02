const utc = (key) => (config) => ({ expression: config.schedule[key], timezone: 'Etc/UTC' })
const kst = (key) => (config) => ({ expression: config.schedule[key], timezone: 'Asia/Seoul' })
const enabled = () => true
const radarEnabled = (config) => Boolean(config.api?.radar_satellite_auth_key)

function collector(type, schedule, isEnabled = enabled) {
  return { type, binding: type, label: type, schedule, enabled: isEnabled }
}

const scheduleKey = { kma_special_warning: 'warning', metar_overseas: 'metar', taf_overseas: 'taf', sigmet_overseas: 'sigmet' }

export const COLLECTOR_REGISTRY = [
  ...['metar', 'taf', 'warning', 'kma_special_warning', 'sigmet', 'airmet', 'sigwx_low', 'amos', 'lightning', 'typhoon', 'metar_overseas', 'taf_overseas', 'sigmet_overseas', 'rainviewer', 'environment', 'notam', 'flight_category'].map((type) => collector(type, utc(`${scheduleKey[type] || type}_interval`))),
  collector('kim_surface_wind', utc('kim_surface_wind_interval'), (config) => config.kim_nwp?.enabled !== false),
  collector('ktg', utc('ktg_interval')),
  collector('ground_forecast', kst('ground_forecast_interval')),
  collector('terminal_flights', kst('terminal_flight_interval')),
  collector('overseas_forecast', kst('overseas_forecast_interval')),
  collector('airport_info', kst('airport_info_interval')),
  collector('takeoff_fcst', kst('takeoff_fcst_interval')),
  collector('asos_ceiling', kst('asos_ceiling_interval')),
  collector('wissdom', (config) => ({ expression: config.radar_graphics?.interval || '*/10 * * * *', timezone: 'Etc/UTC' }), radarEnabled),
  collector('qpf', (config) => ({ expression: config.radar_graphics?.interval || '*/10 * * * *', timezone: 'Etc/UTC' }), radarEnabled),
  collector('hsr', (config) => ({ expression: config.radar_graphics?.interval || '*/10 * * * *', timezone: 'Etc/UTC' }), radarEnabled),
  collector('hci', (config) => ({ expression: config.radar_graphics?.interval || '*/10 * * * *', timezone: 'Etc/UTC' }), radarEnabled),
  collector('echo_top', utc('echo_top_interval'), (config) => radarEnabled(config) && config.radar_echo_top?.enabled !== false),
  collector('satellite', utc('satellite_interval'), radarEnabled),
  collector('satellite_visible', utc('satellite_visible_interval'), radarEnabled),
]

export function activeCollectorRegistry(config) {
  return COLLECTOR_REGISTRY.filter((item) => item.enabled(config)).map((item) => ({ ...item, schedule: item.schedule(config) }))
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
  for (const item of activeCollectorRegistry(config)) {
    if (!item.schedule.expression || !item.schedule.timezone) throw new Error(`invalid_collector_schedule:${item.type}`)
  }
}
