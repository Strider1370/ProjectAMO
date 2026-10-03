export function experimentFrameAt(times, targetMs) {
  if (!times?.length || !Number.isFinite(targetMs)) return null
  const sorted = [...times].sort((a, b) => Date.parse(a.validTime) - Date.parse(b.validTime))
  const first = Date.parse(sorted[0].validTime), last = Date.parse(sorted.at(-1).validTime)
  const halfInterval = sorted.length > 1 ? (last - first) / (sorted.length - 1) / 2 : 1800000
  if (targetMs < first - halfInterval || targetMs > last + halfInterval) return null
  return sorted.reduce((a, b) => Math.abs(Date.parse(a.validTime) - targetMs) <= Math.abs(Date.parse(b.validTime) - targetMs) ? a : b)
}
