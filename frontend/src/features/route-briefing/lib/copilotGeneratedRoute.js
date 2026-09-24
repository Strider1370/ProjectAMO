import { validateRouteSettings } from '../../../../../shared/route-settings.js'
import { buildAppliedRouteInputs } from '../../../../../shared/route-planning/planRoute.js'
import { navdataProvider } from './routePlanner.js'

const fail = (code) => { throw Object.assign(new Error(code), { code }) }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Only the owner-authenticated stored result endpoint can supply this bundle.
// Chat text/cards carry neither editor geometry nor an installable action.
export function generatedRouteAction(bundle, now = Date.now()) {
  const { plan, request, reference } = bundle ?? {}
  if (bundle?.status !== 'ok' || plan?.origin !== 'server-planner' || plan.schemaVersion !== 1
    || reference?.routeOrigin !== 'server-planner' || plan.publicationId !== reference.publicationId
    || !plan.snapshotId || plan.snapshotId !== reference.navdataSnapshotId
    || !bundle.resultHash || reference.resultHash !== bundle.resultHash) fail('INVALID_GENERATED_ROUTE')
  if (!Number.isFinite(Date.parse(bundle.expiresAt)) || Date.parse(bundle.expiresAt) <= now) fail('REFERENCE_EXPIRED')
  const fields = validateRouteSettings(Object.fromEntries(['departureAirport', 'arrivalAirport', 'flightRule', 'cruiseAltitudeFt', 'etd', 'eta']
    .map((key) => [key, plan.flight?.[key]])))
  if (!fields.etd || !fields.eta || !fields.cruiseAltitudeFt || fields.flightRule !== 'IFR'
    || !Number.isFinite(plan.flight.tasKt) || plan.flight.tasKt < 30 || plan.flight.tasKt > 1000
    || !['ALL', 'ATS', 'RNAV'].includes(plan.flight.routeType)) fail('INVALID_GENERATED_ROUTE')
  if (fields.departureAirport !== request?.departureAirport || fields.arrivalAirport !== request?.arrivalAirport
    || fields.etd !== request.etd || fields.eta !== request.eta || fields.cruiseAltitudeFt !== request.plannedCruiseAltitudeFt
    || plan.editor?.routeForm?.departureAirport !== fields.departureAirport
    || plan.editor?.routeForm?.arrivalAirport !== fields.arrivalAirport
    || plan.editor?.routeForm?.flightRule !== fields.flightRule
    || plan.editor?.routeForm?.routeType !== plan.flight.routeType
    || !plan.editor?.rawText || !plan.routeResult || !request.routeModel) fail('INVALID_GENERATED_ROUTE')
  return { type: 'route_settings', schemaVersion: 1, fields }
}

export async function prepareGeneratedRoute(bundle, { provider = navdataProvider, now = Date.now } = {}) {
  const action = generatedRouteAction(bundle, now())
  const { plan, request } = bundle
  const [navdata, sids, stars, iapData] = await Promise.all([
    provider.loadNavdata(), provider.getProcedures(action.fields.departureAirport, 'SID'),
    provider.getProcedures(action.fields.arrivalAirport, 'STAR'), provider.loadIapData(action.fields.arrivalAirport),
  ])
  // An old route remains viewable as a stored result, but is not installed into
  // an editor using a different publication, changed terminal procedures or
  // used airway records (even when the publication label has not changed).
  const { sid, star, iapKey } = plan.editor.procedures ?? {}
  const sourceIds = [...new Set(request.routeModel.enRouteSegments
    .filter((segment) => segment.kind === 'airway').map((segment) => segment.id))]
  if (navdata.publicationId !== plan.publicationId || !sid || !star || !iapKey
    || !Array.isArray(plan.sourceSegments) || plan.sourceSegments.length !== sourceIds.length
    || sourceIds.some((id, index) => plan.sourceSegments[index]?.id !== id
      || !navdata.routeSegmentsById[id] || !equal(navdata.routeSegmentsById[id], plan.sourceSegments[index]))
    || !equal(sids.find((item) => item.id === sid.id), sid)
    || !equal(stars.find((item) => item.id === star.id), star)
    || !equal(iapData?.iapRoutes?.[iapKey], plan.selectedIap)) fail('NAVDATA_PLAN_MISMATCH')
  const applied = buildAppliedRouteInputs({ routeResult: plan.routeResult, selectedSid: sid, selectedStar: star, selectedIap: plan.selectedIap,
    etd: plan.flight.etd, eta: plan.flight.eta, tasKt: plan.flight.tasKt, cruiseAltitudeFt: plan.flight.cruiseAltitudeFt })
  if (!equal(applied.routeGeometry, request.routeGeometry)) fail('GENERATED_GEOMETRY_MISMATCH')
  generatedRouteAction(bundle, now())
  return { bundle: structuredClone(bundle), action, iapData, resultHash: bundle.resultHash }
}
