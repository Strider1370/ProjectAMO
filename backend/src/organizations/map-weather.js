import config, { overseasAirports } from '../config.js'

// Match the main map's airport catalog and domestic/overseas METAR merge.
// Bundle callers keep their own copy so later collection cannot mutate a presentation.
export function organizationMapWeather(weather = {}) {
  const domestic = weather.metar ?? null
  const overseas = weather.metar_overseas ?? weather.metarOverseas ?? null
  return structuredClone({
    airports: [...config.airports.filter(airport => airport.icao !== 'TST1'),
      ...overseasAirports.map(airport => ({ ...airport, overseas: true }))],
    metar: domestic || overseas ? {
      ...(domestic || overseas),
      airports: { ...(domestic?.airports || {}), ...(overseas?.airports || {}) },
    } : null,
  })
}
