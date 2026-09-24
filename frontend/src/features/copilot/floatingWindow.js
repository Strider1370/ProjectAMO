// The approved preview uses 400×560, or 480×680 expanded. Clamp the floating
// window, never the map/panel viewport. Keyboard moves reuse the same geometry.
export function floatingWindow(viewport, expanded, position = null) {
  const width = Math.min(expanded ? 480 : 400, Math.max(280, viewport.width - 32))
  const height = Math.min(expanded ? 680 : 560, Math.max(240, viewport.height - 116))
  const x = position?.x ?? viewport.width - width - 24
  const y = position?.y ?? viewport.height - height - 100
  return { width, height, x: Math.max(16, Math.min(viewport.width - width - 16, x)),
    y: Math.max(16, Math.min(viewport.height - height - 84, y)) }
}

export function formatCopilotTime(value, timezone, { year = false } = {}) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return '시각 미상'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: timezone, ...(year ? { year: 'numeric' } : {}), month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time) + (timezone === 'UTC' ? ' UTC' : ' KST')
}
