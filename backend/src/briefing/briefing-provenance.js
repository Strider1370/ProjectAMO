export function buildBriefingProvenance({ routeModel, aipConstraints, hazards, enrouteModel } = {}) {
  return {
    route: {
      schemaVersion: routeModel?.schemaVersion ?? null,
      graphConnectionStatus: routeModel?.graphConnectionStatus ?? 'unavailable',
      enRouteSegmentIds: (routeModel?.enRouteSegments ?? []).map((segment) => segment.id),
      enRouteLegs: (routeModel?.enRouteSegments ?? []).map((segment) => ({ id: segment.id, kind: segment.kind ?? 'airway' })),
    },
    aip: {
      status: aipConstraints?.status ?? 'unavailable',
      publicationId: aipConstraints?.provenance?.publicationId ?? null,
      effectiveAt: aipConstraints?.provenance?.effectiveAt ?? null,
      validationStatus: aipConstraints?.provenance?.validationStatus ?? 'unavailable',
      unresolvedSegments: (aipConstraints?.segments ?? [])
        .filter((segment) => segment.status !== 'matched')
        .map((segment) => ({ id: segment.id, status: segment.status })),
    },
    hazards: (hazards ?? []).map((hazard) => ({
      id: hazard.sourceId ?? null,
      source: hazard.source,
      validFrom: hazard.validFrom ?? null,
      validTo: hazard.validTo ?? null,
      timeStatus: hazard.timeStatus ?? null,
      confidence: hazard.confidence ?? null,
    })),
    enrouteWeather: {
      status: enrouteModel ? 'available' : 'unavailable',
      reason: enrouteModel ? null : 'cross_section_unavailable',
      kimRun: enrouteModel?.runs?.kim ?? null,
      ktgRun: enrouteModel?.runs?.ktg ?? null,
    },
  }
}
