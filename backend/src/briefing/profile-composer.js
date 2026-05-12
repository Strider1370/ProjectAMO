import { distanceMeters } from './route-axis.js'

const METERS_PER_NM = 1852
const M_TO_FT = 3.28084
const DEFAULT_CLIMB_GRADIENT_FT_PER_NM = 600
const DEFAULT_DESCENT_GRADIENT_FT_PER_NM = 300

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundDistanceNm(value) {
  return Number(value.toFixed(2))
}

function getRouteCoordinates(routeGeometry) {
  return routeGeometry?.coordinates ?? []
}

function coordinateOf(point) {
  const lon = asNumber(point?.lon ?? point?.coordinates?.lon ?? point?.coordinate?.lon)
  const lat = asNumber(point?.lat ?? point?.coordinates?.lat ?? point?.coordinate?.lat)
  return lon == null || lat == null ? null : [lon, lat]
}

function cumulativeDistancesNm(coordinates) {
  const distances = [0]
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    distances.push(distances[index] + distanceMeters(coordinates[index], coordinates[index + 1]) / METERS_PER_NM)
  }
  return distances
}

function totalRouteDistanceNm(coordinates) {
  const distances = cumulativeDistancesNm(coordinates)
  return distances[distances.length - 1] ?? 0
}

export function distanceAlongRouteNm(coordinates, target) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Array.isArray(target)) return 0

  const cumulative = cumulativeDistancesNm(coordinates)
  let best = { distanceSq: Number.POSITIVE_INFINITY, distanceNm: 0 }

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [ax, ay] = coordinates[index]
    const [bx, by] = coordinates[index + 1]
    const [px, py] = target
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    const ratio = lenSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1)
    const projected = [ax + dx * ratio, ay + dy * ratio]
    const distanceSq = (px - projected[0]) ** 2 + (py - projected[1]) ** 2

    if (distanceSq < best.distanceSq) {
      best = {
        distanceSq,
        distanceNm: cumulative[index] + (distanceMeters(coordinates[index], coordinates[index + 1]) / METERS_PER_NM) * ratio,
      }
    }
  }

  return roundDistanceNm(best.distanceNm)
}

function normalizeFix(fix) {
  const coordinate = coordinateOf(fix)
  if (!coordinate) return null
  return {
    id: String(fix?.id ?? fix?.label ?? '').trim() || null,
    lon: coordinate[0],
    lat: coordinate[1],
    legDistanceNm: asNumber(fix?.legDistanceNm),
    altitude: fix?.altitude ?? null,
  }
}

function normalizeProcedure(procedure) {
  if (!procedure) return null
  const fixes = (procedure.fixes ?? []).map(normalizeFix).filter(Boolean)
  if (fixes.length === 0) return null
  return {
    id: String(procedure.id ?? '').trim() || null,
    type: String(procedure.type ?? '').trim().toUpperCase(),
    fixes,
  }
}

function getProcedure(payload, type) {
  const targetType = type.toUpperCase()
  const context = payload?.procedureContext ?? {}
  const keyed = context[targetType.toLowerCase()] ?? context[targetType]
  return normalizeProcedure(keyed)
    ?? (context.procedures ?? []).map(normalizeProcedure).find((procedure) => procedure?.type === targetType)
    ?? null
}

function procedureDistancePoints(procedure, routeCoordinates) {
  return (procedure?.fixes ?? [])
    .map((fix) => ({
      fix,
      distanceNm: distanceAlongRouteNm(routeCoordinates, [fix.lon, fix.lat]),
    }))
    .filter((point) => Number.isFinite(point.distanceNm))
    .sort((a, b) => a.distanceNm - b.distanceNm)
}

function altitudeRepresentativeFt(altitude) {
  const minFt = altitude?.minFt == null ? null : asNumber(altitude.minFt)
  const maxFt = altitude?.maxFt == null ? null : asNumber(altitude.maxFt)
  const hasMin = minFt != null
  const hasMax = maxFt != null

  if (hasMin && hasMax && minFt === maxFt) return minFt
  if (hasMin && !hasMax) return minFt
  if (!hasMin && hasMax) return maxFt
  if (hasMin && hasMax) return (minFt + maxFt) / 2
  return null
}

