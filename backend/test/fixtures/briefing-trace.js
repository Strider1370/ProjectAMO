export const TRACE_ROUTE_MODEL = {
  schemaVersion: 1,
  graphConnectionStatus: 'connected',
  enRouteSegments: [{ id: 'A582-003' }, { id: 'A582-004' }],
}

export const TRACE_AIP_CONSTRAINTS = {
  status: 'partial',
  provenance: {
    publicationId: '2026-06-25',
    effectiveAt: '2026-06-25T16:00:00Z',
    validationStatus: 'validated',
  },
}

export const TRACE_HAZARDS = [{
  sourceId: 'SIGMET-RKRR-1', source: 'SIGMET',
  validFrom: '2026-06-25T12:00:00Z', validTo: '2026-06-25T18:00:00Z',
  timeStatus: 'not_provided', confidence: 'partial',
}]

export const WORKFLOW_SCENARIOS = Object.freeze([
  { id: 'normal', horizontalExposure: 'clear', altitudeExposure: 'clear', timeStatus: 'matched' },
  { id: 'horizontal_hazard', horizontalExposure: 'intersects', altitudeExposure: 'intersects', timeStatus: 'matched' },
  { id: 'altitude_mismatch', horizontalExposure: 'intersects', altitudeExposure: 'clear', timeStatus: 'matched' },
  { id: 'time_missing', horizontalExposure: 'intersects', altitudeExposure: 'intersects', timeStatus: 'not_provided' },
  { id: 'multiple_polygons', horizontalExposure: 'intersects', altitudeExposure: 'intersects', timeStatus: 'matched' },
  { id: 'aip_conflict', aipStatus: 'conflicting' },
  { id: 'notam_unresolved', notamStatus: 'unavailable' },
])
