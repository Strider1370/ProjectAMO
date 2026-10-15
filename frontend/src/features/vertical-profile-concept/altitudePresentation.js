// Formatting only: the source altitude reference is preserved.
export function formatProfileAltitude(ft) {
  if (!Number.isFinite(ft)) return '자료 없음'
  return `${Math.round(ft).toLocaleString('en-US')} ft`
}
