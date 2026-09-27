export const GROUND_FORECAST_VIEW = {
  HOURLY: 'hourly',
  WEEKLY: 'weekly',
}

export const GROUND_FORECAST_CYCLE_MS = 12_000
export const GROUND_FORECAST_FADE_MS = 350

export const GROUND_FORECAST_LOCATION_LABELS = Object.freeze({
  RKSI: '운서동',
  RKSS: '공항동',
  RKPC: '용담2동',
  RKPK: '대저2동',
  RKJB: '망운면',
  RKJY: '율촌면',
  RKPU: '송정동',
  RKNY: '손양면',
})

function padSlots(slots, count) {
  return [...slots.slice(0, count), ...Array(Math.max(0, count - slots.length)).fill(null)]
}

function isThreeHourSlot(slot) {
  const hourText = String(slot?.time ?? '').slice(0, 2)
  return /^\d{2}$/.test(hourText) && Number(hourText) % 3 === 0
}

export function formatGroundForecastIssue(value, tz = 'KST') {
  const text = String(value ?? '')
  if (!/^\d{10}(\d{2})?$/.test(text)) return null
  const ms = Date.UTC(+text.slice(0, 4), +text.slice(4, 6) - 1, +text.slice(6, 8), +text.slice(8, 10) - 9, text.length === 12 ? +text.slice(10, 12) : 0)
  if (!Number.isFinite(ms)) return null
  const date = new Date(ms + (tz === 'UTC' ? 0 : 9 * 3600_000))
  const two = (number) => String(number).padStart(2, '0')
  return `${two(date.getUTCMonth() + 1)}/${two(date.getUTCDate())} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} ${tz === 'UTC' ? 'UTC' : 'KST'}`
}

export function groundForecastSlotStamp(slot, tz = 'KST') {
  const date = String(slot?.date ?? '')
  const time = String(slot?.time ?? '')
  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) return null
  const ms = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +time.slice(0, 2) - 9, +time.slice(2, 4))
  if (!Number.isFinite(ms)) return null
  const display = new Date(ms + (tz === 'UTC' ? 0 : 9 * 3600_000))
  const two = (number) => String(number).padStart(2, '0')
  return {
    dateKey: `${display.getUTCFullYear()}-${two(display.getUTCMonth() + 1)}-${two(display.getUTCDate())}`,
    dayLabel: `${display.getUTCDate()}일`,
    hourLabel: `${display.getUTCHours()}시`,
  }
}

export function selectHourlyForecastSlots(hourly) {
  const slots = Array.isArray(hourly) ? hourly.filter(isThreeHourSlot) : []
  return padSlots(slots, 8)
}

export function selectWeeklyForecastDays(forecast) {
  const days = Array.isArray(forecast) ? forecast.filter((day) => !day?.isToday) : []
  return padSlots(days, 6)
}

export function weeklyWeekdayClass(weekday) {
  if (weekday === '토') return 'is-saturday'
  if (weekday === '일') return 'is-sunday'
  return ''
}

export function forecastColumnCenter(index, { start, end, count }) {
  const width = (end - start) / count
  return start + width * (index + 0.5)
}

export function createTemperatureScale(slots, { top, bottom }) {
  const values = slots.map((slot) => slot?.temp).filter(Number.isFinite)
  if (!values.length) return () => null
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  if (rawMin === rawMax) return (value) => Number.isFinite(value) ? (top + bottom) / 2 : null
  const min = rawMin - 1
  const max = rawMax + 1
  return (value) => Number.isFinite(value)
    ? bottom - ((value - min) / (max - min)) * (bottom - top)
    : null
}

export function precipitationBar(value, { top, bottom }) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const height = ((bottom - top) * percent) / 100
  return { value: percent, y: bottom - height, height }
}

export function formatGroundForecastMeta(airportForecast, icao, activeView, tz = 'KST') {
  const hourly = airportForecast?.hourly_status
  const village = formatGroundForecastIssue(`${hourly?.base_date || ''}${hourly?.base_time || ''}`, tz)
  const mid = formatGroundForecastIssue(airportForecast?.tmFc, tz)
  if (activeView === GROUND_FORECAST_VIEW.WEEKLY) return `중기예보 ${mid ?? '-'} 발표`
  const location = GROUND_FORECAST_LOCATION_LABELS[icao]
  return `${location ? `${location} ` : ''}동네예보 ${village ?? '-'} 발표`
}

export function nextGroundForecastView(view) {
  return view === GROUND_FORECAST_VIEW.HOURLY
    ? GROUND_FORECAST_VIEW.WEEKLY
    : GROUND_FORECAST_VIEW.HOURLY
}
