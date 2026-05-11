const NAVDATA_BASE_URL = '/data/navdata'
const FIR_EXIT_AIRPORT = 'FIR_EXIT'
const FIR_IN_AIRPORT = 'FIR_IN'

let navdataCache = null

async function fetchJson(path) {
  const response = await fetch(`${NAVDATA_BASE_URL}/${path}`)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }

  return response.json()
}

export async function loadNavdata() {
  if (!navdataCache) {
    const [airports, navpoints, routeGraph, routeSegments, routes, routeDirectionMetadata] = await Promise.all([
      fetchJson('airports.json'),
      fetchJson('navpoints.json'),
      fetchJson('route-graph.json'),
      fetchJson('route-segments.json'),
      fetchJson('routes.json'),
      fetchJson('route-direction-metadata.json'),
    ])

    navdataCache = {
      airports,
      navpoints,
      routeGraph,
      routeSegmentsById: Object.fromEntries(routeSegments.map((segment) => [segment.id, segment])),
      routes,
      routeDirectionMetadata,
    }
  }

  return navdataCache
}

function normalizeIdent(value) {
  return value.trim().toUpperCase()
}

function haversineNm(lon1, lat1, lon2, lat2) {
  const R = 3440.065
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(2))
}

function coordinatesOf(point) {
  return [point.coordinates.lon, point.coordinates.lat]
}

function getRouteType(segment) {
  return segment.routeType?.toUpperCase()
}

function isAllowedRouteType(segment, routeType) {
  return routeType === 'ALL' || getRouteType(segment) === routeType
}

export async function loadRouteDirectionMetadata() {
  const navdata = await loadNavdata()
  return navdata.routeDirectionMetadata
}

export async function loadNavpoints() {
  const navdata = await loadNavdata()
  return navdata.navpoints
}

function getRouteSequenceDirection(route, fromId, toId) {
  const sequence = route?.sequence

  if (!Array.isArray(sequence)) {
    return null
  }

  const fromIndex = sequence.indexOf(fromId)
  const toIndex = sequence.indexOf(toId)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return null
  }

  return toIndex > fromIndex ? 'sequence' : 'reverse'
}

function getSegmentAllowedDirection(routeMeta, fromId, toId) {
  const segmentRules = routeMeta?.segmentRules

  if (!Array.isArray(segmentRules) || segmentRules.length === 0) {
    return null
  }

  const matchingRule = segmentRules.find((rule) => {
    if (!rule?.from || !rule?.to) {
      return false
    }

    return (
      (rule.from === fromId && rule.to === toId) ||
      (rule.from === toId && rule.to === fromId)
    )
  })

  return matchingRule?.allowedDirection ?? null
}

function isAllowedRouteDirection(segment, routes, routeDirectionMetadata, fromId, toId) {
  const routeId = segment.routeId
  const route = routes?.[routeId]
  const routeMeta = routeDirectionMetadata?.routes?.[routeId]
  const allowedDirection = getSegmentAllowedDirection(routeMeta, fromId, toId) ?? routeMeta?.allowedDirection ?? 'both'

  if (allowedDirection === 'both' || allowedDirection === 'conditional') {
    return true
  }

  const actualDirection = getRouteSequenceDirection(route, fromId, toId)

  if (!actualDirection) {
    return true
  }

  return actualDirection === allowedDirection
}