function pushDedupedProfilePoint(points, point) {
  if (!point || !Number.isFinite(point.distanceNm) || !Number.isFinite(point.altitudeFt)) return
  const normalized = {
    ...point,
    distanceNm: roundDistanceNm(Math.max(0, point.distanceNm)),
    altitudeFt: Math.max(0, Math.round(point.altitudeFt)),
  }
  const previous = points[points.length - 1]
  if (previous && Math.abs(previous.distanceNm - normalized.distanceNm) < 0.01) {
    points[points.length - 1] = normalized
  } else {
    points.push(normalized)
  }
}

function applyClimbUpperLimit(altitudeFt, restriction, cruiseAltitudeFt) {
  const maxFt = restriction?.maxFt == null ? null : asNumber(restriction.maxFt)
  const limited = Math.min(altitudeFt, cruiseAltitudeFt)
  return maxFt == null ? limited : Math.min(limited, maxFt)
}

function applyDescentLowerLimit(altitudeFt, restriction) {
  const minFt = restriction?.minFt == null ? null : asNumber(restriction.minFt)
  return minFt == null ? altitudeFt : Math.max(altitudeFt, minFt)
}

function buildGradientClimbProfile({ procedure, routeCoordinates, cruiseAltitudeFt, enrouteStartNm }) {
  const points = []
  pushDedupedProfilePoint(points, { distanceNm: 0, altitudeFt: 0, source: 'AIRPORT' })

  const climbFixes = procedureDistancePoints(procedure, routeCoordinates)
    .filter((point) => point.distanceNm > 0.01 && point.distanceNm <= enrouteStartNm + 0.01)
  const hasEnrouteStartPoint = climbFixes.some((point) => Math.abs(point.distanceNm - enrouteStartNm) < 0.01)

  ;[...climbFixes, ...(hasEnrouteStartPoint ? [] : [{ distanceNm: enrouteStartNm, fix: null }])].forEach(({ fix, distanceNm }) => {
    const previous = points[points.length - 1]
    const projectedAltitudeFt = Math.min(
      cruiseAltitudeFt,
      previous.altitudeFt + Math.max(0, distanceNm - previous.distanceNm) * DEFAULT_CLIMB_GRADIENT_FT_PER_NM,
    )
    const limitedAltitudeFt = applyClimbUpperLimit(projectedAltitudeFt, fix?.altitude, cruiseAltitudeFt)
    pushDedupedProfilePoint(points, {
      distanceNm,
      altitudeFt: Math.max(previous.altitudeFt, limitedAltitudeFt),
      source: fix ? 'SID_RESTRICTION' : 'SID_END',
      rawAltitude: fix?.altitude?.raw ?? null,
    })
  })

  return points
}

function buildGradientDescentProfile({
  procedures,
  routeCoordinates,
  cruiseAltitudeFt,
  enrouteStartNm,
  enrouteEndNm,
  targetDistanceNm,
  targetAltitudeFt,
}) {
  const procedurePoints = procedures.flatMap((procedure) => procedureDistancePoints(procedure, routeCoordinates))
  const constrainedPoints = procedurePoints
    .filter((point) => asNumber(point.fix?.altitude?.minFt) != null)
    .sort((a, b) => a.distanceNm - b.distanceNm)

  const finalAltitudeFt = Number.isFinite(targetAltitudeFt) ? Math.max(0, targetAltitudeFt) : 0
  const descentDistanceNm = Math.max(0, cruiseAltitudeFt - finalAltitudeFt) / DEFAULT_DESCENT_GRADIENT_FT_PER_NM
  const calculatedDescentStartNm = targetDistanceNm - descentDistanceNm
  const descentStartNm = clamp(calculatedDescentStartNm, enrouteStartNm, targetDistanceNm)
  const points = []

  pushDedupedProfilePoint(points, { distanceNm: descentStartNm, altitudeFt: cruiseAltitudeFt, source: 'TOD' })
  ;[
    ...constrainedPoints.filter((point) => point.distanceNm > descentStartNm + 0.01 && point.distanceNm < targetDistanceNm - 0.01),
    { distanceNm: targetDistanceNm, fix: null, altitudeFt: finalAltitudeFt },
  ].forEach(({ fix, distanceNm, altitudeFt }) => {
    const previous = points[points.length - 1]
    const projectedAltitudeFt = Math.max(
      finalAltitudeFt,
      previous.altitudeFt - Math.max(0, distanceNm - previous.distanceNm) * DEFAULT_DESCENT_GRADIENT_FT_PER_NM,
    )
    const limitedAltitudeFt = applyDescentLowerLimit(projectedAltitudeFt, fix?.altitude)
    pushDedupedProfilePoint(points, {
      distanceNm,
      altitudeFt: altitudeFt ?? Math.min(previous.altitudeFt, limitedAltitudeFt),
      source: fix ? 'DESCENT_RESTRICTION' : 'ARRIVAL_END',
      rawAltitude: fix?.altitude?.raw ?? null,
    })
  })

  return {
    points,
    tod: {
      distanceNm: roundDistanceNm(descentStartNm),
    },
  }
}

