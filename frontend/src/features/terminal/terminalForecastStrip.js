/**
 * 시간별 예보 칸(최대 72개)에서 화면에 그릴 칸만 뽑는다.
 *
 * 2안은 오늘·내일·모레 세 구간으로, 3안은 앞으로 24시간을 3시간 간격으로 이어 붙인다.
 * 두 화면이 같은 자료에서 다르게 뽑는 것뿐이라 한 파일에 둔다.
 */

import { normalizeDate } from './terminalWeeklyForecast.js'

/** 강수확률이 이 값 이상이면 주황 알약으로 칠한다. 실제 화면을 보고 조정할 수 있게 상수로 둔다. */
export const PRECIP_HIGHLIGHT_PROB = 60

const HOUR_STEP = 3
const TODAY_MAX_CELLS = 4
// 내일·모레를 대표하는 시각과 그 시각이 없을 때 대신 찾을 범위. 오전은 활동 시작,
// 오후는 기온이 가장 높을 때. 국내 기상청 시간별은 24시간 안팎뿐이라 애초에 내일·모레
// 칸이 없는 게 보통이고, 그때는 threeDayStrip이 주간예보(am/pm)로 대신 채운다 -
// `key`는 그 주간예보 쪽 필드 이름과 맞춘 것이다. 밤(21시)은 주간예보에 없는 구간이라 뺐다.
const DAY_PARTS = [
  { label: '오전', key: 'am', hour: 9, rangeStart: 6, rangeEnd: 12 },
  { label: '오후', key: 'pm', hour: 15, rangeStart: 12, rangeEnd: 18 },
]

function hourOf(slot) {
  return Number(String(slot?.time || '').slice(0, 2))
}

function precipOf(slot) {
  // 국내(기상청)는 강수확률, 해외(met.no)는 강수량. 한 화면은 도시 하나만 띄우므로 섞이지 않는다.
  if (Number.isFinite(slot?.rainProb)) return { precipKind: 'prob', precipValue: slot.rainProb }
  if (Number.isFinite(slot?.precipitation)) return { precipKind: 'amount', precipValue: slot.precipitation }
  return { precipKind: null, precipValue: null }
}

function toCell(slot, group, label) {
  // date를 실어 두면 화면 쪽이 addDays를 다시 계산하지 않고 구간 제목(`내일 8/5`)의
  // 월/일을 그 칸의 실제 날짜에서 바로 읽을 수 있다.
  return { group, label, date: slot.date, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) }
}

/** `YYYYMMDD` → `8/5`. 구간 제목(`내일 8/5`)과 주간 날짜 표시가 같은 형식을 쓴다. */
export function formatMonthDay(dateString) {
  const value = String(dateString || '')
  if (value.length < 8) return ''
  return `${Number(value.slice(4, 6))}/${Number(value.slice(6, 8))}`
}

export function isPrecipHighlighted(cell) {
  if (!cell || !Number.isFinite(cell.precipValue)) return false
  return cell.precipKind === 'prob' ? cell.precipValue >= PRECIP_HIGHLIGHT_PROB : cell.precipValue > 0
}

export function addDays(dateString, days) {
  const at = new Date(Date.UTC(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(4, 6)) - 1,
    Number(dateString.slice(6, 8)) + days,
  ))
  const pad = (value) => String(value).padStart(2, '0')
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
}

// 대표 시각이 정확히 있으면 그 칸을, 없으면 같은 시간대(범위) 안에서 대표 시각에 가장 가까운 칸을 준다.
function findDayPartSlot(slots, part) {
  const exact = slots.find((entry) => hourOf(entry) === part.hour)
  if (exact) return exact
  const inRange = slots.filter((entry) => {
    const hour = hourOf(entry)
    return hour >= part.rangeStart && hour < part.rangeEnd
  })
  if (inRange.length === 0) return null
  return inRange.reduce((closest, entry) => (
    Math.abs(hourOf(entry) - part.hour) < Math.abs(hourOf(closest) - part.hour) ? entry : closest
  ))
}

