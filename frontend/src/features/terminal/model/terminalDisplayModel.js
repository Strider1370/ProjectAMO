export const TERMINAL_WEATHER_LABELS = Object.freeze({
  clear: '맑음',
  partly: '구름 조금',
  mostlyCloudy: '구름 많음',
  cloudy: '흐림',
  rain: '비',
  shower: '소나기',
  snow: '눈',
  storm: '뇌우',
})

const REQUIRED_PATHS = ['destination.city', 'destination.code', 'airline.flightNumber', 'id']

export function terminalFallback(value, copy = '정보 확인 중') {
  return value == null || value === '' || value === '--' ? copy : value
}

export function normalizeTerminalDataState(raw = {}) {
  const phase = ['loading', 'ready', 'partial', 'error'].includes(raw.phase) ? raw.phase : 'partial'
  return Object.freeze({
    phase,
    updatedAtKorea: raw.updatedAtKorea || null,
    hasNextPage: Boolean(raw.hasNextPage),
  })
}

export function normalizeWeatherPoint(raw) {
  if (!raw || !raw.type || raw.temperature == null || !raw.time) {
    return Object.freeze({ available: false, fallback: '예보 확인 중' })
  }
  return Object.freeze({
    ...raw,
    available: true,
    label: TERMINAL_WEATHER_LABELS[raw.type] || '예보 확인 중',
  })
}

function normalizeCurrentWeather(raw) {
  const point = normalizeWeatherPoint(raw)
  if (!point.available) return point
  return Object.freeze({
    ...point,
    feelsLike: terminalFallback(raw.feelsLike),
    humidity: terminalFallback(raw.humidity),
    wind: terminalFallback(raw.wind),
  })
}

export function formatArrivalKorea({ time, dayOffset = 0 }) {
  return dayOffset > 0 ? `다음 날 ${time}` : time
}

export function normalizeTerminalFlight(raw) {
  for (const path of REQUIRED_PATHS) {
    const value = path.split('.').reduce((current, key) => current?.[key], raw)
    if (value == null || value === '') throw new TypeError(`Missing terminal flight field: ${path}`)
  }

  return Object.freeze({
    ...raw,
    destination: Object.freeze({
      ...raw.destination,
      airportName: terminalFallback(raw.destination?.airportName),
      displayName: terminalFallback(raw.destination?.displayName, raw.destination?.city),
      timezone: terminalFallback(raw.destination?.timezone),
    }),
    airline: Object.freeze({
      ...raw.airline,
      name: terminalFallback(raw.airline?.name),
      logoKey: raw.airline?.logoKey || 'generic',
    }),
    operation: Object.freeze({
      ...raw.operation,
      status: terminalFallback(raw.operation?.status),
      departure: terminalFallback(raw.operation?.departure),
      duration: terminalFallback(raw.operation?.duration),
      gate: terminalFallback(raw.operation?.gate),
    }),
    clocks: Object.freeze({
      ...raw.clocks,
      destinationNow: terminalFallback(raw.clocks?.destinationNow),
      destinationDate: terminalFallback(raw.clocks?.destinationDate),
      koreaNow: terminalFallback(raw.clocks?.koreaNow),
      arrivalLocal: terminalFallback(raw.clocks?.arrivalLocal),
      arrivalKorea: terminalFallback(raw.clocks?.arrivalKorea),
    }),
    weather: Object.freeze({
      current: normalizeCurrentWeather(raw.weather?.current),
      preArrival: normalizeWeatherPoint(raw.weather?.preArrival),
      arrival: normalizeWeatherPoint(raw.weather?.arrival),
      afterArrival: Object.freeze((raw.weather?.afterArrival || []).map(normalizeWeatherPoint)),
    }),
    dataState: normalizeTerminalDataState(raw.dataState),
  })
}
