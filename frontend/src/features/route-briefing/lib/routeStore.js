// Saved VFR/IFR routes. 로그인 시 서버(/api/me/routes, 자기 것만), 게스트는 localStorage.
// 저장은 입력값(snapshot)만; 로드는 재검색으로 복원(navdata는 최신 유지).
import { formatVfrDraftText } from './manualRouteInput.js'
const KEY = 'projectamo.savedRoutes.v1'
const API = '/api/me/routes'

function read() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function write(routes) {
  localStorage.setItem(KEY, JSON.stringify(routes))
}
const bySavedDesc = (a, b) => (b.savedAt || 0) - (a.savedAt || 0)

export function normalizeRouteSnapshot(snapshot = {}) {
  const routeForm = snapshot.base?.routeForm ?? snapshot.routeForm ?? {}
  const legacyVfrWaypoints = snapshot.vfrWaypoints
  if (routeForm.flightRule === 'VFR' && Array.isArray(legacyVfrWaypoints) && legacyVfrWaypoints.length >= 2) {
    const terms = legacyVfrWaypoints.slice(1, -1).map((waypoint) => waypoint.named
      ? { kind: 'fix', id: waypoint.id }
      : { kind: 'coordinate', coordinate: { lat: waypoint.lat, lon: waypoint.lon } })
    const enroute = {
      terms,
      legIntents: Array.from({ length: Math.max(0, terms.length - 1) }, () => ({ kind: 'dct' })),
      userWaypoints: [],
      nextWaypointNumber: 1,
    }
    return {
      ...snapshot,
      version: 2,
      base: {
        ...(snapshot.base ?? {}),
        routeForm,
        enroute,
        routeString: formatVfrDraftText({ departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, enroute }),
      },
    }
  }
  if (snapshot.version === 2 && snapshot.base) return snapshot
  const enroute = snapshot.enroute ?? { terms: [], legIntents: [], userWaypoints: [], nextWaypointNumber: 1 }
  return {
    ...snapshot,
    version: 2,
    base: {
      routeForm: snapshot.routeForm ?? {},
      procedureIds: snapshot.procedureIds ?? {
        sid: snapshot.selectedSid?.id ?? null,
        star: snapshot.selectedStar?.id ?? null,
        iapKey: snapshot.selectedIapKey ?? null,
      },
      enroute,
      routeString: snapshot.routeString ?? '',
    },
  }
}

// snapshot: { routeForm, vfrWaypoints, cruiseAltitudeFt, alternateAirport, etd }
export async function listSavedRoutes() {
  try {
    const res = await fetch(API, { credentials: 'include' })
    if (res.ok) return (await res.json()).routes.sort(bySavedDesc) // 로그인 → 서버
    // 401(게스트)·기타 → 로컬 폴백
  } catch { /* 서버 불가 → 로컬 */ }
  return read().sort(bySavedDesc)
}

export async function saveRoute(name, snapshot) {
  const normalizedSnapshot = normalizeRouteSnapshot(snapshot)
  try {
    const res = await fetch(API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, snapshot: normalizedSnapshot }),
    })
    if (res.ok) return await res.json() // 로그인 → 서버 저장
    if (res.status !== 401) return null // 로그인 상태 서버 거부(용량 등) → 실패(로컬 저장 안 함)
    // 401 → 게스트: 아래 로컬 폴백
  } catch { /* 네트워크 오류 → 로컬 */ }
  const routes = read()
  const entry = { id: `r${Date.now()}`, name: name || '이름 없는 경로', savedAt: Date.now(), ...normalizedSnapshot }
  routes.push(entry)
  write(routes)
  return entry
}

export async function deleteSavedRoute(id) {
  try {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) return // 로그인 → 서버 삭제
    if (res.status !== 401) return // 로그인 상태 서버 응답 → 로컬 건드리지 않음
  } catch { /* 네트워크 → 로컬 */ }
  write(read().filter((r) => r.id !== id))
}
