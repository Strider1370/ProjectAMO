import { buildVerticalProfileRequest } from './verticalProfileRequest.js'
import { getCurrentRouteLineString } from './routeBriefingModel.js'

export function buildAppliedCopilotContext({ scope, design, routeResult, vfrWaypoints,
  selectedSid, selectedStar, selectedIap, etd, eta, cruiseAltitudeFt, alternateAirport, nwpTimeSelection }) {
  if (scope === 'organization') return { unsupported: 'ORGANIZATION_CONTEXT_UNSUPPORTED' }
  const applied = design?.routeResult ?? routeResult
  if (!applied) return null
  const sid = design?.procedures?.sid ?? selectedSid
  const star = design?.procedures?.star ?? selectedStar
  const geometry = design?.routeModel?.routeGeometry ?? applied.routeModel?.routeGeometry
    ?? getCurrentRouteLineString({ routeResult: applied, vfrWaypoints, selectedSid: sid, selectedStar: star, selectedIap })
  const profile = buildVerticalProfileRequest({ routeGeometry: geometry, routeModel: design?.routeModel ?? applied.routeModel,
    routeResult: applied, vfrWaypoints, selectedSid: sid, selectedStar: star, selectedIap,
    plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) })
  const form = design?.routeForm ?? applied
  // Deliberately exclude editor drafts, weather results and AIP assessment fields.
  return structuredClone({ schemaVersion: 1, scope: 'personal', request: {
    flightRule: applied.flightRule, departureAirport: form.departureAirport, arrivalAirport: form.arrivalAirport,
    alternateAirport: alternateAirport || null, routeGeometry: geometry, routeModel: profile.routeModel,
    routeMarkers: profile.routeMarkers, procedureContext: profile.procedureContext,
    plannedCruiseAltitudeFt: profile.plannedCruiseAltitudeFt, etd, eta, nwpTimeSelection: nwpTimeSelection ?? null,
  } })
}
