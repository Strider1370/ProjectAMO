// Deterministic, synthetic design fixtures. These are NOT operational routes or forecasts.
import { GKTG_BANDS } from '../../../../shared/gktg.js'
import { color } from '../../shared/theme/tokens.js'

export const TOTAL_NM = 312
export const BASE_TIME = Date.parse('2026-10-11T15:00:00Z')
export const WAYPOINTS = [
  { name: 'RKSI', nm: 0, lon: 126.45, lat: 37.46 },
  { name: 'BOPTA', nm: 32, lon: 126.03, lat: 37.08 },
  { name: 'ELPOS', nm: 56, lon: 125.82, lat: 36.74 },
  { name: 'DALSU', nm: 81, lon: 125.65, lat: 36.41 },
  { name: 'DOTOL', nm: 108, lon: 125.58, lat: 36.06 },
  { name: 'REMOS', nm: 134, lon: 125.6, lat: 35.73 },
  { name: 'DOMKO', nm: 158, lon: 125.67, lat: 35.4 },
  { name: 'KANKA', nm: 183, lon: 125.76, lat: 35.07 },
  { name: 'ATOTI', nm: 209, lon: 125.92, lat: 34.72 },
  { name: 'SALMI', nm: 237, lon: 126.08, lat: 34.35 },
  { name: 'MAKET', nm: 269, lon: 126.29, lat: 33.98 },
  { name: 'RKPC', nm: 312, lon: 126.49, lat: 33.51 },
]
export const LAYERS = [
  { id: 'cloud', group: '현상', label: '구름', tone: '#a6adb3' },
  { id: 'icing', group: '현상', label: '착빙', tone: color.icing[2] },
  { id: 'turbulence', group: '현상', label: '난류', tone: GKTG_BANDS[2].color },
  { id: 'wind', group: '상층 바람', label: '바람깃', tone: color.accent },
  { id: 'isotachs', group: '상층 바람', label: '등풍속선', tone: color.accent },
  { id: 'temperature', group: '기준선·특보', label: '등온선', tone: color.level.red },
  { id: 'tropopauseJet', group: '상층 바람', label: '권계면·제트', tone: '#6d28d9' },
  { id: 'advisory', group: '기준선·특보', label: 'SIGMET', tone: color.level.red },
]
export const DEFAULT_LAYERS = Object.fromEntries(LAYERS.map(({ id }) => [id, true]))
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
export function plannedAltitude(nm, cruise) {
  return Math.min(cruise, nm / 44 * cruise, (TOTAL_NM - nm) / 62 * cruise)
}
export function routePosition(nm) {
  const next = WAYPOINTS.findIndex(p => p.nm >= nm)
  const b = WAYPOINTS[Math.max(1, next)]
  const a = WAYPOINTS[Math.max(0, next - 1)]
  const t = clamp((nm - a.nm) / (b.nm - a.nm), 0, 1)
  return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t }
}
export function formatTime(hour, tz, date = false) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz === 'KST' ? 'Asia/Seoul' : 'UTC', hour: '2-digit', minute: '2-digit',
    ...(date ? { month: '2-digit', day: '2-digit' } : {}), hourCycle: 'h23',
  }).formatToParts(BASE_TIME + hour * 3600000)
  const value = type => parts.find(p => p.type === type)?.value
  return `${date ? `${value('month')}/${value('day')} ` : ''}${value('hour')}:${value('minute')}`
}
export function hazards(hour = 0) {
  const shift = hour * 6
  return [
    { id: 'sigmet', type: 'advisory', title: 'SIGMET · EMBD TS', short: 'EMBD TS', grade: 'SIGMET', start: 120 + shift, end: 170 + shift, bottom: 14000, top: 39000, color: color.level.red, description: '구름 속 뇌우 구역. 선택 예보시각의 수평 범위와 고도 범위를 함께 확인하세요.' },
    { id: 'turb', type: 'turbulence', title: '난류 · MOD', short: 'MOD 난류', grade: 'MOD', start: 193 - shift, end: 245 - shift, bottom: 29000, top: 38000, color: GKTG_BANDS[2].color, description: '상층의 중간 강도 난류 구역. 다른 계획 고도에서 교차 범위가 어떻게 달라지는지 비교할 수 있습니다.' },
    { id: 'ice', type: 'icing', title: '착빙 · MOD', short: 'MOD 착빙', grade: 'MOD', start: 56 + shift, end: 110 + shift, bottom: 11000, top: 18000, color: color.icing[2], description: '중층의 착빙 구역. 순항뿐 아니라 상승·하강 구간과의 교차도 확인하세요.' },
  ]
}
export function exposure(hazard, cruise) {
  let length = 0
  for (let nm = hazard.start; nm < hazard.end; nm++) {
    const a = plannedAltitude(nm + 0.5, cruise)
    if (a >= hazard.bottom && a <= hazard.top) length++
  }
  return length
}
// Independent synthetic tropopause and jet fixtures; no operational thresholds implied.
export function tropopauseAltitude(nm, hour = 0) {
  return 39500 + 1700 * Math.sin(nm / 74 + hour * .18) - 2200 * Math.exp(-(((nm - 175 - hour * 5) / 42) ** 2))
}
export function jetCores(hour = 0) {
  return [{ id: 'jet-1', nm: 176 + hour * 6, ft: 33500 + hour * 500 }]
}
export function windSpeed(nm, ft, hour = 0) {
  if (ft > 42000) return NaN
  return 16 + ft / 700 + 7 * Math.sin(nm / 40 + hour) + jetCores(hour).reduce((sum, jet) => sum + 65 * Math.exp(-(((nm - jet.nm) / 38) ** 2) - (((ft - jet.ft) / 4200) ** 2)), 0)
}
export function sampleWeather(nm, ft, hour) {
  if (ft > 42000) return { missing: true, wind: null, icing: null, turbulence: null }
  const active = hazards(hour).filter(h => nm >= h.start && nm <= h.end && ft >= h.bottom && ft <= h.top)
  return { missing: false, wind: Math.round(windSpeed(nm, ft, hour)),
    direction: Math.round(250 + 18 * Math.sin(nm / 65)),
    icing: active.some(h => h.type === 'icing') ? 'MOD' : 'NIL',
    turbulence: active.some(h => h.type === 'turbulence') ? 'MOD' : 'NIL',
    advisory: active.some(h => h.type === 'advisory'),
    temperature: Math.round(15 - ft / 1900),
  }
}
export function terrain(nm) {
  return 180 + 650 * Math.exp(-(((nm - 20) / 13) ** 2)) + 1800 * Math.exp(-(((nm - 296) / 11) ** 2))
}
