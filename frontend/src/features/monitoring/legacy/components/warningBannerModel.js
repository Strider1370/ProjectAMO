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

// 기상청 원문은 등급을 '주의'로 주지만 특보의 정식 이름은 '주의보'다. 원문을 그대로 붙이면
// "폭염주의"가 되어, 한 단계 위인 "폭염경보"와 이름이 헷갈린다 — 등급을 잘못 읽게 만드는 표기다.
const LEVEL_SUFFIX = { 주의: '주의보' }

export function formatKmaWarningName(warning) {
  const phenomenon = warning?.phenomenon === 'COLD_WAVE' ? '한파' : '폭염'
  const level = warning?.levelLabel || ''
  return `${phenomenon}${LEVEL_SUFFIX[level] ?? level}`
}
