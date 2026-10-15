// Measure the actual font once per label; IDs, not display names, identify occurrences.
let context
const widths = new Map()
export function profileLabelWidth(text) {
  const textValue = String(text ?? '')
  const family = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.documentElement).getPropertyValue('--font-base').trim() || 'sans-serif'
  const key = `${family}:${textValue}`
  if (widths.has(key)) return widths.get(key)
  if (typeof document !== 'undefined') {
    context ??= document.createElement('canvas').getContext('2d')
    if (context) context.font = `600 12px ${family}`
  }
  const width = context ? context.measureText(textValue).width : Array.from(textValue).reduce((sum, c) => sum + (/[^\x00-\x7F]/.test(c) ? 12 : 7.5), 0)
  if (widths.size > 4000) widths.clear()
  widths.set(key, width)
  return width
}
export function singleRowMarkers(markers, xFor, left, right, selectedId) {
  const placed = []
  const candidates = markers.map((m, index) => ({ ...m, index, key: m.id ?? `${index}:${m.label}`, x: xFor(m.distanceNm), lane: 0 }))
  const priority = m => m.key === selectedId ? 0 : m.index === 0 || m.index === markers.length - 1 ? 1 : 2
  candidates.sort((a,b) => priority(a)-priority(b) || a.distanceNm-b.distanceNm)
  for (const marker of candidates) {
    const half = profileLabelWidth(marker.label) / 2 + 5
    const labelX = Math.max(left + half, Math.min(right - half, marker.x))
    if (placed.some(p => Math.abs(p.labelX-labelX) < p.half+half+8)) continue
    placed.push({ ...marker, half, labelX })
  }
  return placed.sort((a,b) => a.distanceNm-b.distanceNm)
}
