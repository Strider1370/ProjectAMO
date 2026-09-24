import { createRoutePlanner } from './routePlanner.js'
import { recommendProcedures } from './recommendProcedures.js'
import { createRouteEditor } from './routeEditor.js'
import { buildEditorPreview } from './editorPreview.js'
import { getCurrentRouteLineString } from './appliedGeometry.js'
import { buildCommonRouteModel } from '../route-model.js'
import { buildVerticalProfileRequest } from './verticalProfileRequest.js'
import { computeEtaIso } from './etaCalc.js'
import { getWindDirection } from './procedureSelection.js'
import { KNOWN_AIRPORTS } from './procedureData.js'
import { validateRouteSettings } from '../route-settings.js'

// Used by the existing browser auto-draft flow as well as the server planner.
// Keep recommendation -> formatted airway text -> editable expanded route intact.
export async function prepareRouteDraft(options, planner) {
  const best = await recommendProcedures({ ...options, ...planner })
  if (!best) return null
  const routeForm = {
    ...options.routeForm,
    entryFix: best.entryFix ?? options.routeForm.entryFix,
    exitFix: best.exitFix ?? options.routeForm.exitFix,
    routeType: options.effectiveRouteType,
  }
  const generated = await planner.buildBriefingRoute(routeForm)
  return buildEditorPreview(createRouteEditor({
    routeForm,
    procedures: { sid: best.sid ?? null, star: best.star ?? null, iapKey: best.iapKey ?? null },
  }), planner.formatRouteString(generated), { planner, effectiveRouteType: options.effectiveRouteType })
}

// Application-independent applied geometry and ETA inputs. No weather requests,
// state mutation, storage or provider calls. ETA keeps the existing distance/TAS
// estimate (not wind-corrected aircraft performance or an operational clearance).
export function buildAppliedRouteInputs({
  routeResult, selectedSid, selectedStar, selectedIap, vfrWaypoints = [],
  etd, eta = null, tasKt, cruiseAltitudeFt,
}) {
  const routeGeometry = getCurrentRouteLineString({ routeResult, selectedSid, selectedStar, selectedIap, vfrWaypoints })
  const routeModel = buildCommonRouteModel({ routeGeometry, routeResult })
  const etdIso = Number.isFinite(Date.parse(etd)) ? new Date(etd).toISOString().replace('.000Z', 'Z') : null
  const nextEta = eta || computeEtaIso(etdIso, routeResult.totalDistanceNm ?? routeResult.distanceNm, tasKt) || null
  return {
    routeGeometry, routeModel, etd: etdIso, eta: nextEta,
    profileRequest: buildVerticalProfileRequest({
      routeGeometry, routeModel, routeResult, selectedSid, selectedStar, selectedIap,
      vfrWaypoints, plannedCruiseAltitudeFt: cruiseAltitudeFt,
    }),
  }
}

function fail(code) { throw Object.assign(new Error(code), { code }) }

function validInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false
  // Date.parse accepts Feb 30 by rolling into March; flight dates must not roll.
  const date = new Date(value.slice(0, 10) + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10)
    && Number(value.slice(11, 13)) < 24
}

// The first server-supported range is domestic IFR. Existing browser VFR,
// overseas and organization workflows remain available outside this entry point.
export async function planRoute(input, provider) {
  if (!input || Object.keys(input).some((key) => !['routeForm', 'metarData', 'etd', 'eta', 'tasKt', 'cruiseAltitudeFt'].includes(key))) fail('UNSUPPORTED_ROUTE_CONDITIONS')
  const { routeForm, metarData = null, etd, eta = null, tasKt, cruiseAltitudeFt } = input
  if (routeForm && (Object.keys(routeForm).some((key) => !['flightRule', 'departureAirport', 'arrivalAirport', 'routeType', 'entryFix', 'exitFix'].includes(key))
    || routeForm.entryFix || routeForm.exitFix)) fail('UNSUPPORTED_ROUTE_CONDITIONS')
  if (routeForm?.flightRule !== 'IFR'
    || !KNOWN_AIRPORTS.includes(routeForm.departureAirport)
    || !KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)) fail('ROUTE_PLANNING_UNSUPPORTED')
  if (!Number.isFinite(tasKt) || tasKt < 30 || tasKt > 1000) fail('INVALID_TAS')
  if (!Number.isInteger(cruiseAltitudeFt)) fail('INVALID_ROUTE_ALTITUDE')
  if (!validInstant(etd)) fail('INVALID_ETD')
  if (eta !== null && !validInstant(eta)) fail('INVALID_ETA')
  validateRouteSettings({
    departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport,
    flightRule: 'IFR', cruiseAltitudeFt, etd: new Date(etd).toISOString(),
    ...(eta ? { eta: new Date(eta).toISOString() } : {}),
  })
  const effectiveRouteType = routeForm.routeType || 'ALL'
  if (!['ALL', 'ATS', 'RNAV'].includes(effectiveRouteType)) fail('INVALID_ROUTE_TYPE')
  const planner = createRoutePlanner(provider)
  const [navdata, sidOptions, starOptions, iapData] = await Promise.all([
    provider.loadNavdata(), provider.getProcedures(routeForm.departureAirport, 'SID'),
    provider.getProcedures(routeForm.arrivalAirport, 'STAR'), provider.loadIapData(routeForm.arrivalAirport),
  ])
  if (!sidOptions.length || !starOptions.length || !iapData) fail('PROCEDURE_DATA_UNAVAILABLE')
  const draft = await prepareRouteDraft({
    routeForm, sidOptions, starOptions, iapData, metarData,
    isFirInMode: false, isFirExitMode: false, effectiveRouteType,
  }, planner)
  if (!draft) fail('ROUTE_NOT_FOUND')
  const { sid, star, iapKey } = draft.editor.procedures
  const selectedIap = iapData.iapRoutes?.[iapKey]
  if (!selectedIap) fail('IAP_UNAVAILABLE')
  const applied = buildAppliedRouteInputs({
    routeResult: draft.result, selectedSid: sid, selectedStar: star, selectedIap,
    etd, eta, tasKt, cruiseAltitudeFt,
  })
  if (!applied.routeGeometry || !applied.eta) fail('ROUTE_INPUTS_UNAVAILABLE')
  return {
    publicationId: navdata.publicationId,
    snapshotId: provider.snapshotId ?? null,
    editor: draft.editor, routeResult: draft.result, selectedIap, ...applied,
    assumptions: {
      missingWindAirports: [routeForm.departureAirport, routeForm.arrivalAirport]
        .filter((id) => getWindDirection(metarData, id) === null),
      runwaySelection: 'existing-wind-heading-or-first-listed',
      routeSelection: 'existing-total-distance-order',
      etaBasis: eta ? 'user-specified' : 'existing-route-distance-over-tas',
      representativeApproach: true,
      operationalClearance: false,
    },
  }
}
