/**
 * 3안 오른쪽 주간 칸에 그릴 다섯 줄을 만든다.
 *
 * 국내는 기상청이 오전·오후를 따로 주므로 형식만 맞추면 되고,
 * 해외는 백엔드(overseas-daily.js)가 시간별에서 같은 모양으로 만들어 둔다.
 * 그래서 여기서는 출처를 구분하지 않는다.
 */

export const WEEKLY_ROW_COUNT = 5

const EMPTY_ROW = Object.freeze({ empty: true })

function monthDay(dateString) {
  return `${Number(dateString.slice(4, 6))}/${Number(dateString.slice(6, 8))}`
}

export function weeklyRows(days, todayDate, count = WEEKLY_ROW_COUNT) {
  const upcoming = (Array.isArray(days) ? days : [])
    .filter((day) => day?.date && day.date > todayDate)
    .sort((left, right) => (left.date < right.date ? -1 : 1))
    .slice(0, count)

  // 줄 수를 항상 같게 유지한다. 도시마다 줄 수가 달라지면 전환 중 자리가 밀려 글자가 겹친다.
  return Array.from({ length: count }, (unused, index) => {
    const day = upcoming[index]
    if (!day) return EMPTY_ROW
    return {
      empty: false,
      dayOfWeek: day.dayOfWeek || '',
      monthDay: monthDay(day.date),
      amIcon: day.am?.icon || null,
      pmIcon: day.pm?.icon || null,
      tempMin: Number.isFinite(day.tempMin) ? Math.round(day.tempMin) : null,
      tempMax: Number.isFinite(day.tempMax) ? Math.round(day.tempMax) : null,
    }
  })
}
