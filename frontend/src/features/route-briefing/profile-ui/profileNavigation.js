export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export function panRange(range, start, total) {
  const span = range[1] - range[0]
  const bounded = clamp(start, 0, total - span)
  return [bounded, bounded + span]
}
