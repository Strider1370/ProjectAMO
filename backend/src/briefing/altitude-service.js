import { buildRouteAxis } from './route-axis.js'
import { attachActiveAipConstraints } from './aip-airway-constraints.js'
import { loadRouteCrossSection } from './enroute-cross-section.js'
import { buildAltitudeCandidates, buildAltitudeWeatherComparison } from './altitude-weather-comparison.js'
import { buildVerticalProfile } from './vertical-profile.js'

// Preserve the existing REST calculation. Captured mode has no live readers:
// a follow-up comparison changes only altitude, never route, weather or AIP run.
export function executeAltitudeComparison(body, { dataRoot, readCached, terrainSampler, captured, altitudesFt,
  loadConstraints = attachActiveAipConstraints, loadModel = loadRouteCrossSection } = {}) {
  const axis = buildRouteAxis(body.routeGeometry)
  const aip = captured ? captured.aip : loadConstraints({ dataRoot, routeModel: body.routeModel })
  const model = captured ? captured.model : loadModel({ root: dataRoot, routeGeometry: body.routeGeometry, body })
  const base = buildAltitudeCandidates({ routeSegments: aip.segments,
    plannedCruiseAltitudeFt: body.plannedCruiseAltitudeFt, crossSection: model.crossSection })
  const candidates = altitudesFt ? altitudesFt.map((altitudeFt) => {
    const result = buildAltitudeCandidates({ routeSegments: aip.segments, plannedCruiseAltitudeFt: altitudeFt, crossSection: model.crossSection })
    return result.candidates.find((candidate) => candidate.altitudeFt === altitudeFt)
  }) : base.candidates
  const hazards = captured ? captured.hazards : [
    ...(readCached('sigmet')?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
    ...(readCached('sigmet_overseas')?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
    ...(readCached('airmet')?.items ?? []).map((item) => ({ source: 'AIRMET', item })),
  ]
  const flightPlanProfiles = Object.fromEntries(candidates.flatMap((candidate) => {
    if (candidate.status !== 'valid' && candidate.status !== 'input_only') return []
    try {
      const sampler = captured ? { sampleAxis: () => {
        if (!captured.terrain) throw new Error('Pinned terrain unavailable')
        return captured.terrain
      } } : terrainSampler
      return [[candidate.altitudeFt, buildVerticalProfile({ ...body, plannedCruiseAltitudeFt: candidate.altitudeFt }, sampler).flightPlan.profile]]
    } catch { return [] }
  }))
  const rows = buildAltitudeWeatherComparison({ candidates, crossSection: model.crossSection,
    turbulence: model.turbulence, axis, hazards,
    notams: captured ? captured.notams : readCached('notam')?.items ?? [],
    etd: body.etd, eta: body.eta, flightPlanProfiles })
  return {
    constraints: { ...base.constraints, provenance: aip.provenance },
    rows: altitudesFt ? rows.map((row) => ({ ...row, profileStatus: row.status === 'input_invalid' ? 'not_assessed'
      : flightPlanProfiles[row.altitudeFt] ? 'applied' : 'cruise_fallback' })) : rows,
    crossSectionRun: model.crossSection?.run ?? null,
    crossSection: model.available ? { ...model.crossSection, turbulence: model.turbulence, availableTimes: model.availableTimes,
      timeRules: model.timeRules, nwpTimeAvailability: model.nwpTimeAvailability } : null,
  }
}

// All captured values are application-owned, not model/client assessments.
// This runs alongside the original briefing so later calls need no mutable files.
export function captureAltitudeInputs(request, data, { terrainSampler,
  loadModel = loadRouteCrossSection, loadConstraints = attachActiveAipConstraints } = {}) {
  const aip = loadConstraints({ dataRoot: data.dataRoot, routeModel: request.routeModel })
  let model = data.enrouteCrossSection
  if (!model) {
    try { model = data.dataRoot ? loadModel({ root: data.dataRoot, routeGeometry: request.routeGeometry, body: request }) : { available: false } }
    catch { model = { available: false, reason: 'MODEL_READ_FAILED' } }
  }
  let terrain = null, verticalProfile = null
  if (terrainSampler) {
    try {
      verticalProfile = buildVerticalProfile(request, { sampleAxis(axis) {
        terrain = terrainSampler.sampleAxis(axis)
        return terrain
      } })
    } catch { verticalProfile = null }
  }
  return { aip, model, terrain, verticalProfile,
    hazards: [
      ...(data.sigmet?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
      ...(data.sigmetOverseas?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
      ...(data.airmet?.items ?? []).map((item) => ({ source: 'AIRMET', item })),
    ], notams: data.notam?.items ?? [] }
}
