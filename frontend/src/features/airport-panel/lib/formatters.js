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

export function fmtKst(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    return kst.toISOString().replace('T', ' ').slice(0, 16) + ' KST'
  } catch { return iso }
}

export function fmtKstShort(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    const yyyy = kst.getUTCFullYear()
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(kst.getUTCDate()).padStart(2, '0')
    const hh = String(kst.getUTCHours()).padStart(2, '0')
    const mm = String(kst.getUTCMinutes()).padStart(2, '0')
    return `${yyyy}-${mo}-${dd} ${hh}:${mm} KST`
  } catch { return iso }
}

export function getWindDirectionRotation(wind) {
  if (!wind || wind.calm || !Number.isFinite(wind.direction)) return 0
  return ((wind.direction % 360) + 360 + 180) % 360
}

// ── METAR tab ────────────────────────────────────────────────────────────────

