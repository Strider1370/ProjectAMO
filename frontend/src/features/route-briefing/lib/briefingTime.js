const HOUR_MS = 3600 * 1000
const KST_OFFSET_MS = 9 * HOUR_MS

function pad2(n) { return String(n).padStart(2, '0') }

export function formatBriefingTime(iso, tz, { withDate = false } = {}) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '\u2014'
  const d = new Date(tz === 'KST' ? t + KST_OFFSET_MS : t)
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  const label = tz === 'KST' ? `${hm} KST` : `${hm}Z`
  return withDate ? `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${label}` : label
}
