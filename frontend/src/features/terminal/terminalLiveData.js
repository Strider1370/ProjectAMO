function compactAirportName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/international|intl|국제공항|공항/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function airportNames(airport) {
  return [airport?.nameKo, airport?.name, airport?.airportName]
    .map(compactAirportName)
    .filter(Boolean)
}

/**
 * This is deliberately name-based for the fixture transition: it consumes only
 * the airport catalog that the application already publishes. A later flight
 * feed must replace it with its authoritative IATA/ICAO relation.
 */
export function resolveTerminalAirport(flight, airportCatalog = []) {
  const candidates = [flight?.airport, flight?.displayName, flight?.city]
    .map(compactAirportName)
    .filter(Boolean)

  return airportCatalog.find((airport) => {
    const names = airportNames(airport)
    return candidates.some((candidate) => names.includes(candidate))
  }) || null
}

function weatherIcon(icon) {
  const value = String(icon || '').toUpperCase()
  if (/TS/.test(value)) return 'storm'
  if (/SH/.test(value)) return 'shower'
  if (/RA|DZ/.test(value)) return 'rain'
  if (/SN/.test(value)) return 'snow'
  if (/CLR|SKC|CAVOK|NSW/.test(value)) return 'sun'
  return null
}

function koreanWindDirection(degrees) {
  if (!Number.isFinite(degrees)) return null
  const labels = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서']
  return labels[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]
}

function formatWind(wind) {
  const speedKt = Number(wind?.speed_kt)
  const direction = koreanWindDirection(Number(wind?.direction_degrees))
  if (!Number.isFinite(speedKt) || !direction) return null
  return `${direction} ${Math.round(speedKt * 0.514444)}m/s`
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sourceAirportRecord(source, icao) {
  return source?.airports?.[icao] || null
}

export function mergeTerminalLiveWeather(flight, { airportCatalog = [], metar, metarOverseas, amos } = {}) {
  const airport = resolveTerminalAirport(flight, airportCatalog)
  if (!airport) return flight

  const icao = airport.icao || airport.id
  const metarRecord = sourceAirportRecord(metar, icao) || sourceAirportRecord(metarOverseas, icao)
  if (!metarRecord?.observation) return flight

  const amosRecord = sourceAirportRecord(amos, icao)
  const temperature = finiteNumber(amosRecord?.weather?.temperature_c) ?? finiteNumber(metarRecord.observation.temperature?.air)
  const humidity = finiteNumber(amosRecord?.weather?.humidity_pct)
  const wind = formatWind(metarRecord.observation.wind)
  const icon = weatherIcon(metarRecord.observation.display?.weather_icon)
  const current = {
    ...flight.current,
    ...(icon ? { icon } : {}),
    ...(temperature != null ? { temp: Math.round(temperature) } : {}),
    ...(humidity != null ? { humidity: `${Math.round(humidity)}%` } : {}),
    ...(wind ? { wind } : {}),
  }

  return {
    ...flight,
    current,
    liveWeather: {
      airportIcao: icao,
      updatedAt: metar?.fetched_at || metarOverseas?.fetched_at || metarRecord.header?.observation_time || null,
    },
  }
}

function fetchOptional(url) {
  return fetch(url).then(async (response) => response.ok ? response.json() : null).catch(() => null)
}

/** Fetches existing ProjectAMO endpoints only; it introduces no upstream API. */
export async function loadTerminalLiveWeatherData() {
  const [domesticAirports, overseasAirportMap, metar, metarOverseas, amos] = await Promise.all([
    fetchOptional('/api/airports'),
    fetchOptional('/data/navdata/airports-overseas.json'),
    fetchOptional('/api/metar'),
    fetchOptional('/api/metar-overseas'),
    fetchOptional('/api/amos'),
  ])
  const overseasAirports = overseasAirportMap && typeof overseasAirportMap === 'object' ? Object.values(overseasAirportMap) : []
  return {
    airportCatalog: [...(Array.isArray(domesticAirports) ? domesticAirports : []), ...overseasAirports],
    metar,
    metarOverseas,
    amos,
  }
}
