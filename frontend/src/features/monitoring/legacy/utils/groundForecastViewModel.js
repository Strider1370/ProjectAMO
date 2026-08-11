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

function issueHour(value, format) {
  const text = String(value ?? '')
  if (!text.trim()) return null
  const hour = format === 'compact' ? text.slice(8, 10) : text.padStart(4, '0').slice(0, 2)
  return /^\d{2}$/.test(hour) ? `${hour}시` : null
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

export function formatGroundForecastMeta(airportForecast, icao, activeView) {
  const village = issueHour(airportForecast?.hourly_status?.base_time, 'base')
  const mid = issueHour(airportForecast?.tmFc, 'compact')
  if (activeView === GROUND_FORECAST_VIEW.WEEKLY) return `중기예보 ${mid ?? '-'} 발표`
  const location = GROUND_FORECAST_LOCATION_LABELS[icao]
  return `${location ? `${location} ` : ''}동네예보 ${village ?? '-'} 발표`
}

export function nextGroundForecastView(view) {
  return view === GROUND_FORECAST_VIEW.HOURLY
    ? GROUND_FORECAST_VIEW.WEEKLY
    : GROUND_FORECAST_VIEW.HOURLY
}