function findShortestPath(routeGraph, routeSegmentsById, routes, routeDirectionMetadata, startId, endId, routeType) {
  const distances = new Map([[startId, 0]])
  const previous = new Map()
  const visited = new Set()
  const queue = [{ id: startId, distance: 0 }]

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance)
    const current = queue.shift()

    if (visited.has(current.id)) {
      continue
    }

    if (current.id === endId) {
      break
    }

    visited.add(current.id)

    for (const link of routeGraph[current.id] ?? []) {
      const segment = routeSegmentsById[link.segmentId]

      if (
        !segment ||
        !isAllowedRouteType(segment, routeType) ||
        !isAllowedRouteDirection(segment, routes, routeDirectionMetadata, current.id, link.to)
      ) {
        continue
      }

      const nextDistance = current.distance + link.distanceNm
      const currentBest = distances.get(link.to) ?? Number.POSITIVE_INFINITY

      if (nextDistance < currentBest) {
        distances.set(link.to, nextDistance)
        previous.set(link.to, {
          from: current.id,
          segmentId: link.segmentId,
        })
        queue.push({ id: link.to, distance: nextDistance })
      }
    }
  }

  if (!previous.has(endId) && startId !== endId) {
    return null
  }

  const segmentIds = []
  const navpointIds = [endId]
  let cursor = endId

  while (cursor !== startId) {
    const step = previous.get(cursor)

    if (!step) {
      return null
    }

    segmentIds.unshift(step.segmentId)
    navpointIds.unshift(step.from)
    cursor = step.from
  }

  return {
    distanceNm: Number((distances.get(endId) ?? 0).toFixed(2)),
    navpointIds,
    segmentIds,
  }
}

function buildPreviewGeometry(departurePoint, terminalPoint, navpoints, path, segments) {
  const departureCoords = coordinatesOf(departurePoint)
  const pathCoords = path.navpointIds.map((id) => coordinatesOf(navpoints[id]))
  const firstPathCoord = pathCoords[0]
  const hasDuplicateStart =
    firstPathCoord?.[0] === departureCoords[0] &&
    firstPathCoord?.[1] === departureCoords[1]
  const coordinates = hasDuplicateStart ? pathCoords : [departureCoords, ...pathCoords]

  if (terminalPoint) {
    const terminalCoords = coordinatesOf(terminalPoint)
    const lastCoord = coordinates[coordinates.length - 1]
    const isDuplicateTerminal = lastCoord?.[0] === terminalCoords[0] && lastCoord?.[1] === terminalCoords[1]

    if (!isDuplicateTerminal) {
      coordinates.push(terminalCoords)
    }
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { role: 'route-preview-line' },
        geometry: { type: 'LineString', coordinates },
      },
      ...coordinates.map((coordinate, index) => ({
        type: 'Feature',
        properties: { role: 'route-preview-point', sequence: index + 1 },
        geometry: { type: 'Point', coordinates: coordinate },
      })),
      ...segments.map((segment, index) => ({
        type: 'Feature',
        properties: { role: 'route-segment-line', routeId: segment.routeId },
        geometry: {
          type: 'LineString',
          coordinates: [
            coordinatesOf(navpoints[path.navpointIds[index]]),
            coordinatesOf(navpoints[path.navpointIds[index + 1]]),
          ],
        },
      })),
    ],
  }
}

function buildRouteDisplaySequence(departureLabel, terminalId, path, segments) {
  const sequence = departureLabel === path.navpointIds[0]
    ? [path.navpointIds[0]]
    : [departureLabel, path.navpointIds[0]]
  let currentRouteId = null

  segments.forEach((segment, index) => {
    if (segment.routeId !== currentRouteId) {
      sequence.push(segment.routeId)
      currentRouteId = segment.routeId
    }

    sequence.push(path.navpointIds[index + 1])
  })

  if (sequence[sequence.length - 1] !== terminalId) {
    sequence.push(terminalId)
  }

  return sequence
}

export async function buildVfrRoute({ departureAirport, arrivalAirport }) {
  const navdata = await loadNavdata()
  const departureId = normalizeIdent(departureAirport)
  const arrivalId = normalizeIdent(arrivalAirport)

  const departure = navdata.airports[departureId]
  const arrival = navdata.airports[arrivalId]

  if (!departure) throw new Error(`${departureId} airport not found`)
  if (!arrival) throw new Error(`${arrivalId} airport not found`)

  const depCoords = coordinatesOf(departure)
  const arrCoords = coordinatesOf(arrival)

  return {
    flightRule: 'VFR',
    departureAirport: departureId,
    arrivalAirport: arrivalId,
    distanceNm: haversineNm(...depCoords, ...arrCoords),
    previewGeojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [depCoords, arrCoords] } },
        { type: 'Feature', properties: { role: 'route-preview-point', sequence: 1 }, geometry: { type: 'Point', coordinates: depCoords } },
        { type: 'Feature', properties: { role: 'route-preview-point', sequence: 2 }, geometry: { type: 'Point', coordinates: arrCoords } },
      ],
    },
  }
}

