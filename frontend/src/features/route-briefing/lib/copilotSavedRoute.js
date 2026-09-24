import { normalizeRouteSnapshot } from './routeStore.js'
import { buildSavedBriefingInputs, buildSavedRouteResult } from './savedRouteBriefing.js'
import { createRouteDesign, MAX_ROUTE_DESIGNS } from './routeDesigns.js'
import { createRouteEditor } from './routeEditor.js'
import { navdataProvider } from './routePlanner.js'
import { createRoutePlanner } from '../../../../../shared/route-planning/routePlanner.js'
import { buildEditorPreview } from '../../../../../shared/route-planning/editorPreview.js'
import { buildAppliedRouteInputs } from '../../../../../shared/route-planning/planRoute.js'
import { buildVfrWaypointsFromRouteResult } from './routeBriefingModel.js'

const fail = (code) => { throw new Error(code) }
const instant = (value) => {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!parts || !Number.isFinite(Date.parse(value))) return false
  const [, year, month, day, hour, minute, second, zone, offsetHour, offsetMinute] = parts
  return +month >= 1 && +month <= 12 && +day >= 1 && +day <= new Date(Date.UTC(+year, +month, 0)).getUTCDate()
    && +hour <= 23 && +minute <= 59 && +second <= 59 && (zone === 'Z' || (+offsetHour <= 23 && +offsetMinute <= 59))
}
export function validateSavedRouteBundle(bundle, now = Date.now()) {
  if (bundle?.status !== 'ok' || !Number.isSafeInteger(bundle.entry?.id) || bundle.entry.id <= 0
    || !/^[a-f0-9]{64}$/.test(bundle.routeHash ?? '') || !/^saved_route_[a-f0-9-]{36}$/.test(bundle.reference?.savedRouteRef ?? '')) fail('INVALID_SAVED_ROUTE')
  if (!instant(bundle.expiresAt) || Date.parse(bundle.expiresAt) <= now) fail('REFERENCE_EXPIRED')
  const value = bundle.entry
  if (value.alternatives != null && !Array.isArray(value.alternatives)) fail('INVALID_SAVED_ROUTE')
  if (value.routeMarkers != null && (!Array.isArray(value.routeMarkers) || value.routeMarkers.some((marker) => !marker
    || !Number.isFinite(marker.lon) || !Number.isFinite(marker.lat) || Math.abs(marker.lon) > 180 || Math.abs(marker.lat) > 90))) fail('INVALID_SAVED_MARKERS')
  for (const key of ['etd', 'eta']) if (value[key] != null && !instant(value[key])) fail('INVALID_SAVED_ROUTE_TIME')
  if (value.etd && value.eta && Date.parse(value.eta) <= Date.parse(value.etd)) fail('INVALID_SAVED_ROUTE_TIME')
  if (value.cruiseAltitudeFt != null && (!Number.isInteger(value.cruiseAltitudeFt) || value.cruiseAltitudeFt < 500 || value.cruiseAltitudeFt > 60000)) fail('INVALID_SAVED_ALTITUDE')
  if (value.tasKt != null && (!Number.isFinite(value.tasKt) || value.tasKt < 30 || value.tasKt > 1000)) fail('INVALID_SAVED_TAS')
  const selection = value.nwpTimeSelection
  if (selection != null) {
    if (typeof selection !== 'object' || Array.isArray(selection) || (selection.baseTime != null && !instant(selection.baseTime))
      || !Array.isArray(selection.waypointOverrides)) fail('INVALID_SAVED_NWP_SELECTION')
    const ids = new Set((value.routeMarkers ?? []).map((marker) => marker.id)), seen = new Set()
    for (const item of selection.waypointOverrides) {
      if (!item || typeof item.waypointId !== 'string' || !ids.has(item.waypointId) || seen.has(item.waypointId)
        || !Number.isInteger(item.offsetHours) || item.offsetHours < 0 || item.offsetHours > 12) fail('INVALID_SAVED_NWP_SELECTION')
      seen.add(item.waypointId)
    }
  }
  const geometry = value.routeGeometry ?? value.enrouteGeometry
  if (geometry && (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2
    || geometry.coordinates.length > 2000 || geometry.coordinates.some((point) => !Array.isArray(point) || point.length !== 2
      || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180 || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90))) fail('INVALID_SAVED_GEOMETRY')
  return value
}

