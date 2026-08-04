import { computeFeelsLikeC, computeRelativeHumidity } from '../../shared/weather/helpers.js'

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
  // 운항 피드가 ICAO를 실어 오면 그걸 쓴다. 이름 대조는 표기가 어긋나면 조용히 실패한다.
  if (flight?.destinationIcao) {
    const byIcao = airportCatalog.find((airport) => (airport.icao || airport.id) === flight.destinationIcao)
    if (byIcao) return byIcao
    return { icao: flight.destinationIcao }
  }

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

/**
 * METAR 바람. 국내·해외 파서 모두 `direction`(도)과 `speed`(kt)로 준다.
 * 예전에는 `direction_degrees`/`speed_kt`를 읽어서 한 번도 값이 붙은 적이 없었고,
 * 화면에 보이던 바람은 전부 fixture 값이었다.
 */
function formatWind(wind) {
  if (wind?.calm) return '고요'
  const speedKt = Number(wind?.speed)
  const direction = koreanWindDirection(Number(wind?.direction))
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

export function mergeTerminalLiveWeather(flight, { airportCatalog = [], metar, metarOverseas, amos, groundForecast, overseasForecast } = {}) {
  const airport = resolveTerminalAirport(flight, airportCatalog)
  if (!airport) return flight

  const icao = airport.icao || airport.id
  // 도착 시각대 예보는 관측(METAR)과 무관하게 붙는다. 관측이 없어도 예보는 보여줄 수 있다.
  // 국내선은 실제 도착 시각, 국제선은 비행시간표로 추정한 기준 시각을 쓴다.
  const anchor = flight.forecastAnchorKst || flight.arrivalKst
  const forecast = destinationForecastFromGround(groundForecast, icao, anchor)
  const overseas = forecast ? null : forecastFromHourly(overseasForecast?.airports?.[icao]?.hourly, anchor, 5)
  const resolved = forecast || overseas
  const withForecast = resolved
    ? { ...flight, forecast: resolved, forecastSource: forecast ? 'kma' : 'met.no' }
    : flight

  const metarRecord = sourceAirportRecord(metar, icao) || sourceAirportRecord(metarOverseas, icao)
  if (!metarRecord?.observation) return withForecast

  const amosRecord = sourceAirportRecord(amos, icao)
  const observation = metarRecord.observation
  const temperature = finiteNumber(amosRecord?.weather?.temperature_c) ?? finiteNumber(observation.temperature?.air)
  const dewpoint = finiteNumber(amosRecord?.weather?.dewpoint_c) ?? finiteNumber(observation.temperature?.dewpoint)
  // AMOS는 국내 공항만 있다. 해외 목적지는 METAR의 기온·이슬점으로 상대습도를 계산한다.
  const humidity = finiteNumber(amosRecord?.weather?.humidity_pct) ?? computeRelativeHumidity(temperature, dewpoint)
  const windKt = finiteNumber(observation.wind?.speed)
  // 체감온도는 프로젝트 공용 계산을 그대로 쓴다(여름은 기상청 습구온도식, 겨울은 풍속냉각).
  const feels = computeFeelsLikeC({
    tempC: temperature,
    dewpointC: dewpoint,
    windKt,
    observedAt: metarRecord.header?.observation_time,
  }).value
  const wind = formatWind(observation.wind)
  const icon = weatherIcon(observation.display?.weather_icon)
  const current = {
    ...flight.current,
    ...(icon ? { icon } : {}),
    ...(temperature != null ? { temp: Math.round(temperature) } : {}),
    ...(feels != null ? { feels: `${Math.round(feels)}℃` } : {}),
    ...(humidity != null ? { humidity: `${Math.round(humidity)}%` } : {}),
    ...(wind ? { wind } : {}),
  }

  return {
    ...withForecast,
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

/**
 * 화면의 기준 시각. 운항 데이터를 받아온 시각을 그대로 쓴다. 벽시계를 쓰면 30초마다
 * 선택 결과가 흔들려 전환 애니메이션 중에 편성이 바뀐다.
 */
export function kstClockFromIso(iso) {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return null
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const hour = String(kst.getUTCHours()).padStart(2, '0')
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  return { time: `${hour}:${minute}`, clock: `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${hour}:${minute}` }
}

/** Fetches existing ProjectAMO endpoints only; it introduces no upstream API. */
export async function loadTerminalLiveWeatherData() {
  const [domesticAirports, overseasAirportMap, metar, metarOverseas, amos, flights, groundForecast, overseasForecast] = await Promise.all([
    fetchOptional('/api/airports'),
    fetchOptional('/data/navdata/airports-overseas.json'),
    fetchOptional('/api/metar'),
    fetchOptional('/api/metar-overseas'),
    fetchOptional('/api/amos'),
    fetchOptional('/api/terminal-flights'),
    fetchOptional('/api/ground-forecast'),
    fetchOptional('/api/overseas-forecast'),
  ])
  const overseasAirports = overseasAirportMap && typeof overseasAirportMap === 'object' ? Object.values(overseasAirportMap) : []
  return {
    airportCatalog: [...(Array.isArray(domesticAirports) ? domesticAirports : []), ...overseasAirports],
    metar,
    metarOverseas,
    amos,
    flights,
    groundForecast,
    overseasForecast,
  }
}

// 기상청 동네예보 아이콘 -> 사이니지 표시 어휘(스펙 5.3)
const GROUND_FORECAST_ICONS = Object.freeze({
  sunny: 'sun',
  mostly_cloudy: 'cloud',
  cloudy: 'cloudy',
  rain: 'rain',
  shower: 'shower',
  snow: 'snow',
  thunder: 'storm',
})

/**
 * 도착 시각부터 이어지는 시간별 예보 5칸을 기상청 자료로 만든다.
 * 도착 시각을 모르거나(국제선) 목적지 예보가 없으면 null을 돌려주고, 화면은 기존 값을 유지한다.
 */
export function destinationForecastFromGround(groundForecast, destinationIcao, arrivalKst, slots = 5) {
  return forecastFromHourly(groundForecast?.airports?.[destinationIcao]?.hourly, arrivalKst, slots)
}

/**
 * 국내는 기상청 동네예보, 해외는 MET Norway를 쓴다. 둘 다 한국 시각 기준 1시간 간격이라
 * 도착 시각으로 칸을 고르는 방식은 같다. 국내 예보가 있으면 그쪽을 먼저 쓴다.
 */
export function destinationForecast({ groundForecast, overseasForecast }, destinationIcao, arrivalKst, slots = 5) {
  return destinationForecastFromGround(groundForecast, destinationIcao, arrivalKst, slots)
    || forecastFromHourly(overseasForecast?.airports?.[destinationIcao]?.hourly, arrivalKst, slots)
}

function forecastFromHourly(hourly, arrivalKst, slots) {
  if (!Array.isArray(hourly) || hourly.length === 0) return null
  if (!/^\d{2}:\d{2}$/.test(String(arrivalKst || ''))) return null

  const arrivalHour = Number(String(arrivalKst).slice(0, 2))
  // arrivalKst엔 날짜가 없어 시각만으로 맞춘다. hourly가 3일치(72칸)로 늘어나면서 같은 시각이
  // 최대 3번 나올 수 있으므로, 매칭 전에 앞 24칸으로 잘라 "지금부터 24시간 안의 다음 그 시각"만
  // 보게 한다. 1안 보드는 원래도 이 범위만 썼으므로 동작은 바뀌지 않는다(날짜 정보가 없어
  // 그 이상은 애초에 정확히 맞출 수 없다).
  const nextDay = hourly.slice(0, 24)
  const startIndex = nextDay.findIndex((slot) => Number(String(slot?.time).slice(0, 2)) === arrivalHour)
  if (startIndex < 0) return null

  const picked = nextDay.slice(startIndex, startIndex + slots)
  if (picked.length === 0) return null
  return picked.map((slot) => [
    `${Number(String(slot.time).slice(0, 2))}시`,
    displayIcon(slot.icon),
    // MET Norway는 28.3처럼 소수점으로 준다. 사이니지는 정수만 읽힌다.
    Number.isFinite(slot.temp) ? `${Math.round(slot.temp)}℃` : '확인 중',
  ])
}

// 국내 수집기는 기상청 어휘(sunny·mostly_cloudy…)로, 해외 수집기는 이미 표시 어휘로 넘긴다.
const DISPLAY_ICONS = new Set(['sun', 'partly', 'cloud', 'cloudy', 'rain', 'shower', 'snow', 'storm'])

function displayIcon(icon) {
  if (DISPLAY_ICONS.has(icon)) return icon
  return GROUND_FORECAST_ICONS[icon] || 'cloud'
}
