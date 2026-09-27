// The airport information bulletin gives its publication time as local KST text.
export function fmtBulletinTime(tm, tz = 'KST') {
  if (!tm) return '—'
  const match = tm.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/)
  if (!match) return tm
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4] - 9, +match[5]))
  if (!Number.isFinite(date.getTime())) return tm
  const display = new Date(date.getTime() + (tz === 'UTC' ? 0 : 9 * 3600_000))
  const two = (number) => String(number).padStart(2, '0')
  return `${display.getUTCFullYear()}년 ${two(display.getUTCMonth() + 1)}월 ${two(display.getUTCDate())}일 ${two(display.getUTCHours())}시 ${tz === 'UTC' ? 'UTC' : 'KST'}`
}
