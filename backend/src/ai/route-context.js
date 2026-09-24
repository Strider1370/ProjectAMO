import { z } from 'zod'
import { isAbsoluteIsoInstant } from './contracts.js'
import { buildCommonRouteModel } from '../../../shared/route-model.js'
import { distanceAlongRouteNm } from '../briefing/profile-composer.js'
import { distanceMeters } from '../briefing/route-axis.js'

const text = z.string().min(1).max(160)
const optionalText = text.nullable().optional()
const instant = z.string().max(40).refine(isAbsoluteIsoInstant)
const number = z.number().finite()
const nm = number.min(0).max(30_000)
const coordinate = z.tuple([number.min(-180).max(180), number.min(-90).max(90)])
const geometry = z.object({ type: z.literal('LineString'), coordinates: z.array(coordinate).min(2).max(2000) }).strict()
const range = z.object({ startNm: nm, endNm: nm }).strict()
const segment = z.object({
  id: text, kind: z.enum(['airway', 'dct']), routeId: optionalText,
  fromFix: optionalText, toFix: optionalText, routeType: optionalText, sourceCycle: optionalText,
  // Source metadata is not accepted as authoritative by the server.
  source: z.json().nullable().optional(),
  startNm: nm.nullable(), endNm: nm.nullable(), alignmentStatus: z.enum(['aligned', 'unavailable']),
}).strict()
const model = z.object({
  schemaVersion: z.literal(1), routeGeometry: geometry.optional(),
  routeAxis: z.object({ totalDistanceNm: nm, vertices: z.array(z.object({ coordinate, distanceNm: nm }).strict()).min(2).max(2000) }).strict(),
  enRouteSegments: z.array(segment).max(500),
  enRouteRange: z.object({ startNm: nm.nullable(), endNm: nm.nullable(), status: z.enum(['aligned', 'unavailable', 'not_applicable']) }).strict(),
  terminalRanges: z.object({ departure: range, arrival: range }).strict().nullable(),
  graphConnectionStatus: z.enum(['connected', 'manual', 'not_applicable', 'unavailable']),
}).strict()
const marker = z.object({
  id: text, label: text, kind: z.enum(['AIRPORT', 'FIX', 'WAYPOINT']),
  lon: number.min(-180).max(180), lat: number.min(-90).max(90),
  named: z.boolean().optional(), distanceNm: nm.optional(),
}).strict()
const fix = z.object({
  id: text, lon: number.min(-180).max(180), lat: number.min(-90).max(90),
  legDistanceNm: nm.nullable().optional(), altitude: z.json().nullable().optional(),
}).strict()
export const RouteContextInputSchema = z.object({
  schemaVersion: z.literal(1), revision: text, scope: z.literal('personal'),
  request: z.object({
    flightRule: z.enum(['IFR', 'VFR']), departureAirport: z.string().regex(/^[A-Z]{4}$/),
    arrivalAirport: z.string().regex(/^[A-Z]{4}$/), alternateAirport: z.string().regex(/^[A-Z]{4}$/).nullable().optional(),
    routeGeometry: geometry, routeModel: model, routeMarkers: z.array(marker).max(500),
    plannedCruiseAltitudeFt: number.int().min(500).max(60000), etd: instant, eta: instant,
    procedureContext: z.object({
      entryFix: optionalText, exitFix: optionalText,
      procedures: z.array(z.object({ id: text, type: z.enum(['SID', 'STAR', 'IAP']), fixes: z.array(fix).max(200) }).strict()).max(3),
    }).strict().nullable().optional(),
    nwpTimeSelection: z.object({
      baseTime: instant.nullable(),
      waypointOverrides: z.array(z.object({ waypointId: text, offsetHours: number.int().min(0).max(12) }).strict()).max(500),
    }).strict().nullable().optional(),
  }).strict(),
}).strict()

function fail(code) { throw Object.assign(new Error(code), { code, status: 400 }) }
const equalCoordinate = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
const near = (a, b) => Math.abs(a - b) <= 0.02

