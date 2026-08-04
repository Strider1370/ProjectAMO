/**
 * 해외 시간별 예보를 하루 단위로 묶는다.
 *
 * met.no는 하루 최저·최고나 오전/오후 구분을 주지 않는다. 기상청 중기예보는 주므로
 * 국내는 이 변환이 필요 없다. 화면이 출처를 구분하지 않도록 국내 `forecast` 배열과
 * 같은 모양(`date` · `dayOfWeek` · `am` · `pm` · `tempMin` · `tempMax`)으로 맞춘다.
 */

const DAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토']

// 나쁜 쪽이 이긴다. 6시간 중 1시간만 비여도 그날 그 구간은 비다.
const ICON_SEVERITY = { storm: 6, snow: 5, rain: 4, shower: 3, cloudy: 2, cloud: 1, sun: 0 }

function worstIcon(slots) {
  let worst = null
  for (const slot of slots) {
    if (!slot.icon) continue
    if (!worst || (ICON_SEVERITY[slot.icon] ?? 0) > (ICON_SEVERITY[worst] ?? 0)) worst = slot.icon
  }
  return worst ? { icon: worst } : null
}

function dayLabel(dateString) {
  const year = Number(dateString.slice(0, 4))
  const month = Number(dateString.slice(4, 6))
  const day = Number(dateString.slice(6, 8))
  return DAY_LABELS_KO[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || ''
}

/**
 * 저장된 칸은 한국 시각이다. 오전·오후는 승객이 그곳에서 맞을 시간이라 현지 기준이어야 한다.
 * offsetMinutes는 한국 시각에 더해 현지 시각을 만드는 값(베이징 -60, 방콕 -120).
 *
 * 날짜는 칸에 이미 있는 한국 날짜를 그대로 묶음 키로 쓴다. 시차만큼 밀어 새 날짜를
 * 다시 계산하면 자료 창의 첫 시각(한국 0시)이 음수 시차에서 전날로 넘어가 버려,
 * 자료가 1시간뿐인 유령 하루가 생기고 그게 정렬 1번으로 실제 하루를 밀어낸다.
 * 오전/오후 판정에만 현지 시각을 쓰고, 날짜 자체는 옮기지 않는다.
 */
function localHourOfDay(slot, offsetMinutes) {
  const year = Number(slot.date.slice(0, 4))
  const month = Number(slot.date.slice(4, 6))
  const day = Number(slot.date.slice(6, 8))
  const hour = Number(slot.time.slice(0, 2))
  const shifted = new Date(Date.UTC(year, month - 1, day, hour) + offsetMinutes * 60 * 1000)
  return shifted.getUTCHours()
}

export function buildOverseasDaily(hourly, { offsetMinutes = 0, days = 7 } = {}) {
  if (!Array.isArray(hourly) || hourly.length === 0) return []

  const byDate = new Map()
  for (const slot of hourly) {
    if (!slot?.date || !slot?.time) continue
    const localHour = localHourOfDay(slot, offsetMinutes)
    if (!byDate.has(slot.date)) byDate.set(slot.date, [])
    byDate.get(slot.date).push({ ...slot, localHour })
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .slice(0, days)
    .map(([date, slots]) => {
      const temperatures = slots.map((slot) => slot.temp).filter((value) => Number.isFinite(value))
      return {
        date,
        dayOfWeek: dayLabel(date),
        am: worstIcon(slots.filter((slot) => slot.localHour >= 6 && slot.localHour < 12)),
        pm: worstIcon(slots.filter((slot) => slot.localHour >= 12 && slot.localHour < 18)),
        tempMin: temperatures.length ? Math.round(Math.min(...temperatures)) : null,
        tempMax: temperatures.length ? Math.round(Math.max(...temperatures)) : null,
      }
    })
}
