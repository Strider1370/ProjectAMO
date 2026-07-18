const NAVDATA_BASE_URL = '/data/navdata'
const FIR_EXIT_AIRPORT = 'FIR_EXIT'
const FIR_IN_AIRPORT = 'FIR_IN'
import { parseManualRouteString } from './manualRouteInput.js'

let navdataCache = null

async function fetchJson(path) {
  const response = await fetch(`${NAVDATA_BASE_URL}/${path}`)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }

  return response.json()
}

// 해외 navdata는 선택적 — 파일 없으면 null 반환(국내만으로 정상 동작).
async function fetchJsonOptional(path) {
  try {
    const response = await fetch(`${NAVDATA_BASE_URL}/${path}`)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

// 해외 항로그래프를 국내에 병합: 노드별 인접 리스트를 이어붙여 국경 공유 지점이 국내↔해외를 연결.
// 세그먼트 id는 해외가 OVS- 접두어라 (to, segmentId) 중복만 제거하면 됨.
function mergeRouteGraph(base, overseas) {
  const merged = { ...base }
  for (const [nodeId, links] of Object.entries(overseas || {})) {
    const list = merged[nodeId] ? [...merged[nodeId]] : []
    const seen = new Set(list.map((link) => `${link.to}|${link.segmentId}`))
    for (const link of links) {
      const key = `${link.to}|${link.segmentId}`
      if (!seen.has(key)) {
        list.push(link)
        seen.add(key)
      }
    }
    merged[nodeId] = list
  }
  return merged
}

function buildRouteGraph(segments) {
  const graph = {}
  for (const segment of segments) {
    for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
      ;(graph[from] ??= []).push({
        to,
        routeId: segment.routeId,
        routeType: segment.routeType,
        segmentId: segment.id,
        distanceNm: segment.distanceNm,
      })
    }
  }
  return graph
}

export async function loadNavdata() {
  if (!navdataCache) {
    const [airports, enroute] = await Promise.all([
      fetchJson('airports.json'),
      fetchJson('enroute.json'),
    ])

    // 해외(선택) — 해외 확장 데이터가 있으면 국내와 병합.
    const [airportsO, navpointsO, routeGraphO, routeSegmentsO, routesO] = await Promise.all([
      fetchJsonOptional('airports-overseas.json'),
      fetchJsonOptional('navpoints-overseas.json'),
      fetchJsonOptional('route-graph-overseas.json'),
      fetchJsonOptional('route-segments-overseas.json'),
      fetchJsonOptional('routes-overseas.json'),
    ])

    const allSegments = [...enroute.segments, ...(routeSegmentsO || [])]

    navdataCache = {
      // 공항: 겹침 없음(국내 RK / 해외 그 외)
      airports: { ...airports, ...(airportsO || {}) },
      // 지점·항로: 공유 ident/routeId는 국내 정의 우선(방향 메타데이터 보존)
      navpoints: { ...(navpointsO || {}), ...enroute.points },
      routeGraph: mergeRouteGraph(buildRouteGraph(enroute.segments), routeGraphO),
      routeSegmentsById: Object.fromEntries(allSegments.map((segment) => [segment.id, segment])),
      routes: { ...(routesO || {}), ...enroute.routes },
      routeDirectionMetadata: { routes: enroute.routes },
    }
  }

  return navdataCache
}

function normalizeIdent(value) {
  return (value ?? '').trim().toUpperCase() // 픽스 미입력 등 undefined 방어 — 크래시 대신 빈 ident(→ 하류 "not found" 처리)
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

// ponytail: load overseas airports + links map; returns {} if file missing or network error.
// Used by RouteBriefingPanel to populate arrival airport options.
let overseasAirportsCache = null
export async function loadOverseasAirports() {
  if (overseasAirportsCache !== null) return overseasAirportsCache

  try {
    const response = await fetch(`${NAVDATA_BASE_URL}/airports-overseas.json`)
    if (!response.ok) return {}
    overseasAirportsCache = await response.json()
    return overseasAirportsCache
  } catch {
    overseasAirportsCache = {}
    return {}
  }
}

// Load airport-route-links-overseas.json: { ICAO: { nearestFix, nearbyFixes }, ... }
let overseasLinksCache = null
export async function loadOverseasLinks() {
  if (overseasLinksCache !== null) return overseasLinksCache

  try {
    const response = await fetch(`${NAVDATA_BASE_URL}/airport-route-links-overseas.json`)
    if (!response.ok) return {}
    overseasLinksCache = await response.json()
    return overseasLinksCache
  } catch {
    overseasLinksCache = {}
    return {}
  }
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

function findShortestPath(routeGraph, routeSegmentsById, routes, routeDirectionMetadata, startId, endId, routeType, blockedSegmentIds = new Set(), routeId = null) {
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
        blockedSegmentIds.has(link.segmentId) ||
        (routeId && link.routeId !== routeId) ||
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

function buildPreviewGeometry(departurePoint, terminalPoint, navpoints, path, segments, departureLabel, terminalLabel) {
  const departureCoords = coordinatesOf(departurePoint)
  const pathCoords = path.navpointIds.map((id) => coordinatesOf(navpoints[id]))
  const firstPathCoord = pathCoords[0]
  const hasDuplicateStart =
    firstPathCoord?.[0] === departureCoords[0] &&
    firstPathCoord?.[1] === departureCoords[1]
  const coordinates = hasDuplicateStart ? pathCoords : [departureCoords, ...pathCoords]
  const labels = hasDuplicateStart ? [...path.navpointIds] : [departureLabel, ...path.navpointIds]

  if (terminalPoint) {
    const terminalCoords = coordinatesOf(terminalPoint)
    const lastCoord = coordinates[coordinates.length - 1]
    const isDuplicateTerminal = lastCoord?.[0] === terminalCoords[0] && lastCoord?.[1] === terminalCoords[1]

    if (!isDuplicateTerminal) {
      coordinates.push(terminalCoords)
      labels.push(terminalLabel)
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
        properties: { role: 'route-preview-point', label: labels[index] ?? '', sequence: index + 1 },
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

export async function buildBriefingRoute({ departureAirport, entryFix, exitFix, arrivalAirport, routeType, viaFixes = [] }) {
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

  const stops = [entryId, ...viaFixes.map(normalizeIdent).filter(Boolean), exitId]
  const path = { distanceNm: 0, navpointIds: [], segmentIds: [] }
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index]
    const to = stops[index + 1]
    if (!navdata.navpoints[from] || !navdata.navpoints[to]) {
      throw new Error(`${!navdata.navpoints[from] ? from : to} navpoint not found`)
    }
    const leg = findShortestPath(navdata.routeGraph, navdata.routeSegmentsById, navdata.routes, navdata.routeDirectionMetadata, from, to, selectedRouteType)
    if (!leg) throw new Error(`No ${selectedRouteType} route path found from ${from} to ${to}`)
    path.distanceNm += leg.distanceNm
    path.navpointIds.push(...(index ? leg.navpointIds.slice(1) : leg.navpointIds))
    path.segmentIds.push(...leg.segmentIds)
  }
  path.distanceNm = Number(path.distanceNm.toFixed(2))

  return buildIfrRouteResult({
    navdata,
    departureAirport: departureId,
    entryFix: entryId,
    exitFix: exitId,
    arrivalAirport: arrivalId,
    routeType: selectedRouteType,
    path,
  })
}

function manualPoint(navdata, term, index, userWaypoints) {
  if (term.kind === 'coordinate') {
    return { id: `coordinate-${index}`, label: `WP${index + 1}`, kind: 'user-waypoint', coordinates: [term.coordinate.lon, term.coordinate.lat], editable: true }
  }
  if (term.kind === 'user-waypoint') {
    const waypoint = userWaypoints.find((item) => item.id === term.id)
    if (!waypoint || !Number.isFinite(waypoint.lon) || !Number.isFinite(waypoint.lat)) throw new Error('사용자 waypoint 좌표를 확인하세요.')
    return { id: waypoint.id, label: waypoint.name, kind: 'user-waypoint', coordinates: [waypoint.lon, waypoint.lat], editable: true }
  }
  const navpoint = navdata.navpoints[term.id]
  if (!navpoint) throw new Error(`${term.id} FIX를 찾을 수 없습니다.`)
  return { id: term.id, label: term.id, kind: 'published-fix', coordinates: coordinatesOf(navpoint), editable: true }
}

function manualPreviewGeojson(points, legs, departure, arrival) {
  const enrouteCoordinates = legs.length > 0
    ? legs.flatMap((leg, index) => index === 0 ? leg.geometry : leg.geometry.slice(1))
    : points.map((point) => point.coordinates)
  const routeCoordinates = [coordinatesOf(departure), ...enrouteCoordinates, coordinatesOf(arrival)]
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: routeCoordinates } },
      ...points.map((point, index) => ({ type: 'Feature', properties: { role: 'route-preview-point', pointId: point.id, label: point.label, editable: point.editable ? 1 : 0, sequence: index + 1 }, geometry: { type: 'Point', coordinates: point.coordinates } })),
      ...legs.map((leg) => ({ type: 'Feature', properties: { role: 'route-segment-line', id: leg.id, routeId: leg.routeId, kind: leg.kind }, geometry: { type: 'LineString', coordinates: leg.geometry } })),
    ],
  }
}

function findUniqueAirwayPath(navdata, fromId, toId, routeType) {
  const candidates = Object.keys(navdata.routes)
    .filter((routeId) => {
      const sequence = navdata.routes[routeId]?.sequence ?? []
      return sequence.includes(fromId) && sequence.includes(toId)
    })
    .map((routeId) => findShortestPath(navdata.routeGraph, navdata.routeSegmentsById, navdata.routes, navdata.routeDirectionMetadata, fromId, toId, routeType, new Set(), routeId))
    .filter(Boolean)
  return candidates.length === 1 ? candidates[0] : null
}

function routeLegIntents(parsed) {
  if (Array.isArray(parsed?.legIntents)) return parsed.legIntents
  return (parsed?.connectors ?? []).map((connector) => connector === 'DCT'
    ? { kind: 'dct' }
    : { kind: 'airway', routeId: connector })
}

function resolvedPublishedPoint(navdata, id) {
  const navpoint = navdata.navpoints[id]
  return { id, label: id, kind: 'published-fix', coordinates: coordinatesOf(navpoint), editable: true }
}

export async function buildManualIfrRoute({ departureAirport, arrivalAirport, enroute, userWaypoints = [], routeType = 'ALL' }) {
  const navdata = await loadNavdata()
  const departureId = normalizeIdent(departureAirport)
  const arrivalId = normalizeIdent(arrivalAirport)
  const departure = navdata.airports[departureId]
  const arrival = navdata.airports[arrivalId]
  if (!departure || !arrival) throw new Error('출발·도착 공항을 확인하세요.')
  const parsed = typeof enroute === 'string' ? parseManualRouteString(enroute) : enroute
  const terms = parsed?.terms ?? []
  const intents = routeLegIntents(parsed)
  if (terms.length < 1 || intents.length !== terms.length - 1) throw new Error('en-route 문자열을 확인하세요.')
  const inputPoints = terms.map((term, index) => manualPoint(navdata, term, index, userWaypoints))
  const points = [inputPoints[0]]
  const resolvedTerms = [terms[0]]
  const resolvedLegIntents = []
  const legs = []
  for (let index = 0; index < intents.length; index += 1) {
    const from = inputPoints[index]
    const to = inputPoints[index + 1]
    const intent = intents[index]
    const path = intent.kind !== 'dct' && from.kind === 'published-fix' && to.kind === 'published-fix'
      ? intent.kind === 'airway'
        ? findShortestPath(navdata.routeGraph, navdata.routeSegmentsById, navdata.routes, navdata.routeDirectionMetadata, from.id, to.id, routeType, new Set(), intent.routeId)
        : findUniqueAirwayPath(navdata, from.id, to.id, routeType)
      : null
    if (intent.kind === 'airway' && !path) throw new Error(`${intent.routeId} 항공로가 ${from.id}와 ${to.id}를 연결하지 않습니다.`)
    if (path) {
      for (let segmentIndex = 0; segmentIndex < path.segmentIds.length; segmentIndex += 1) {
        const segment = navdata.routeSegmentsById[path.segmentIds[segmentIndex]]
        const fromFix = path.navpointIds[segmentIndex]
        const toFix = path.navpointIds[segmentIndex + 1]
        legs.push({ id: segment.id, kind: 'airway', routeId: segment.routeId, routeType: segment.routeType, fromFix, toFix, geometry: [coordinatesOf(navdata.navpoints[fromFix]), coordinatesOf(navdata.navpoints[toFix])], distanceNm: segment.distanceNm })
        points.push(resolvedPublishedPoint(navdata, toFix))
        resolvedTerms.push({ kind: 'fix', id: toFix })
        resolvedLegIntents.push({ kind: 'airway', routeId: segment.routeId })
      }
      continue
    }
    const previous = points.at(-1)
    legs.push({ id: `dct:${previous.id}:${to.id}`, kind: 'dct', routeId: null, routeType: null, fromFix: previous.id, toFix: to.id, geometry: [previous.coordinates, to.coordinates], distanceNm: haversineNm(...previous.coordinates, ...to.coordinates) })
    points.push(to)
    resolvedTerms.push(terms[index + 1])
    resolvedLegIntents.push({ kind: 'dct' })
  }
  const enrouteDistanceNm = Number(legs.reduce((sum, leg) => sum + leg.distanceNm, 0).toFixed(2))
  const totalDistanceNm = Number((enrouteDistanceNm + haversineNm(...coordinatesOf(departure), ...points[0].coordinates) + haversineNm(...points.at(-1).coordinates, ...coordinatesOf(arrival))).toFixed(2))
  const previewGeojson = manualPreviewGeojson(points, legs, departure, arrival)
  return {
    flightRule: 'IFR', departureAirport: departureId, arrivalAirport: arrivalId, routeType,
    distanceNm: enrouteDistanceNm, totalDistanceNm,
    navpointIds: points.map((point) => point.label), segments: legs.filter((leg) => leg.kind === 'airway'),
    manualLegs: legs, manualRoute: { points, legs, enrouteGeometry: { type: 'LineString', coordinates: points.map((point) => point.coordinates) } },
    resolvedEnroute: { terms: resolvedTerms, legIntents: resolvedLegIntents, userWaypoints, nextWaypointNumber: parsed?.nextWaypointNumber },
    displaySequence: [departureId, ...points.map((point) => point.label), arrivalId], previewGeojson,
  }
}

export async function buildManualVfrRoute({ departureAirport, arrivalAirport, enroute, userWaypoints = [] }) {
  const navdata = await loadNavdata()
  const departureId = normalizeIdent(departureAirport)
  const arrivalId = normalizeIdent(arrivalAirport)
  const departure = navdata.airports[departureId]
  const arrival = navdata.airports[arrivalId]
  if (!departure || !arrival) throw new Error('출발·도착 공항을 확인하세요.')
  const parsed = typeof enroute === 'string' ? parseManualRouteString(enroute, { flightRule: 'VFR', userWaypoints }) : enroute
  if ((parsed?.connectors ?? []).some((connector) => connector !== 'DCT')) throw new Error('VFR 문자열에는 항공로를 사용할 수 없습니다.')
  const points = (parsed?.terms ?? []).map((term, index) => manualPoint(navdata, term, index, userWaypoints))
  if (points.length < 1) throw new Error('en-route 문자열을 확인하세요.')
  const legs = points.slice(0, -1).map((point, index) => ({
    id: `dct:${point.id}:${points[index + 1].id}`, kind: 'dct', routeId: null, routeType: null,
    fromFix: point.id, toFix: points[index + 1].id, geometry: [point.coordinates, points[index + 1].coordinates], distanceNm: haversineNm(...point.coordinates, ...points[index + 1].coordinates),
  }))
  const enrouteDistanceNm = Number(legs.reduce((sum, leg) => sum + leg.distanceNm, 0).toFixed(2))
  const totalDistanceNm = Number((enrouteDistanceNm + haversineNm(...coordinatesOf(departure), ...points[0].coordinates) + haversineNm(...points.at(-1).coordinates, ...coordinatesOf(arrival))).toFixed(2))
  const previewGeojson = manualPreviewGeojson(points, legs, departure, arrival)
  return { flightRule: 'VFR', departureAirport: departureId, arrivalAirport: arrivalId, distanceNm: totalDistanceNm, totalDistanceNm, navpointIds: points.map((point) => point.label), segments: [], manualLegs: legs, manualRoute: { points, legs, enrouteGeometry: { type: 'LineString', coordinates: points.map((point) => point.coordinates) } }, displaySequence: [departureId, ...points.map((point) => point.label), arrivalId], previewGeojson }
}

// ponytail: O(n) navpoint scan; replace with a spatial index if map-click latency becomes measurable.
export async function resolveNearestNavpoint(coordinates) {
  const [lon, lat] = coordinates ?? []
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('지도 좌표를 확인할 수 없습니다.')
  const navdata = await loadNavdata()
  let nearest = null
  for (const [id, point] of Object.entries(navdata.navpoints)) {
    const distanceNm = haversineNm(lon, lat, ...coordinatesOf(point))
    if (!nearest || distanceNm < nearest.distanceNm) nearest = { id, distanceNm }
  }
  if (!nearest || nearest.distanceNm > 5) throw new Error('5 NM 이내의 항로 FIX를 찾을 수 없습니다.')
  return nearest
}

export async function resolveMapInteraction({ coordinates, departureAirport, entryFix, exitFix, arrivalAirport, routeType, viaFixes = [] }) {
  const nearest = await resolveNearestNavpoint(coordinates)
  const nextViaFixes = [...viaFixes, nearest.id]
  const routeResult = await buildBriefingRoute({ departureAirport, entryFix, exitFix, arrivalAirport, routeType, viaFixes: nextViaFixes })
  return { fixId: nearest.id, routeResult, viaFixes: nextViaFixes }
}

export async function parseRouteString(text, { departureAirport, entryFix, exitFix, arrivalAirport, routeType }) {
  const tokens = String(text ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length % 2 === 0) throw new Error('FIX와 항로 토큰의 순서를 확인하세요.')
  const fixes = tokens.filter((_, index) => index % 2 === 0)
  const connectors = tokens.filter((_, index) => index % 2 === 1)
  const compactFixes = fixes.filter((fix, index) => index === 0 || fix !== fixes[index - 1])
  if (compactFixes[0] !== normalizeIdent(entryFix) || compactFixes.at(-1) !== normalizeIdent(exitFix)) {
    throw new Error('호환 경로 문자열은 현재 진입 FIX와 이탈 FIX로 시작하고 끝나야 합니다.')
  }
  const navdata = await loadNavdata()
  for (const fix of compactFixes) if (!navdata.navpoints[fix]) throw new Error(`${fix} FIX를 찾을 수 없습니다.`)
  for (let index = 0; index < connectors.length; index += 1) {
    const connector = connectors[index]
    if (connector === 'DCT') continue
    const from = fixes[index]
    const to = fixes[index + 1]
    const allowed = Object.values(navdata.routeSegmentsById).some((segment) => segment.routeId === connector && (
      (segment.from === from && segment.to === to) || (segment.from === to && segment.to === from)
    ))
    if (!allowed) throw new Error(`${connector} 항로가 ${from}와 ${to}를 직접 연결하지 않습니다.`)
  }
  const viaFixes = compactFixes.slice(1, -1)
  const routeResult = await buildBriefingRoute({ departureAirport, entryFix, exitFix, arrivalAirport, routeType, viaFixes })
  return { viaFixes, routeResult, normalized: compactFixes.length !== fixes.length }
}

export function formatRouteString(routeResult) {
  const fixes = routeResult?.navpointIds ?? []
  const segments = routeResult?.segments ?? []
  if (fixes.length === 0) return ''
  const tokens = [fixes[0]]
  for (let index = 0; index < segments.length; index += 1) {
    tokens.push(segments[index]?.routeId || 'DCT', fixes[index + 1])
  }
  return tokens.join(' ')
}

function buildIfrRouteResult({ navdata, departureAirport, entryFix, exitFix, arrivalAirport, routeType, path }) {
  const isFirExitRoute = arrivalAirport === FIR_EXIT_AIRPORT
  const isFirInRoute = departureAirport === FIR_IN_AIRPORT
  const departure = isFirInRoute ? null : navdata.airports[departureAirport]
  const arrival = isFirExitRoute ? null : navdata.airports[arrivalAirport]
  const segments = path.segmentIds.map((id) => navdata.routeSegmentsById[id])
  const terminalPoint = isFirExitRoute ? navdata.navpoints[exitFix] : arrival
  const departurePoint = isFirInRoute ? navdata.navpoints[entryFix] : departure
  const terminalId = isFirExitRoute ? exitFix : arrivalAirport
  const departureLabel = isFirInRoute ? entryFix : departureAirport

  const routeIds = [...new Set(segments.map((segment) => segment.routeId))]
  const routeTypes = [...new Set(segments.map((segment) => segment.routeType))]

  // 총거리 = 출발지→진입지점(SID 구간) + 항로 구간 + 이탈지점→도착지(STAR 구간, 직선 근사).
  // SID 최적 선택은 항로 구간만 보면 엉뚱한 방향(예: 서쪽 진입지점)을 고를 수 있어 총거리로 순위.
  const firstNp = navdata.navpoints[path.navpointIds[0]]
  const lastNp = navdata.navpoints[path.navpointIds[path.navpointIds.length - 1]]
  const legDep = departurePoint && firstNp ? haversineNm(...coordinatesOf(departurePoint), ...coordinatesOf(firstNp)) : 0
  const legArr = terminalPoint && lastNp ? haversineNm(...coordinatesOf(lastNp), ...coordinatesOf(terminalPoint)) : 0
  const totalDistanceNm = Number((legDep + path.distanceNm + legArr).toFixed(2))

  return {
    flightRule: 'IFR',
    departureAirport: departureLabel,
    arrivalAirport: terminalId,
    entryFix,
    exitFix,
    routeType,
    distanceNm: path.distanceNm,
    totalDistanceNm,
    navpointIds: path.navpointIds,
    routeIds,
    routeTypes,
    segments,
    displaySequence: buildRouteDisplaySequence(departureLabel, terminalId, path, segments),
    previewGeojson: buildPreviewGeometry(departurePoint, terminalPoint, navdata.navpoints, path, segments, departureLabel, terminalId),
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
