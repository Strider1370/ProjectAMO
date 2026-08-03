const EMPTY_LIST = []

export function buildWarningEntries({ airportWarnings, kmaWarnings, dashboardMode }) {
  const airport = Array.isArray(airportWarnings) ? airportWarnings.map((warning) => ({ source: 'airport', warning })) : EMPTY_LIST
  if (dashboardMode !== 'ground') return airport
  const kma = Array.isArray(kmaWarnings) ? kmaWarnings.map((warning) => ({ source: 'kma', warning })) : EMPTY_LIST
  return [...airport, ...kma]
}

export function warningBannerLabel(entries, dashboardMode) {
  return dashboardMode === 'ground' && entries.some((entry) => entry.source === 'kma') ? '기상경보·특보' : '공항경보'
}
