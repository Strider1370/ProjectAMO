import config, { overseasAirports } from '../config.js'
import store from '../store.js'

/**
 * 해외 목적지의 시간별 기온·날씨 예보.
 *
 * 국내는 기상청 동네예보(ground_forecast)가 있지만 해외는 없다. 항공용 TAF는 해외도 받고 있으나
 * 기온이 없어서 승객용 화면을 채우지 못한다.
 *
 * MET Norway locationforecast를 쓴다. 상업·공공 게시가 허용되는(CC BY 4.0) 무료 예보 중
 * 전 세계 좌표를 시간별로 주는 곳이라 골랐다. 다른 후보(Open-Meteo 등)는 무료 등급이
 * 비상업으로 제한된다. 출처 표시가 조건이므로 화면에서 지우면 안 된다.
 */
const MET_NO_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
export const MET_NO_ATTRIBUTION = 'MET Norway (CC BY 4.0)'

// MET Norway symbol_code -> 사이니지 표시 어휘(스펙 5.3). _day/_night 접미사는 떼고 본다.
const SYMBOL_ICONS = Object.freeze({
  clearsky: 'sun',
  fair: 'sun',
  partlycloudy: 'partly',
  cloudy: 'cloudy',
  fog: 'cloudy',
  rain: 'rain',
  lightrain: 'rain',
  heavyrain: 'rain',
  rainshowers: 'shower',
  lightrainshowers: 'shower',
  heavyrainshowers: 'shower',
  sleet: 'rain',
  lightsleet: 'rain',
  heavysleet: 'rain',
  sleetshowers: 'shower',
  snow: 'snow',
  lightsnow: 'snow',
  heavysnow: 'snow',
  snowshowers: 'snow',
  rainandthunder: 'storm',
  rainshowersandthunder: 'storm',
  heavyrainandthunder: 'storm',
  snowandthunder: 'storm',
  sleetandthunder: 'storm',
})

export function symbolToIcon(symbolCode) {
  const base = String(symbolCode || '').replace(/_(day|night|polartwilight)$/, '')
  return SYMBOL_ICONS[base] || null
}

function kstParts(isoTime) {
  const date = new Date(isoTime)
  if (Number.isNaN(date.getTime())) return null
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    time: `${pad(kst.getUTCHours())}00`,
  }
}

function finite(value) {
  return Number.isFinite(value) ? value : null
}

/**
 * 예보 시각은 한국 시각으로 맞춘다. 화면이 다루는 도착 시각이 한국 시각 기준이라,
 * 여기서 현지 시간대로 바꾸면 두 번 변환하게 된다.
 */
export function extractOverseasSlots(payload, hours = 24) {
  const series = payload?.properties?.timeseries
  if (!Array.isArray(series)) return []

  return series.slice(0, hours).map((entry) => {
    const parts = kstParts(entry?.time)
    if (!parts) return null
    const details = entry?.data?.instant?.details || {}
    const symbol = entry?.data?.next_1_hours?.summary?.symbol_code
      || entry?.data?.next_6_hours?.summary?.symbol_code
    return {
      ...parts,
      temp: finite(details.air_temperature),
      humidity: finite(details.relative_humidity),
      windSpeed: finite(details.wind_speed),
      windDirection: finite(details.wind_from_direction),
      icon: symbolToIcon(symbol),
    }
  }).filter((slot) => slot && slot.temp != null)
}

async function fetchForecast(airport) {
  // TOS: 식별 가능한 User-Agent 필수(없으면 403), 좌표는 소수점 4자리까지.
  const params = new URLSearchParams({
    lat: airport.lat.toFixed(4),
    lon: airport.lon.toFixed(4),
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.api.timeout_ms)
  try {
    const response = await fetch(`${MET_NO_URL}?${params}`, {
      signal: controller.signal,
      headers: { 'User-Agent': config.met_no.user_agent },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return extractOverseasSlots(await response.json())
  } finally {
    clearTimeout(timer)
  }
}

async function process({ signal } = {}) {
  const previous = store.getCached('overseas_forecast')
  const result = {
    type: 'overseas_forecast',
    fetched_at: new Date().toISOString(),
    source: MET_NO_ATTRIBUTION,
    airports: {},
  }
  const failed = []

  for (const airport of overseasAirports) {
    if (signal?.aborted) break
    try {
      const hourly = await fetchForecast(airport)
      if (hourly.length === 0) throw new Error('empty forecast')
      result.airports[airport.icao] = { icao: airport.icao, hourly }
    } catch (error) {
      failed.push(airport.icao)
      // 한 공항이 실패해도 이전 값을 남긴다. 승객 화면에서 예보가 통째로 사라지는 편이 더 나쁘다.
      const stale = previous?.airports?.[airport.icao]
      if (stale) result.airports[airport.icao] = { ...stale, _stale: true }
    }
    // TOS: 요청을 한꺼번에 몰지 말고 고르게 분산할 것.
    await new Promise((resolve) => setTimeout(resolve, 120))
  }

  const saveResult = store.save('overseas_forecast', result)
  return {
    saved: saveResult.saved,
    airports: Object.keys(result.airports).length,
    failed,
  }
}

export { process }
export default { process }
