export function buildProcedurePayload(procedure, type) {
  if (!procedure) return null
  return {
    id: procedure.id ?? procedure.name ?? null,
    type,
    fixes: (procedure.fixes ?? []).map((fix) => ({
      id: fix.id,
      lon: fix.lon ?? fix.coordinates?.lon ?? null,
      lat: fix.lat ?? fix.coordinates?.lat ?? null,
      legDistanceNm: fix.legDistanceNm ?? null,
      altitude: fix.altitude ?? null,
    })),
  }
}

export function buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }) {
  if (routeResult?.flightRule !== 'IFR') return null
  return {
    entryFix: routeResult.entryFix ?? null,
    exitFix: routeResult.exitFix ?? null,
    procedures: [
      buildProcedurePayload(selectedSid, 'SID'),
      buildProcedurePayload(selectedStar, 'STAR'),
      buildProcedurePayload(selectedIap, 'IAP'),
    ].filter(Boolean),
  }
}

export function buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }) {
  if (!routeResult) return []

  if (routeResult.flightRule === 'VFR') {
    return (vfrWaypoints ?? []).map((wp) => ({
      label: wp.id,
      lon: wp.lon,
      lat: wp.lat,
      kind: wp.fixed ? 'AIRPORT' : 'WAYPOINT',
    }))
  }

  const baseLine = routeResult.previewGeojson?.features?.find((feature) => feature.properties.role === 'route-preview-line')
  const baseCoordinates = baseLine?.geometry?.coordinates ?? []
  const routeIds = new Set(routeResult.routeIds ?? [])
  const labels = (routeResult.displaySequence ?? []).filter((item) => !routeIds.has(item))

  return labels
    .map((label, index) => {
      const coordinate = baseCoordinates[index]
      if (!coordinate) return null
      return {
        label,
        lon: coordinate[0],
        lat: coordinate[1],
        kind: index === 0 || index === labels.length - 1 ? 'AIRPORT' : 'FIX',
      }
    })
    .filter(Boolean)
}

export function buildVerticalProfileRequest({
  routeGeometry,
  routeResult,
  selectedSid,
  selectedStar,
  selectedIap,
  vfrWaypoints,
  plannedCruiseAltitudeFt,
}) {
  return {
    flightRule: routeResult?.flightRule,
    routeGeometry,
    plannedCruiseAltitudeFt,
    procedureContext: buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }),
    vfrWaypoints: routeResult?.flightRule === 'VFR' ? vfrWaypoints : undefined,
    routeMarkers: buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }),
    sampleSpacingMeters: 250,
  }
}
