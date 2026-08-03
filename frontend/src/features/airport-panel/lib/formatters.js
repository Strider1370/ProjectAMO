export function fmtTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${dd}/${hh}${mm}Z`
  } catch { return iso }
}

export function fmtKst(iso, tz = 'KST') {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (tz === 'UTC') return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    return kst.toISOString().replace('T', ' ').slice(0, 16) + ' KST'
  } catch { return iso }
}

export function fmtKstShort(iso, tz = 'KST') {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const display = tz === 'KST' ? new Date(d.getTime() + 9 * 3600 * 1000) : d
    const yyyy = display.getUTCFullYear()
    const mo = String(display.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(display.getUTCDate()).padStart(2, '0')
    const hh = String(display.getUTCHours()).padStart(2, '0')
    const mm = String(display.getUTCMinutes()).padStart(2, '0')
    return `${yyyy}-${mo}-${dd} ${hh}:${mm} ${tz}`
  } catch { return iso }
}

export function formatElevationFt(value) {
  return Number.isFinite(value) ? `${value} ft` : '-'
}

export function getWindDirectionRotation(wind) {
  if (!wind || wind.calm || !Number.isFinite(wind.direction)) return 0
  return ((wind.direction % 360) + 360 + 180) % 360
}

// ── METAR tab ────────────────────────────────────────────────────────────────
