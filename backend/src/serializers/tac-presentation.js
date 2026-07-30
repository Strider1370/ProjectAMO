export function tacToken(text, role = 'plain') {
  return { text: String(text ?? ''), role }
}

export function weatherTokenRole(weather) {
  const phenomena = weather?.phenomena || []
  if (weather?.descriptor === 'TS' || weather?.descriptor === 'FZ' || phenomena.includes('FG') || phenomena.includes('SN')) return 'weather-special'
  if (phenomena.some((code) => ['RA', 'DZ', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'].includes(code))) return 'weather-precip'
  if (weather?.descriptor === 'SH') return 'weather-precip' // VCSH(근접 소나기)는 강수 현상군
  return 'plain'
}

export function tacDisplayLine(parts, { slotTime = null } = {}) {
  const tokens = []
  for (const part of parts.filter((part) => part?.text)) {
    if (tokens.length) tokens.push(tacToken(' ', 'separator'))
    tokens.push(part)
  }
  return { text: tokens.map((token) => token.text).join(''), slot_time: slotTime, tokens }
}

export function tacPresentation(lines) {
  const display_lines = lines.filter((line) => line?.text)
  return { text: display_lines.map((line) => line.text).join('\n'), display_lines }
}
