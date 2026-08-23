const HOUR_MS = 3600 * 1000
const KST_OFFSET_MS = 9 * HOUR_MS

function pad2(n) { return String(n).padStart(2, '0') }

export function briefingTimeFields(iso, tz) {
  const t = Date.parse(iso)
  const d = new Date((Number.isFinite(t) ? t : Date.now()) + (tz === 'KST' ? KST_OFFSET_MS : 0))
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

export function buildBriefingTimeIso({ year, month, day, hour, minute }, tz) {
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute)
  return new Date(wallClockMs - (tz === 'KST' ? KST_OFFSET_MS : 0)).toISOString()
}

export function formatBriefingTime(iso, tz, { withDate = false } = {}) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '\u2014'
  const d = new Date(tz === 'KST' ? t + KST_OFFSET_MS : t)
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  const label = tz === 'KST' ? `${hm} KST` : `${hm}Z`
  return withDate ? `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${label}` : label
}
