/**
 * 시간별 예보 칸(최대 72개)에서 화면에 그릴 칸만 뽑는다.
 *
 * 2안은 오늘·내일·모레 세 구간으로, 3안은 앞으로 24시간을 3시간 간격으로 이어 붙인다.
 * 두 화면이 같은 자료에서 다르게 뽑는 것뿐이라 한 파일에 둔다.
 */

/** 강수확률이 이 값 이상이면 주황 알약으로 칠한다. 실제 화면을 보고 조정할 수 있게 상수로 둔다. */
export const PRECIP_HIGHLIGHT_PROB = 60

const HOUR_STEP = 3
const TODAY_MAX_CELLS = 4
// 내일·모레를 대표하는 시각과 그 시각이 없을 때 대신 찾을 범위.
// 오전은 활동 시작, 오후는 기온이 가장 높을 때, 밤은 귀가 시간.
// met.no는 처음 이틀 남짓만 1시간 간격이고 그 뒤로는 6시간 간격(00·06·12·18시)이라
// 모레는 09·15·21시가 통째로 빌 수 있다 - 그 시간대 안에서 가장 가까운 칸으로 대신한다.
const DAY_PARTS = [
  { label: '오전', hour: 9, rangeStart: 6, rangeEnd: 12 },
  { label: '오후', hour: 15, rangeStart: 12, rangeEnd: 18 },
  { label: '밤', hour: 21, rangeStart: 18, rangeEnd: 24 },
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
  return { group, label, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) }
}

export function isPrecipHighlighted(cell) {
  if (!cell || !Number.isFinite(cell.precipValue)) return false
  return cell.precipKind === 'prob' ? cell.precipValue >= PRECIP_HIGHLIGHT_PROB : cell.precipValue > 0
}

function addDays(dateString, days) {
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

/**
 * 2안용. 오늘은 지금 이후 3시간 간격으로 자정까지 최대 네 칸,
 * 내일·모레는 오전(09시)·오후(15시)·밤(21시) 세 칸씩.
 * 밤 늦은 시간에는 오늘 칸이 줄고 남은 폭을 내일·모레가 나눠 가진다.
 */
export function threeDayStrip(hourly, nowKst) {
  if (!Array.isArray(hourly) || hourly.length === 0 || !nowKst?.date) return []
  const byDate = new Map()
  for (const slot of hourly) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, [])
    byDate.get(slot.date).push(slot)
  }

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
    const slots = byDate.get(addDays(nowKst.date, offset)) || []
    for (const part of DAY_PARTS) {
      const slot = findDayPartSlot(slots, part)
      if (slot) cells.push(toCell(slot, group, part.label))
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
    cells.push({ label: `${hour}시`, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) })
  }
  return cells
}
