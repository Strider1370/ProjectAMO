import { getMoonIllumination, getMoonPosition, getMoonTimes, getTimes } from 'suncalc'
import { SearchMoonPhase } from 'astronomy-engine'
import { nightSummary } from './illuminance.js'

const HOUR = 3600_000
const DAY = 24 * HOUR
const SAMPLE = 10 * 60_000

// 주요 위상의 전후 구간은 '무렵'으로 표시해 정확한 발생 시각과 구분한다.
export function moonPhaseLabel(phase) {
  const names = ['삭 무렵', '초승달', '상현달 무렵', '상현 이후', '보름달 무렵', '보름 이후', '하현달 무렵', '그믐달']
  return names[Math.floor((((phase % 1) + 1) % 1 + 1 / 16) * 8) % 8]
}

// 달의 윗변이 지평선 아래인 구간. 월출·월몰과 같은 SunCalc 기준을 사용한다.
export function belowHorizonRanges(samples) {
  if (!samples.length) return []
  const ranges = []
  const height = sample => sample.visibilityAltitude ?? sample.altitude
  let start = height(samples[0]) < 0 ? samples[0].t : null
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if ((height(a) < 0) === (height(b) < 0)) continue
    const crossing = a.t + (b.t - a.t) * (-height(a) / (height(b) - height(a)))
    if (start != null) { ranges.push([start, crossing]); start = null }
    else start = crossing
  }
  if (start != null) ranges.push([start, samples.at(-1).t])
  return ranges
}

// A night starts at local sunset and ends at the next sunrise. The fraction
// shown in the calendar is evaluated at the midpoint, as in the previous UI.
export function moonNight(eveningDate, lat, lon) {
  const sunset = getTimes(eveningDate, lat, lon).sunset?.getTime()
  const sunrise = getTimes(new Date(eveningDate.getTime() + DAY), lat, lon).sunrise?.getTime()
  if (!Number.isFinite(sunset) || !Number.isFinite(sunrise) || sunrise <= sunset) return null

  const illumination = getMoonIllumination(new Date((sunset + sunrise) / 2))
  const samples = []
  for (let t = sunset; t < sunrise; t += SAMPLE) {
    samples.push({ t, altitude: getMoonPosition(new Date(t), lat, lon).altitude })
  }
  samples.push({ t: sunrise, altitude: getMoonPosition(new Date(sunrise), lat, lon).altitude })
  const sampledPeak = samples.reduce((a, b) => b.altitude > a.altitude ? b : a)
  let lo = Math.max(sunset, sampledPeak.t - SAMPLE)
  let hi = Math.min(sunrise, sampledPeak.t + SAMPLE)
  // 10분 간격에서 잡은 밤중 최고점을 다시 찾아 표기 시각을 분 단위로 개선한다.
  while (hi - lo > 1000) {
    const left = lo + (hi - lo) / 3
    const right = hi - (hi - lo) / 3
    if (getMoonPosition(new Date(left), lat, lon).altitude < getMoonPosition(new Date(right), lat, lon).altitude) lo = left
    else hi = right
  }
  const refinedTime = (lo + hi) / 2
  const refined = { t: refinedTime, altitude: getMoonPosition(new Date(refinedTime), lat, lon).altitude }
  const peak = refined.altitude > sampledPeak.altitude ? refined : sampledPeak
  const peakIllumination = getMoonIllumination(new Date(peak.t))
  const chartStart = eveningDate.getTime()
  const chartEnd = chartStart + DAY
  const chartSamples = []
  for (let t = chartStart; t <= chartEnd; t += SAMPLE) {
    const position = getMoonPosition(new Date(t), lat, lon)
    // SunCalc 월출·월몰: 겉보기 중심 고도 + 시반경 + 잔여 굴절 보정.
    const limb = 0.2725 * Math.asin(6378.14 / position.distance) * 180 / Math.PI + 0.09
    chartSamples.push({ t, altitude: position.altitude, visibilityAltitude: position.altitude + limb })
  }

  // SunCalc returns events for a UTC day; scan each UTC day touched by the night.
  let moonrise = null
  let moonset = null
  let calendarMoonrise = null
  let calendarMoonset = null
  const calendarStart = chartStart - 12 * HOUR
  const calendarEnd = calendarStart + DAY
  for (let day = Math.floor(Math.min(sunset, calendarStart) / DAY) * DAY; day <= Math.max(sunrise, calendarEnd); day += DAY) {
    const events = getMoonTimes(new Date(day), lat, lon)
    for (const [key, value] of [['rise', events.rise], ['set', events.set]]) {
      const t = value?.getTime()
      if (t >= sunset && t <= sunrise) {
        if (key === 'rise') moonrise = t
        else moonset = t
      }
      if (t >= calendarStart && t < calendarEnd) {
        if (key === 'rise') calendarMoonrise = t
        else calendarMoonset = t
      }
    }
  }
  return { sunset, sunrise, fraction: illumination.fraction, phase: illumination.phase, samples, chartStart, chartEnd, chartSamples, peak, peakIllumination, moonrise, moonset, calendarMoonrise, calendarMoonset }
}

// 주요 달 위상이 발생한 현지 날짜. 태양과 달의 황경 차이를 기준으로 찾는다.
export function moonPhasesForMonth(year, month, utcOffsetHours = 9) {
  const offset = utcOffsetHours * HOUR
  const start = Date.UTC(year, month, 1) - offset
  const end = Date.UTC(year, month + 1, 1) - offset
  const events = new Map()
  const names = ['삭', '상현', '보름', '하현']
  for (let i = 0; i < names.length; i++) {
    let cursor = start
    while (cursor < end) {
      const found = SearchMoonPhase(i * 90, new Date(cursor), (end - cursor) / DAY)
      if (!found) break
      const time = found.date.getTime()
      if (time >= end) break
      const day = new Date(time + offset).getUTCDate()
      const items = events.get(day) || []
      items.push({ name: names[i], time })
      events.set(day, items)
      cursor = time + 1000
    }
  }
  return events
}

export function moonMonth(year, month, lat, lon, utcOffsetHours = 9) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const phases = moonPhasesForMonth(year, month, utcOffsetHours)
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    const noon = new Date(Date.UTC(year, month, day, 12 - utcOffsetHours))
    const night = moonNight(noon, lat, lon)
    // 기존 달력과 같은 달빛 최대 조도 기준으로 무월광 여부만 유지한다.
    return night ? { ...night, day, moonless: nightSummary(noon, lat, lon)?.grade === 'moonless', phaseEvents: phases.get(day) || [] } : null
  }).filter(Boolean)
}
