import { CURRENT_VERSION } from '../about/changelog.js'

// 의견과 함께 운영자에게만 가는 화면 정보. 원인을 찾는 데 필요한 것만 담고
// 경로 형상·저장 자료 같은 큰 값은 보내지 않는다. 서버가 형식을 다시 검사한다.
const ICAO = /^[A-Z0-9]{4}$/
const icaoOrNull = (value) => (typeof value === 'string' && ICAO.test(value) ? value : null)

export function buildFeedbackContext({ map, airport, panel, briefing, location = window.location, viewport = window }) {
  let ui = null
  let request = null
  try { ui = map?.getCopilotUiState?.() ?? null } catch { /* 지도 준비 전 */ }
  try { request = map?.getAppliedCopilotContext?.()?.request ?? null } catch { /* 경로 없음 */ }
  const cruise = Number(request?.plannedCruiseAltitudeFt)
  return {
    path: `${location.pathname}${location.search}`.slice(0, 200),
    airport: icaoOrNull(airport),
    panel: typeof panel === 'string' ? panel.slice(0, 40) : null,
    briefing: Boolean(briefing),
    route: request ? {
      departure: icaoOrNull(request.departureAirport),
      arrival: icaoOrNull(request.arrivalAirport),
      flightRule: typeof request.flightRule === 'string' ? request.flightRule.slice(0, 10) : null,
      cruiseAltitudeFt: Number.isInteger(cruise) && cruise >= 0 && cruise <= 70000 ? cruise : null,
    } : null,
    layers: Object.entries(ui?.layers ?? {}).filter(([, on]) => on).map(([id]) => String(id).slice(0, 40)).slice(0, 40),
    viewport: { width: Math.round(viewport.innerWidth || 0), height: Math.round(viewport.innerHeight || 0) },
    version: CURRENT_VERSION,
  }
}
