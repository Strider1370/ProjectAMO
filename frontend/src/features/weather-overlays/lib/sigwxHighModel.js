export const HIGH_TYPES = [
  { id: 'CLOUD', label: 'CB' }, { id: 'JETSTREAM', label: '제트' },
  { id: 'TURBULENCE', label: '난류' }, { id: 'AIRFRAME_ICING', label: '착빙' },
  { id: 'TROPOPAUSE', label: '대류권계면' }, { id: 'TROPICAL_CYCLONE', label: '태풍' },
  { id: 'VOLCANO', label: '화산' },
]
export const HIGH_DEFAULT_FILTER = Object.fromEntries(HIGH_TYPES.map(({ id }) => [id, true]))
export const HIGH_HOUR_MS = 3600000
const CYCLE = 48 * HIGH_HOUR_MS

// Replay one original run on the current UTC axis. Source metadata is never
// shifted. The 48h cycle has a 6h seam between T+48 and the next T+6.
export function repeatedHighFrames(frames, targetMs) {
  if (!frames?.length || !Number.isFinite(targetMs)) return []
  const base = Math.floor(targetMs / CYCLE) * CYCLE
  return [-1, 0, 1].flatMap(cycle => frames.map(frame => ({
    frame, ms: base + cycle * CYCLE + frame.forecastHour * HIGH_HOUR_MS,
  }))).sort((a, b) => a.ms - b.ms)
}
export function pickHighFrame(frames, targetMs) {
  return repeatedHighFrames(frames, targetMs).reduce((best, item) => (
    !best || Math.abs(item.ms - targetMs) < Math.abs(best.ms - targetMs) ? item : best
  ), null)
}
export function highTimelineEntries(frames, nowMs) {
  return repeatedHighFrames(frames, nowMs)
    .filter(({ ms }) => ms >= nowMs - 6 * HIGH_HOUR_MS && ms <= nowMs + 48 * HIGH_HOUR_MS)
    .map(({ ms }) => ({ ms, cadenceMs: 3 * HIGH_HOUR_MS }))
}
export function highStamp(value, tz) {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return '미제공'
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)) + ` ${tz}`
}
export function highHeight(value) {
  if (!value) return '미제공'
  if (value.includes('inapplicable')) return '해당 없음'
  if (value.startsWith('?')) return '알 수 없음'
  return value
}
export function highLegendEntries(palette, type) {
  const p = palette.hazards[type]
  // Preview a single area with the map's hue/opacity over its basemap background.
  return ['MOD', 'SEV'].map(severity => ({
    label: severity === 'MOD' ? 'MOD 중간' : 'SEV 강함',
    background: palette.legendBackground || palette.background,
    color: `rgba(${p[severity].slice(1).match(/../g).map(v => parseInt(v, 16)).join(',')},${p.opacity})`,
  }))
}
