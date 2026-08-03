const EMPTY_LIST = []

export function buildWarningEntries({ airportWarnings, kmaWarnings, dashboardMode }) {
  const airport = Array.isArray(airportWarnings) ? airportWarnings.map((warning) => ({ source: 'airport', warning })) : EMPTY_LIST
  if (dashboardMode !== 'ground') return airport
  const kma = Array.isArray(kmaWarnings) ? kmaWarnings.map((warning) => ({ source: 'kma', warning })) : EMPTY_LIST
  return [...airport, ...kma]
}

export function warningBannerLabel() {
  return '공항경보'
}

export function formatKmaWarningName(warning) {
  return `${warning?.phenomenon === 'COLD_WAVE' ? '한파' : '폭염'}${warning?.levelLabel || ''}`
}
