import { buildRouteAxis } from './route-axis.js'
import { annotateRouteAxis, buildFlightPlanProfile, buildProfileMarkers } from './profile-composer.js'

const DEFAULT_SAMPLE_SPACING_METERS = 250

export function buildVerticalProfile(payload, terrainSampler) {
  const axis = annotateRouteAxis(
    buildRouteAxis(payload.routeGeometry, payload.sampleSpacingMeters ?? DEFAULT_SAMPLE_SPACING_METERS),
    payload,
  )
  const terrainResult = terrainSampler.sampleAxis(axis)
  // A map-drawn line has no flight plan or cruise altitude. Keep its terrain
  // and weather axis without inventing a climb/descent path.
  const flightPlan = payload.terrainOnly ? null : buildFlightPlanProfile(payload, axis, terrainResult)
  const candidateProfiles = payload.terrainOnly ? [] : [...new Set(payload.candidateCruiseAltitudesFt ?? [])]
    .map(Number)
    .filter((altitudeFt) => Number.isFinite(altitudeFt) && altitudeFt > 0)
    .map((altitudeFt) => buildFlightPlanProfile({
      ...payload,
      plannedCruiseAltitudeFt: altitudeFt,
    }, axis, terrainResult))

  return {
    axis,
    terrain: terrainResult.terrain,
    flightPlan,
    candidateProfiles,
    markers: buildProfileMarkers(payload),
    layers: {},
    warnings: terrainResult.warnings,
  }
}
