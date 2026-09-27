// On desktop, fill the available height above the launcher. Keep the compact
// floating size on tablet, and clamp keyboard/pointer movement to the viewport.
export function floatingWindow(viewport, expanded, position = null) {
  const width = Math.min(expanded ? 480 : 400, Math.max(280, viewport.width - 32))
  const desktop = viewport.width >= 1200
  const height = desktop
    ? Math.max(240, viewport.height - 128)
    : Math.min(expanded ? 680 : 560, Math.max(240, viewport.height - 116))
  const x = position?.x ?? viewport.width - width - 24
  const y = position?.y ?? (desktop ? 16 : viewport.height - height - 100)
  return { width, height, x: Math.max(16, Math.min(viewport.width - width - 16, x)),
    y: Math.max(16, Math.min(viewport.height - height - (desktop ? 112 : 84), y)) }
}

export function formatCopilotTime(value, timezone, { year = false } = {}) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return '시각 미상'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: timezone, ...(year ? { year: 'numeric' } : {}), month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time) + (timezone === 'UTC' ? ' UTC' : ' KST')
}
