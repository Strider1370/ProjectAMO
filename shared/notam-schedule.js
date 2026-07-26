// NOTAM D)필드(활성 시간대) 파서. B~C는 "공지가 살아있는 기간"이고 D)는 "그 안에서 실제로
// 켜지는 시간대"라 둘은 다르다 — D)를 못 읽으면 켜졌는지 꺼졌는지 말할 수 없다.
//
// 문법(라이브 NOTAM 311건 전수조사로 확정):
//   D)      := group+
//   group   := [MONTH] dayspec+ TIME+   |   [MONTH] DAY TIME '-' DAY TIME   (날짜 넘는 단일 구간)
//   dayspec := DAY | DAY '-' DAY
// 월은 다음 월 이름이 나올 때까지 유지되고, 날짜는 B) 이후로 시간순 진행한다고 본다(연도·월 복원).
// 날짜 없이 시간만 있으면(예: "1400-0000") 유효기간 내내 매일 반복이다.
//
// 해석 못 한 문자열은 반드시 null을 돌려준다 — 모르는 걸 "꺼짐"으로 처리하면 켜진 구역에
// 들어가게 된다. 호출부는 null을 "조건 확인"으로 남겨야 한다.

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

// 순서가 의미 있다: cross(일+시각 쌍)를 time보다, time(4자리)을 dayRange(1~2자리)보다 먼저 시도한다.
// DLY/DAILY는 "날짜 없이 매일"이라 우리 모델에서 날짜 없는 그룹과 같은 뜻 — 접두사만 흘려보낸다.
// 날짜 넘김의 끝쪽에 월 이름이 붙기도 한다: "MAY 31 2300-JUN 01 0200" (5/31 23:00 → 6/1 02:00).
const TOKEN = /(?<cross>\d{1,2}\s+\d{4}\s*-\s*(?:(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+)?\d{1,2}\s+\d{4})|(?<time>\d{4}-\d{4})|(?<dayRange>\d{1,2}-\d{1,2})|(?<month>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)|(?<daily>DAILY|DLY)|(?<day>\d{1,2})|(?<sep>[,\s]+)/y

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2))
const DAY_MS = 24 * 60 * 60 * 1000

export function parseNotamSchedule(text) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  if (!source) return null

  const groups = []
  let month = null
  let days = []
  let times = []
  const flush = () => {
    if (times.length) groups.push({ month, days, times, cross: null })
    days = []
    times = []
  }

  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex
    const m = TOKEN.exec(source)
    if (!m || m.index !== at) return null // 문법에 없는 표기 — 추측하지 않는다
    const g = m.groups
    if (g.sep || g.daily) continue
    if (g.month) {
      if (times.length) flush()
      month = MONTHS[g.month]
    } else if (g.cross) {
      if (times.length) flush()
      const [, d1, t1, endMonth, d2, t2] = g.cross.match(/(\d{1,2})\s+(\d{4})\s*-\s*(?:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+)?(\d{1,2})\s+(\d{4})/)
      groups.push({
        month,
        days: [[Number(d1), Number(d1)]],
        times: [],
        cross: { startMin: toMinutes(t1), endMonth: endMonth ? MONTHS[endMonth] : null, endDay: Number(d2), endMin: toMinutes(t2) },
      })
      // "MAY 31 2300-JUN 01 0200, 07 2300-08 0200"에서 뒤따르는 07·08은 5월이 아니라 6월이다.
      // 달을 넘긴 구간이 나오면 그 뒤 기준 월도 함께 넘어간다.
      if (endMonth) month = MONTHS[endMonth]
      days = []
    } else if (g.day || g.dayRange) {
      if (times.length) flush()
      if (g.day) days.push([Number(g.day), Number(g.day)])
      else {
        const [a, b] = g.dayRange.split('-')
        days.push([Number(a), Number(b)])
      }
    } else if (g.time) {
      const [a, b] = g.time.split('-')
      times.push([toMinutes(a), toMinutes(b)])
    }
  }
  flush()
  return groups.length ? groups : null
}

// cursor 이후(같은 날 포함) 처음으로 해당 일자(월이 지정됐으면 그 월)인 날의 UTC 자정.
function findDate(dayOfMonth, month, cursorMs, limitMs) {
  const d = new Date(cursorMs)
  let day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  while (day <= limitMs) {
    const cur = new Date(day)
    if (cur.getUTCDate() === dayOfMonth && (month == null || cur.getUTCMonth() + 1 === month)) return day
    day += DAY_MS
  }
  return null
}

const inWindow = (nowMs, startMs, endMs) => nowMs >= startMs && nowMs < endMs

// 날짜 없이 시간만 있는 그룹 = 매일 반복. 자정을 넘는 구간(1400-0000)도 분 단위 비교로 처리한다.
function dailyHit(nowMs, times) {
  const d = new Date(nowMs)
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes()
  return times.some(([s, e]) => (s <= e ? minute >= s && minute < e : minute >= s || minute < e))
}

/**
 * D)에 따라 nowMs가 활성 시간대 안인지 판정한다.
 * @returns true(켜짐) | false(꺼짐) | null(해석 불가 — 단정하지 말 것)
 */
export function isScheduleActiveAt(scheduleText, validFrom, validTo, nowMs) {
  const groups = parseNotamSchedule(scheduleText)
  if (!groups) return null
  const fromMs = Date.parse(validFrom)
  const toMs = Date.parse(validTo)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null

  // 날짜 해석은 B)부터 시간순으로 진행한다. 마지막 그룹이 C) 이후로 넘어가는 표기도 있어 여유를 둔다.
  const limitMs = toMs + 40 * DAY_MS
  let cursor = fromMs

  for (const group of groups) {
    if (group.cross) {
      const [[startDay]] = group.days
      const startDate = findDate(startDay, group.month, cursor, limitMs)
      if (startDate == null) return null
      cursor = startDate
      const endDate = findDate(group.cross.endDay, group.cross.endMonth, startDate, limitMs)
      if (endDate == null) return null
      if (inWindow(nowMs, startDate + group.cross.startMin * 60000, endDate + group.cross.endMin * 60000)) return true
      continue
    }
    if (!group.days.length) {
      if (nowMs >= fromMs && nowMs <= toMs && dailyHit(nowMs, group.times)) return true
      continue
    }
    for (const [a, b] of group.days) {
      for (let dom = a; dom <= b; dom += 1) {
        const date = findDate(dom, group.month, cursor, limitMs)
        if (date == null) return null
        cursor = date
        for (const [s, e] of group.times) {
          const end = e <= s ? date + DAY_MS + e * 60000 : date + e * 60000
          if (inWindow(nowMs, date + s * 60000, end)) return true
        }
      }
    }
  }
  return false
}

export default { parseNotamSchedule, isScheduleActiveAt }
