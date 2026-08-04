/**
 * 3안 오른쪽 주간 칸에 그릴 다섯 줄을 만든다.
 *
 * 국내는 기상청이 오전·오후를 따로 주므로 형식만 맞추면 되고,
 * 해외는 백엔드(overseas-daily.js)가 시간별에서 같은 모양으로 만들어 둔다.
 * 그래서 여기서는 출처를 구분하지 않는다.
 */

export const WEEKLY_ROW_COUNT = 5

const EMPTY_ROW = Object.freeze({ empty: true })

// 국내 주간예보(forecast[].date)는 `2026-08-04`처럼 대시가 섞여 오지만, 시간별(hourly[].date)과
// 해외 daily[].date는 `20260804`다. 대시가 있으면 문자열 비교(>)가 자릿수 기준을 벗어나
// 항상 거짓이 되어 국내 주간 줄이 통째로 빈 줄로 나온다 - 비교·가공 전에 숫자만 남긴다.
export function normalizeDate(dateString) {
  return String(dateString).replace(/\D/g, '')
}

function monthDay(dateString) {
  const normalized = normalizeDate(dateString)
  return `${Number(normalized.slice(4, 6))}/${Number(normalized.slice(6, 8))}`
}

export function weeklyRows(days, todayDate, count = WEEKLY_ROW_COUNT) {
  const today = normalizeDate(todayDate)
  const upcoming = (Array.isArray(days) ? days : [])
    .map((day) => (day?.date ? { ...day, date: normalizeDate(day.date) } : day))
    .filter((day) => day?.date && day.date > today)
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