// Prepare without writes or weather calls. The complete saved base/alternatives
// are either restored together or rejected; no silent candidate loss.
export async function prepareCopilotSavedRoute(bundle, { provider = navdataProvider, now = Date.now } = {}) {
  const raw = validateSavedRouteBundle(bundle, now())
  const saved = normalizeRouteSnapshot(raw)
  const drafts = [saved.base, ...(saved.alternatives ?? [])]
  if (drafts.length > MAX_ROUTE_DESIGNS) fail('SAVED_ROUTE_DESIGN_LIMIT')
  const notices = []
  const planner = createRoutePlanner(provider)
  const designs = [], catalogs = []
  for (const [index, draft] of drafts.entries()) {
    const form = draft.routeForm ?? {}
    if (!['IFR', 'VFR'].includes(form.flightRule) || !/^[A-Z]{4}$/.test(form.departureAirport ?? '')
      || !/^[A-Z]{4}$/.test(form.arrivalAirport ?? '')) fail('INVALID_SAVED_ROUTE_FORM')
    const ids = draft.procedureIds ?? {}
    const [sids, stars, iapData] = await Promise.all([
      ids.sid ? provider.getProcedures(form.departureAirport, 'SID').catch(() => []) : [],
      ids.star ? provider.getProcedures(form.arrivalAirport, 'STAR').catch(() => []) : [],
      ids.iapKey ? provider.loadIapData(form.arrivalAirport).catch(() => null) : null,
    ])
    catalogs.push(iapData)
    const procedures = { sid: sids.find((x) => x.id === ids.sid) ?? null, star: stars.find((x) => x.id === ids.star) ?? null,
      iapKey: iapData?.iapRoutes?.[ids.iapKey] ? ids.iapKey : null }
    const missing = ['sid', 'star', 'iapKey'].filter((key) => ids[key] && !procedures[key])
    if (missing.length) notices.push(`경로 ${index + 1}: 현재 자료에서 저장 절차(${missing.join(', ')})를 찾지 못했습니다. 저장된 선은 보존하지만 편집 시 절차를 다시 확인하세요.`)
    const editor = createRouteEditor({ routeForm: form, procedures, enroute: draft.enroute, rawText: draft.routeString ?? '' })
    let result = null, model = null, finalEditor = editor
    if (index === 0 && (saved.routeGeometry || saved.enrouteGeometry)) {
      const inputs = buildSavedBriefingInputs(saved)
      result = buildSavedRouteResult(inputs)
      model = inputs.routeModel
      if (form.flightRule === 'VFR') {
        // VFR renders editable waypoints, not previewGeojson. Sparse legacy
        // markers must never collapse the saved line to airport-to-airport.
        result.manualRoute.points = inputs.routeGeometry.coordinates.slice(1, -1).map((coordinates, index) => {
          const marker = inputs.routeMarkers.find((point) => point.lon === coordinates[0] && point.lat === coordinates[1])
          return { label: marker?.label ?? `WP${index + 1}`, coordinates: [...coordinates], kind: marker?.named ? 'published-fix' : 'user' }
        })
      }
    } else if (draft.routeString) {
      if (missing.length) fail('SAVED_PROCEDURE_UNAVAILABLE')
      const preview = await buildEditorPreview(editor, draft.routeString, { planner })
      finalEditor = preview.editor
      result = preview.result
      model = buildAppliedRouteInputs({ routeResult: result, selectedSid: procedures.sid, selectedStar: procedures.star,
        vfrWaypoints: form.flightRule === 'VFR' ? buildVfrWaypointsFromRouteResult(result, []) : [],
        selectedIap: iapData?.iapRoutes?.[procedures.iapKey], etd: saved.etd, eta: saved.eta,
        tasKt: saved.tasKt, cruiseAltitudeFt: saved.cruiseAltitudeFt }).routeModel
      notices.push(`경로 ${index + 1}: 저장된 입력 문자열을 현재 항법자료로 복원했습니다. 과거 경로 계산 결과는 아닙니다.`)
    } else {
      if (index > 0) fail('SAVED_ALTERNATIVE_INPUTS_INCOMPLETE')
      notices.push('기하와 경로 문자열이 없는 구형 저장분입니다. 입력 초안만 불러오며, 생성·적용은 편집기에서 진행하세요.')
    }
    const id = index === 0 ? 'base' : (draft.id || `saved-alternative-${index}`)
    if (designs.some((design) => design.id === id)) fail('DUPLICATE_SAVED_DESIGN')
    designs.push(createRouteDesign({ id, kind: index === 0 ? 'base' : 'alternative', name: draft.name,
      routeForm: form, procedures, enroute: finalEditor.enroute, routeString: finalEditor.rawText,
      routeResult: result, routeModel: model, routeExposure: { trigger: 'unavailable', hazards: [] } }))
  }
  validateSavedRouteBundle(bundle, now())
  if (saved.selectedAlternativeId && !designs.some((design) => design.id === saved.selectedAlternativeId)) fail('SAVED_SELECTION_UNAVAILABLE')
  return { bundle: structuredClone(bundle), saved, designs, iapData: catalogs[0],
    iapCatalogs: Object.fromEntries(designs.map((design, index) => [design.id, catalogs[index]])), notices,
    mode: designs[0].routeResult ? 'route' : 'draft',
    retainedFields: ['etd', 'cruiseAltitudeFt', 'tasKt'].filter((key) => saved[key] == null) }
}