// 시간별에 그 날짜 칸이 없을 때(국내는 늘 이렇다 - 24시간치뿐이라) 주간예보로 대신 채운다.
// 오전은 그 날의 최저기온, 오후는 최고기온과 짝짓는다(실제 하루 흐름과 맞는 값이라 스펙이 정한 규칙).
function dayPartCellFromWeek(day, part, group) {
  const bucket = day?.[part.key]
  const temp = part.key === 'am' ? day?.tempMin : day?.tempMax
  if (!bucket || !Number.isFinite(temp)) return null
  return {
    group,
    label: part.label,
    date: normalizeDate(day.date),
    icon: bucket.icon || null,
    temp: Math.round(temp),
    precipKind: Number.isFinite(bucket.rainProb) ? 'prob' : null,
    precipValue: Number.isFinite(bucket.rainProb) ? bucket.rainProb : null,
  }
}

/**
 * 2안용. 오늘은 지금 이후 3시간 간격으로 자정까지 최대 네 칸,
 * 내일·모레는 오전·오후 두 칸씩. 시간별에 그 날짜 칸이 있으면(주로 해외) 그걸 쓰고,
 * 없으면(국내는 시간별이 24시간 안팎뿐이라 거의 항상 이 경우다) 주간예보(`days`)로 채운다.
 * 밤 늦은 시간에는 오늘 칸이 줄고 남은 폭을 내일·모레가 나눠 가진다.
 */
export function threeDayStrip(hourly, nowKst, days = []) {
  if (!Array.isArray(hourly) || hourly.length === 0 || !nowKst?.date) return []
  const byDate = new Map()
  for (const slot of hourly) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, [])
    byDate.get(slot.date).push(slot)
  }
  const byWeekDate = new Map(
    (Array.isArray(days) ? days : []).map((day) => [normalizeDate(day?.date), day]),
  )

  const cells = []
  const todaySlots = byDate.get(nowKst.date) || []
  // 지금 이후 첫 3의 배수 시각부터 시작한다. 13시면 15시, 15시면 18시.
  for (let hour = (Math.floor(nowKst.hour / HOUR_STEP) + 1) * HOUR_STEP; hour <= 24; hour += HOUR_STEP) {
    if (cells.length >= TODAY_MAX_CELLS) break
    // 24시는 자정이라 같은 날 칸이 없다. 다음 날 00시 칸을 24시로 보여준다.
    const slot = hour === 24
      ? (byDate.get(addDays(nowKst.date, 1)) || []).find((entry) => hourOf(entry) === 0)
      : todaySlots.find((entry) => hourOf(entry) === hour)
    if (slot) cells.push(toCell(slot, 'today', `${hour}시`))
  }

  for (const [offset, group] of [[1, 'tomorrow'], [2, 'dayAfter']]) {
    const date = addDays(nowKst.date, offset)
    const slots = byDate.get(date) || []
    const week = byWeekDate.get(date)
    for (const part of DAY_PARTS) {
      const slot = findDayPartSlot(slots, part)
      const cell = slot ? toCell(slot, group, part.label) : dayPartCellFromWeek(week, part, group)
      if (cell) cells.push(cell)
    }
  }

  return cells
}

const DAY_CYCLE_CELLS = 8

/**
 * 3안용. 앞으로 24시간을 3시간 간격 여덟 칸으로 잇는다.
 * 자정에 구분선을 두지 않아 기온 꺾은선이 하루의 오르내림을 끊기지 않고 보여준다.
 * 칸 수가 시각에만 달렸고 도시와 무관해서, 도시가 바뀌어도 칸 폭이 변하지 않는다.
 */
export function dayCycleStrip(hourly, nowKst) {
  if (!Array.isArray(hourly) || hourly.length === 0 || !nowKst?.date) return []
  const startHour = (Math.floor(nowKst.hour / HOUR_STEP) + 1) * HOUR_STEP
  const cells = []
  for (let step = 0; step < DAY_CYCLE_CELLS; step += 1) {
    const absoluteHour = startHour + step * HOUR_STEP
    const date = addDays(nowKst.date, Math.floor(absoluteHour / 24))
    const hour = absoluteHour % 24
    const slot = hourly.find((entry) => entry.date === date && hourOf(entry) === hour)
    if (!slot) break
    cells.push({ date, label: `${hour}시`, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) })
  }
  return cells
}
