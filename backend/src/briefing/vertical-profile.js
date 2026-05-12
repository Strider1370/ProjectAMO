import { buildRouteAxis } from './route-axis.js'
import { annotateRouteAxis, buildFlightPlanProfile, buildProfileMarkers } from './profile-composer.js'

const DEFAULT_SAMPLE_SPACING_METERS = 250

export function buildVerticalProfile(payload, terrainSampler) {
  const axis = annotateRouteAxis(
    buildRouteAxis(payload.routeGeometry, payload.sampleSpacingMeters ?? DEFAULT_SAMPLE_SPACING_METERS),
    payload,
  )
  const terrainResult = terrainSampler.sampleAxis(axis)
  const flightPlan = buildFlightPlanProfile(payload, axis, terrainResult)

  return {
    axis,
    terrain: terrainResult.terrain,
    flightPlan,
    markers: buildProfileMarkers(payload),
    layers: {},
    warnings: terrainResult.warnings,
  }
}
