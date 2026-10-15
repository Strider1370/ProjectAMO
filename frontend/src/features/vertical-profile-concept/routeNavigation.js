import { clamp, TOTAL_NM, WAYPOINTS } from './scenario.js'

export const ROUTES = {
  short: { total: TOTAL_NM, waypoints: WAYPOINTS, label: '312 NM · 12 지점' },
  long: { total: 6000, label: '6,000 NM · 401 지점', waypoints: Array.from({ length: 401 }, (_, i) => ({
    name: i === 0 ? 'DEP' : i === 400 ? 'ARR' : `W${String(i).padStart(4, '0')}`,
    // Uneven spacing, including a dense middle section, to exercise label collisions.
    nm: i <= 160 ? i * 15 : i <= 240 ? 2400 + (i - 160) * 3 : 2640 + (i - 240) * 21,
  })) },
}
export function panRange(range, start, total) {
  const span = range[1] - range[0]
  const bounded = clamp(start, 0, total - span)
  return [bounded, bounded + span]
}
export function nearestWaypoint(waypoints, nm) {
  return waypoints.reduce((best, p, i) => Math.abs(p.nm - nm) < Math.abs(waypoints[best].nm - nm) ? i : best, 0)
}
export function waypointLabels(waypoints, range, left, right, selectedIndex) {
  const x = nm => left + (nm - range[0]) / (range[1] - range[0]) * (right - left)
  const placed = []
  const candidates = waypoints.map((p, index) => ({ ...p, index })).filter(p => p.nm >= range[0] && p.nm <= range[1])
  const priority = p => p.index === selectedIndex ? 0 : p.index === 0 || p.index === waypoints.length - 1 ? 1 : 2
  candidates.sort((a, b) => priority(a) - priority(b) || a.nm - b.nm)
  for (const p of candidates) {
    const half = p.name.length * 3.7 + 7
    const labelX = clamp(x(p.nm), left + half, right - half)
    if (!placed.some(q => Math.abs(q.labelX - labelX) < q.half + half + 8)) placed.push({ ...p, labelX, half })
  }
  return placed.sort((a, b) => a.nm - b.nm)
}
