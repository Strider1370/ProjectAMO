// 공항 METAR·TAF 이력 줄(과거 보기) 계산: 최근 3시간 METAR / 직전 2개 TAF 발표 + 최신을 왼쪽(과거) → 오른쪽(최신)으로.
// METAR 칸마다 비행등급(공항 패널 METAR 탭과 같은 규칙: 시정 + BKN·OVC 최저 운고)을 붙여 색만으로 추세가 읽히게 한다.
import { getFlightCategory } from './helpers.js'

export function metarCategory(metar, icao = null) {
  const obs = metar?.observation
  if (!obs) return null
  const visibility = obs.visibility?.cavok ? 9999 : obs.visibility?.value
  const ceiling = (obs.clouds ?? []).filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]
  if (!Number.isFinite(visibility) && !ceiling) return null
  return getFlightCategory(visibility, ceiling?.base ?? null, icao).category
}

// items: 서버가 준 최신순 보관 보고. latest: 화면에 이미 있는 최신 보고(그 시각보다 새 보관본은 버린다).
export function historyEntries(type, items, { latest = null, latestTime = null, latestKind = null, icao = null } = {}) {
  const cutoff = Date.parse(latestTime)
  const past = (items ?? []).filter((item) => !Number.isFinite(cutoff) || Date.parse(item.time) < cutoff)
    .slice().sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const entries = past.map((item) => ({ key: item.key, time: item.time, kind: item.kind, report: item.report, latest: false }))
  if (latest) entries.push({ key: 'latest', time: latestTime, kind: latestKind ?? (type === 'metar' ? 'METAR' : 'TAF'), report: latest, latest: true })
  return type === 'metar' ? entries.map((entry) => ({ ...entry, category: metarCategory(entry.report, icao) })) : entries
}