export async function buildBriefingRoute({ departureAirport, entryFix, exitFix, arrivalAirport, routeType }) {
  const navdata = await loadNavdata()
  const departureId = normalizeIdent(departureAirport)
  const arrivalId = normalizeIdent(arrivalAirport)
  const entryId = normalizeIdent(entryFix)
  const exitId = normalizeIdent(exitFix)
  const selectedRouteType = routeType ?? 'ALL'
  const isFirExitRoute = arrivalId === FIR_EXIT_AIRPORT
  const isFirInRoute = departureId === FIR_IN_AIRPORT

  const departure = isFirInRoute ? null : navdata.airports[departureId]
  const arrival = isFirExitRoute ? null : navdata.airports[arrivalId]
  const entry = navdata.navpoints[entryId]
  const exit = navdata.navpoints[exitId]

  if (!isFirInRoute && !departure) {
    throw new Error(`${departureId} airport not found`)
  }

  if (!isFirExitRoute && !arrival) {
    throw new Error(`${arrivalId} airport not found`)
  }

  if (!entry) {
    throw new Error(`${entryId} navpoint not found`)
  }

  if (!exit) {
    throw new Error(`${exitId} navpoint not found`)
  }

  const path = findShortestPath(
    navdata.routeGraph,
    navdata.routeSegmentsById,
    navdata.routes,
    navdata.routeDirectionMetadata,
    entryId,
    exitId,
    selectedRouteType,
  )

  if (!path) {
    throw new Error(`No ${selectedRouteType} route path found from ${entryId} to ${exitId}`)
  }

  const segments = path.segmentIds.map((id) => navdata.routeSegmentsById[id])
  const routeIds = [...new Set(segments.map((segment) => segment.routeId))]
  const routeTypes = [...new Set(segments.map((segment) => segment.routeType))]
  const terminalPoint = isFirExitRoute ? exit : arrival
  const terminalId = isFirExitRoute ? exitId : arrivalId
  const departurePoint = isFirInRoute ? entry : departure
  const departureLabel = isFirInRoute ? entryId : departureId

  return {
    flightRule: 'IFR',
    departureAirport: departureLabel,
    arrivalAirport: terminalId,
    entryFix: entryId,
    exitFix: exitId,
    routeType: selectedRouteType,
    distanceNm: path.distanceNm,
    navpointIds: path.navpointIds,
    routeIds,
    routeTypes,
    segments,
    displaySequence: buildRouteDisplaySequence(departureLabel, terminalId, path, segments),
    previewGeojson: buildPreviewGeometry(departurePoint, terminalPoint, navdata.navpoints, path, segments),
  }
}

export async function canBuildBriefingRoutePath({ entryFix, exitFix, routeType }) {
  const navdata = await loadNavdata()
  const entryId = normalizeIdent(entryFix)
  const exitId = normalizeIdent(exitFix)
  const selectedRouteType = routeType ?? 'ALL'

  if (!entryId || !exitId) {
    return false
  }

  if (!navdata.navpoints[entryId] || !navdata.navpoints[exitId]) {
    return false
  }

  return !!findShortestPath(
    navdata.routeGraph,
    navdata.routeSegmentsById,
    navdata.routes,
    navdata.routeDirectionMetadata,
    entryId,
    exitId,
    selectedRouteType,
  )
}

const iapDataCache = {}

export async function loadIapData(icao) {
  if (!icao) return null
  const key = icao.toUpperCase()
  if (!iapDataCache[key]) {
    try {
      iapDataCache[key] = await fetchJson(`procedures/${key.toLowerCase()}-representative-iap-routes.json`)
    } catch (e) {
      console.warn(`Failed to load IAP data for ${key}`, e)
      return null
    }
  }
  return iapDataCache[key]
}
