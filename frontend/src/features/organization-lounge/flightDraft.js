import { normalizeRouteSnapshot } from '../route-briefing/lib/routeStore.js'
import { buildBriefingTimeIso } from '../route-briefing/lib/briefingTime.js'

export function localInputToIso(value, tz = 'KST') {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return buildBriefingTimeIso({ year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) }, tz)
}

export function buildOrganizationFlightDraft({ source, name, assignedUserId, etd, eta, cruiseAltitudeFt, tz = 'KST' }) {
  if (!source) throw new Error('저장 경로를 선택하세요.')
  const etdMs = Date.parse(localInputToIso(etd, tz) || etd); const etaMs = Date.parse(localInputToIso(eta, tz) || eta)
  if (!Number.isFinite(etdMs) || !Number.isFinite(etaMs) || etaMs <= etdMs) throw new Error('도착시각은 출발시각보다 뒤여야 합니다.')
  if (!source.profileRequest || typeof source.profileRequest !== 'object') throw new Error('단면 요청 정보가 없는 옛 경로입니다. 경로 편집기에서 다시 열어 저장한 뒤 등록하세요.')
  const snapshot = normalizeRouteSnapshot(source)
  snapshot.cruiseAltitudeFt = Number(cruiseAltitudeFt)
  snapshot.etd = new Date(etdMs).toISOString()
  snapshot.eta = new Date(etaMs).toISOString()
  return {
    name, assignedUserId: Number(assignedUserId), etd: snapshot.etd, eta: snapshot.eta,
    status: 'scheduled', snapshot,
    profileRequest: { ...source.profileRequest, plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) },
    blocks: [], annotations: [], materialRefs: [],
  }
}