function terrainElevationFtForIndex(terrainResult, sampleIndex) {
  const elevationM = terrainResult?.terrain?.values?.find((value) => value.index === sampleIndex)?.elevationM
  return Number.isFinite(elevationM) ? Math.max(0, Math.round(elevationM * M_TO_FT)) : null
}

function buildVfrProfile(payload, axis, terrainResult, cruiseAltitudeFt) {
  const routeCoordinates = getRouteCoordinates(payload.routeGeometry)
  const waypoints = (payload.vfrWaypoints ?? [])
    .map((waypoint) => {
      const coordinate = coordinateOf(waypoint)
      if (!coordinate) return null
      return {
        ...waypoint,
        id: String(waypoint.id ?? '').trim() || null,
        lon: coordinate[0],
        lat: coordinate[1],
        distanceNm: distanceAlongRouteNm(routeCoordinates, coordinate),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceNm - b.distanceNm)

  if (waypoints.length < 2) {
    return {
      label: 'VFR WP\ubcc4 \uacc4\ud68d\uace0\ub3c4 \uc801\uc6a9',
      points: [
        { distanceNm: 0, altitudeFt: 0, source: 'AIRPORT' },
        { distanceNm: axis.totalDistanceNm, altitudeFt: 0, source: 'AIRPORT' },
      ],
      tod: null,
      model: { vfrWaypointAltitudes: true },
    }
  }

  const endpointTerrain = new Map([
    [0, terrainElevationFtForIndex(terrainResult, axis.samples[0]?.index)],
    [waypoints.length - 1, terrainElevationFtForIndex(terrainResult, axis.samples[axis.samples.length - 1]?.index)],
  ])

  return {
    label: 'VFR WP\ubcc4 \uacc4\ud68d\uace0\ub3c4 \uc801\uc6a9',
    points: waypoints.map((waypoint, index) => {
      const waypointAltitudeFt = asNumber(waypoint.altitudeFt)
      const airportElevationFt = asNumber(waypoint.airportElevationFt)
      let altitudeFt = waypoint.fixed
        ? airportElevationFt ?? endpointTerrain.get(index) ?? 0
        : waypointAltitudeFt ?? cruiseAltitudeFt
      altitudeFt = Math.max(0, Math.round(altitudeFt))
      return {
        label: waypoint.id,
        distanceNm: waypoint.distanceNm,
        altitudeFt,
        source: waypoint.fixed ? 'AIRPORT' : 'USER_WAYPOINT',
      }
    }),
    tod: null,
    model: { vfrWaypointAltitudes: true },
  }
}

function getIfrBoundaries(payload, routeCoordinates, totalDistanceNm) {
  const sid = getProcedure(payload, 'SID')
  const star = getProcedure(payload, 'STAR')
  const iap = getProcedure(payload, 'IAP')
  const sidPoints = procedureDistancePoints(sid, routeCoordinates)
  const starPoints = procedureDistancePoints(star, routeCoordinates)
  const iapPoints = procedureDistancePoints(iap, routeCoordinates)
  const enrouteStartNm = sidPoints.length > 0
    ? clamp(sidPoints[sidPoints.length - 1].distanceNm, 0, totalDistanceNm)
    : 0
  const iapStartNm = iapPoints.length > 0
    ? clamp(iapPoints[0].distanceNm, enrouteStartNm, totalDistanceNm)
    : totalDistanceNm
  const enrouteEndNm = starPoints.length > 0
    ? clamp(starPoints[0].distanceNm, enrouteStartNm, totalDistanceNm)
    : iapStartNm

  return {
    sid,
    star,
    iap,
    enrouteStartNm,
    enrouteEndNm,
    iapStartNm,
  }
}

function buildIfrProfile(payload, routeCoordinates, cruiseAltitudeFt) {
  const totalDistanceNm = totalRouteDistanceNm(routeCoordinates)
  const { sid, star, iap, enrouteStartNm, enrouteEndNm } = getIfrBoundaries(payload, routeCoordinates, totalDistanceNm)
  const points = []
  let tod = null

  const pushPoint = (point) => {
    if (!point) return
    pushDedupedProfilePoint(points, {
      ...point,
      distanceNm: clamp(point.distanceNm, 0, totalDistanceNm),
    })
  }

  if (sid?.fixes?.length >= 2 && enrouteStartNm > 0.01) {
    buildGradientClimbProfile({ procedure: sid, routeCoordinates, cruiseAltitudeFt, enrouteStartNm }).forEach(pushPoint)
  } else {
    pushPoint({ distanceNm: 0, altitudeFt: cruiseAltitudeFt, source: 'ENROUTE' })
  }

  const lastClimbPoint = points[points.length - 1]
  let cruiseReadyNm = lastClimbPoint?.distanceNm ?? enrouteStartNm
  if (lastClimbPoint && lastClimbPoint.altitudeFt < cruiseAltitudeFt) {
    cruiseReadyNm = lastClimbPoint.distanceNm + (cruiseAltitudeFt - lastClimbPoint.altitudeFt) / DEFAULT_CLIMB_GRADIENT_FT_PER_NM
    pushPoint({
      distanceNm: cruiseReadyNm,
      altitudeFt: cruiseAltitudeFt,
      source: 'CLIMB_TO_CRUISE',
    })
  }

  const descentProcedures = [star, iap].filter(Boolean)
  if (descentProcedures.length > 0) {
    const descentPoints = descentProcedures.flatMap((procedure) => procedureDistancePoints(procedure, routeCoordinates))
      .sort((a, b) => a.distanceNm - b.distanceNm)
    const targetPoint = descentPoints[descentPoints.length - 1]
    const targetDistanceNm = targetPoint?.distanceNm ?? totalDistanceNm
    const targetAltitudeFt = altitudeRepresentativeFt(targetPoint?.fix?.altitude) ?? 0
    const descentProfile = buildGradientDescentProfile({
      procedures: descentProcedures,
      routeCoordinates,
      cruiseAltitudeFt,
      enrouteStartNm: Math.max(enrouteStartNm, cruiseReadyNm),
      enrouteEndNm,
      targetDistanceNm,
      targetAltitudeFt,
    })
    const descentStartNm = descentProfile.tod?.distanceNm
    tod = {
      distanceNm: descentStartNm,
      distanceFromEnrouteEndNm: Number((enrouteEndNm - descentStartNm).toFixed(1)),
      referenceFixLabel: payload?.procedureContext?.exitFix ?? null,
    }
    descentProfile.points.forEach(pushPoint)
  } else {
    pushPoint({ distanceNm: totalDistanceNm, altitudeFt: cruiseAltitudeFt, source: 'ENROUTE' })
  }

  const deduped = []
  points
    .filter((point) => Number.isFinite(point.distanceNm) && Number.isFinite(point.altitudeFt))
    .sort((a, b) => a.distanceNm - b.distanceNm)
    .forEach((point) => {
      const previous = deduped[deduped.length - 1]
      if (previous && Math.abs(previous.distanceNm - point.distanceNm) < 0.01) {
        deduped[deduped.length - 1] = point
      } else {
        deduped.push(point)
      }
    })

  return {
    label: '\uc808\ucc28 \uace0\ub3c4\uc81c\ud55c\uc120 \uc801\uc6a9',
    points: deduped.length >= 2 ? deduped : [
      { distanceNm: 0, altitudeFt: cruiseAltitudeFt, source: 'ENROUTE' },
      { distanceNm: totalDistanceNm, altitudeFt: cruiseAltitudeFt, source: 'ENROUTE' },
    ],
    tod,
    model: {
      climbGradientFtPerNm: DEFAULT_CLIMB_GRADIENT_FT_PER_NM,
      descentGradientFtPerNm: DEFAULT_DESCENT_GRADIENT_FT_PER_NM,
    },
  }
}

export function buildFlightPlanProfile(payload, axis, terrainResult) {
  const cruiseAltitudeFt = asNumber(payload?.plannedCruiseAltitudeFt)
  if (cruiseAltitudeFt == null || cruiseAltitudeFt <= 0) {
    throw new Error('plannedCruiseAltitudeFt must be a positive number')
  }

  const routeCoordinates = getRouteCoordinates(payload.routeGeometry)
  const profile = String(payload?.flightRule ?? '').toUpperCase() === 'VFR'
    ? buildVfrProfile(payload, axis, terrainResult, Math.round(cruiseAltitudeFt))
    : buildIfrProfile(payload, routeCoordinates, Math.round(cruiseAltitudeFt))

  return {
    unit: 'ft',
    plannedCruiseAltitudeFt: Math.round(cruiseAltitudeFt),
    profile,
  }
}

function defaultMarkerKind(index, markers) {
  return index === 0 || index === markers.length - 1 ? 'AIRPORT' : 'FIX'
}

export function buildProfileMarkers(payload) {
  const routeCoordinates = getRouteCoordinates(payload.routeGeometry)
  const markerInput = Array.isArray(payload.routeMarkers) && payload.routeMarkers.length > 0
    ? payload.routeMarkers
    : payload.vfrWaypoints ?? []

  return markerInput
    .map((marker, index) => {
      const coordinate = coordinateOf(marker)
      if (!coordinate) return null
      const label = String(marker.label ?? marker.id ?? '').trim()
      if (!label) return null
      return {
        label,
        distanceNm: distanceAlongRouteNm(routeCoordinates, coordinate),
        kind: marker.kind ?? defaultMarkerKind(index, markerInput),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceNm - b.distanceNm)
}

function buildNearestFixLookup(payload, routeCoordinates) {
  const procedures = ['SID', 'STAR', 'IAP'].map((type) => getProcedure(payload, type)).filter(Boolean)
  return procedures.flatMap((procedure) =>
    procedureDistancePoints(procedure, routeCoordinates).map((point) => ({
      label: point.fix.id,
      procedureId: procedure.id,
      procedureType: procedure.type,
      distanceNm: point.distanceNm,
    })),
  )
}

function nearestFixForDistance(lookup, distanceNm) {
  let best = null
  lookup.forEach((fix) => {
    const delta = Math.abs(fix.distanceNm - distanceNm)
    if (delta <= 0.5 && (!best || delta < best.delta)) {
      best = { ...fix, delta }
    }
  })
  return best?.label ?? null
}

export function annotateRouteAxis(axis, payload) {
  const flightRule = String(payload?.flightRule ?? '').toUpperCase()
  const routeCoordinates = getRouteCoordinates(payload.routeGeometry)
  const totalDistanceNm = axis.totalDistanceNm
  const nearestFixLookup = buildNearestFixLookup(payload, routeCoordinates)

  if (flightRule === 'VFR') {
    return {
      ...axis,
      samples: axis.samples.map((sample) => ({
        ...sample,
        segmentKind: 'VFR',
        legId: null,
        airwayId: null,
        procedureId: null,
        nearestFix: null,
      })),
    }
  }

  const { sid, star, iap, enrouteStartNm, enrouteEndNm, iapStartNm } = getIfrBoundaries(payload, routeCoordinates, totalDistanceNm)

  return {
    ...axis,
    samples: axis.samples.map((sample) => {
      let segmentKind = 'ENROUTE'
      let procedureId = null
      if (sid && sample.distanceNm <= enrouteStartNm + 0.01) {
        segmentKind = 'SID'
        procedureId = sid.id
      } else if (iap && sample.distanceNm >= iapStartNm - 0.01) {
        segmentKind = 'IAP'
        procedureId = iap.id
      } else if (star && sample.distanceNm >= enrouteEndNm - 0.01) {
        segmentKind = 'STAR'
        procedureId = star.id
      }

      return {
        ...sample,
        segmentKind,
        legId: null,
        airwayId: null,
        procedureId,
        nearestFix: nearestFixForDistance(nearestFixLookup, sample.distanceNm),
      }
    }),
  }
}