// A browser supplies applied route inputs, never weather, AIP limits or a ready
// assessment. Distances are checked and recomputed before entering the reference store.
export function normalizeRouteContext(input, { navdata = null, resolveProcedure = null } = {}) {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > 256 * 1024) fail('CONTEXT_TOO_LARGE')
  if (input?.scope === 'organization') fail('ORGANIZATION_CONTEXT_UNSUPPORTED')
  const parsed = RouteContextInputSchema.safeParse(input)
  if (!parsed.success) fail('INVALID_CONTEXT')
  const value = parsed.data
  const request = value.request
  const { routeGeometry, routeModel } = request
  const coords = routeGeometry.coordinates
  const canonical = buildCommonRouteModel({ routeGeometry }).routeAxis
  if (!canonical.totalDistanceNm || !near(canonical.totalDistanceNm, routeModel.routeAxis.totalDistanceNm)
    || (routeModel.routeGeometry && JSON.stringify(routeModel.routeGeometry) !== JSON.stringify(routeGeometry))
    || routeModel.routeAxis.vertices.length !== coords.length
    || canonical.vertices.some((vertex, i) => !equalCoordinate(vertex.coordinate, routeModel.routeAxis.vertices[i].coordinate)
      || !near(vertex.distanceNm, routeModel.routeAxis.vertices[i].distanceNm))) fail('ROUTE_MODEL_MISMATCH')
  const duration = Date.parse(request.eta) - Date.parse(request.etd)
  if (!(duration > 0 && duration <= 48 * 3600_000)) fail('INVALID_FLIGHT_WINDOW')
  request.etd = new Date(request.etd).toISOString()
  request.eta = new Date(request.eta).toISOString()

  const published = new Map((navdata?.segments ?? []).map((item) => [item.id, item]))
  let previousEnd = 0
  for (const item of routeModel.enRouteSegments) {
    item.source = null
    if (item.alignmentStatus !== 'aligned') {
      if (item.startNm !== null || item.endNm !== null) fail('SEGMENT_ALIGNMENT_MISMATCH')
      continue
    }
    let start = canonical.vertices.findIndex((v) => near(v.distanceNm, item.startNm))
    let end = canonical.vertices.findIndex((v, i) => i > start && near(v.distanceNm, item.endNm))
    if (item.startNm === null || item.endNm === null || start < 0 || end < 0
      || item.startNm < previousEnd - 0.02 || item.endNm <= item.startNm) fail('SEGMENT_ALIGNMENT_MISMATCH')
    if (item.kind === 'airway') {
      const source = published.get(item.id)
      if (!source) fail('NAVDATA_SEGMENT_UNAVAILABLE')
      const reverse = item.fromFix === source.toFix && item.toFix === source.fromFix
      if (item.routeId !== source.routeId || (!reverse && (item.fromFix !== source.fromFix || item.toFix !== source.toFix))) fail('NAVDATA_SEGMENT_MISMATCH')
      const a = reverse ? source.toCoordinates : source.fromCoordinates
      const b = reverse ? source.fromCoordinates : source.toCoordinates
      if (!a || !b) fail('NAVDATA_SEGMENT_MISMATCH')
      start = canonical.vertices.findIndex((v) => near(v.distanceNm, item.startNm) && equalCoordinate(v.coordinate, [a.lon, a.lat]))
      end = canonical.vertices.findIndex((v, i) => i > start && near(v.distanceNm, item.endNm) && equalCoordinate(v.coordinate, [b.lon, b.lat]))
      if (start < 0 || end < 0) fail('NAVDATA_SEGMENT_MISMATCH')
      const publishedPath = source.geometry?.coordinates ?? [[a.lon, a.lat], [b.lon, b.lat]]
      const directed = reverse && source.geometry ? [...publishedPath].reverse() : publishedPath
      const applied = coords.slice(start, end + 1)
      if (applied.length !== directed.length || applied.some((point, i) => !equalCoordinate(point, directed[i]))) fail('NAVDATA_SEGMENT_MISMATCH')
      item.sourceCycle = navdata.publicationId ?? null
    }
    item.startNm = canonical.vertices[start].distanceNm
    item.endNm = canonical.vertices[end].distanceNm
    previousEnd = item.endNm
  }
  const segments = routeModel.enRouteSegments
  const aligned = segments.length && segments.every((item) => item.alignmentStatus === 'aligned')
  const expectedRange = aligned
    ? { startNm: segments[0].startNm, endNm: segments.at(-1).endNm, status: 'aligned' }
    : { startNm: null, endNm: null, status: segments.length ? 'unavailable' : 'not_applicable' }
  if (JSON.stringify(expectedRange) !== JSON.stringify(routeModel.enRouteRange)) fail('ENROUTE_RANGE_MISMATCH')
  routeModel.routeAxis = canonical
  routeModel.routeGeometry = routeGeometry
  routeModel.terminalRanges = aligned ? {
    departure: { startNm: 0, endNm: expectedRange.startNm },
    arrival: { startNm: expectedRange.endNm, endNm: canonical.totalDistanceNm },
  } : null

  const ids = new Set()
  let lastDistance = -1
  for (const item of request.routeMarkers) {
    if (ids.has(item.id)) fail('DUPLICATE_MARKER_ID')
    ids.add(item.id)
    // Airport centres may differ from runway thresholds; ordinary fixes may not
    // be displaced from the applied path. Reuse the cross-section position rule.
    const point = [item.lon, item.lat]
    const minDistance = Math.min(...coords.slice(0, -1).map((a, i) => {
      const b = coords[i + 1], dx = b[0] - a[0], dy = b[1] - a[1]
      const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      return distanceMeters(point, [a[0] + ratio * dx, a[1] + ratio * dy]) / 1852
    }))
    if (minDistance > (item.kind === 'AIRPORT' ? 5 : 0.1)) fail('MARKER_OFF_ROUTE')
    const distance = distanceAlongRouteNm(coords, point)
    if (distance < lastDistance || (item.distanceNm !== undefined && !near(distance, item.distanceNm))) fail('MARKER_POSITION_MISMATCH')
    item.distanceNm = distance
    lastDistance = distance
  }
  const selection = request.nwpTimeSelection
  if (selection) {
    const overrides = new Set()
    if (selection.waypointOverrides.length && request.routeMarkers.length < 2) fail('NWP_MARKERS_REQUIRED')
    for (const item of selection.waypointOverrides) {
      if (!ids.has(item.waypointId) || overrides.has(item.waypointId)) fail('INVALID_NWP_MARKER_ID')
      overrides.add(item.waypointId)
    }
    if (selection.baseTime) selection.baseTime = new Date(selection.baseTime).toISOString()
  }
  const issues = []
  const procedureSources = []
  if (request.procedureContext?.procedures.length) {
    const types = new Set()
    for (const procedure of request.procedureContext.procedures) {
      if (types.has(procedure.type)) fail('DUPLICATE_PROCEDURE_TYPE')
      types.add(procedure.type)
      const trusted = resolveProcedure?.({ airport: procedure.type === 'SID' ? request.departureAirport : request.arrivalAirport,
        type: procedure.type, id: procedure.id })
      if (trusted) {
        if (trusted.fixes.length !== procedure.fixes.length || procedure.fixes.some((fix, i) =>
          fix.id !== trusted.fixes[i].id || !equalCoordinate([fix.lon, fix.lat], [trusted.fixes[i].lon, trusted.fixes[i].lat]))) fail('PROCEDURE_CATALOG_MISMATCH')
        procedure.fixes = structuredClone(trusted.fixes)
        procedureSources.push({ id: trusted.catalogId, publication: trusted.publication, representative: trusted.representative })
      } else {
        issues.push({ code: 'PROCEDURE_CONSTRAINTS_UNVERIFIED', procedure: procedure.id, reason: 'Server procedure catalog unavailable; client altitude constraints excluded' })
        for (const item of procedure.fixes) { item.altitude = null; item.legDistanceNm = null }
      }
    }
  }
  return { ...value, issues, procedureSources }
}
