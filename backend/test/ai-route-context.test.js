import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeRouteContext } from '../src/ai/route-context.js'
import { createLocalRuntime } from '../src/ai/local-runtime.js'
import { createWorkerExecutor } from '../src/ai/worker-executor.js'
import { createProcedureCatalog } from '../src/ai/procedure-catalog.js'
import { fileURLToPath } from 'node:url'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
const navdata = JSON.parse(fs.readFileSync(new URL('../../frontend/public/data/navdata/enroute.json', import.meta.url)))
const input = () => ({ schemaVersion: 1, revision: 'applied-1', scope: 'personal', request: structuredClone(fixture.request) })
const normalize = (value) => normalizeRouteContext(value, { navdata })

test('applied route is cloned, UTC normalized, positions recomputed and client constraints excluded', () => {
  const value = input()
  value.request.etd = '2026-09-21T02:00:00+09:00'
  const result = normalize(value)
  assert.equal(result.request.etd, new Date(fixture.request.etd).toISOString())
  assert.equal(result.request.routeModel.routeAxis.totalDistanceNm, 325.62)
  assert.equal(result.request.routeMarkers.length, 11)
  assert.ok(result.request.routeMarkers.every((m) => Number.isFinite(m.distanceNm)))
  assert.ok(result.issues.some((i) => i.code === 'PROCEDURE_CONSTRAINTS_UNVERIFIED'))
  assert.equal(result.request.procedureContext.procedures[0].fixes[1].altitude, null)
  assert.equal(value.request.procedureContext.procedures[0].fixes[1].altitude.minFt, 2000)
})

test('reject malformed, nonfinite, unbounded, unknown-version and organization contexts', () => {
  for (const mutate of [
    (v) => { v.request.routeGeometry.coordinates[0][0] = Infinity },
    (v) => { v.request.routeGeometry.coordinates[0][1] = 100 },
    (v) => { v.request.routeModel.schemaVersion = 2 },
    (v) => { v.request.weather = { safe: true } },
    (v) => { v.request.etd = '2026-09-20T17:00:00' },
    (v) => { v.request.eta = v.request.etd },
    (v) => { v.request.routeGeometry.coordinates = Array(2001).fill([127, 35]) },
    (v) => { v.scope = 'organization' },
  ]) { const v = input(); mutate(v); assert.throws(() => normalize(v)) }
})

test('reject forged distance, geometry, segment identity, range and marker positions', () => {
  for (const mutate of [
    (v) => { v.request.routeModel.routeAxis.totalDistanceNm = 1 },
    (v) => { v.request.routeModel.routeGeometry = { type: 'LineString', coordinates: [[126, 35], [127, 36]] } },
    (v) => { v.request.routeModel.enRouteSegments[0].id = 'A582-001' },
    (v) => { v.request.routeModel.enRouteSegments[0].startNm = 1 },
    (v) => { v.request.routeModel.enRouteRange.startNm = 1 },
    (v) => { v.request.routeMarkers[1].lon = 100 },
    (v) => { v.request.routeMarkers[1].distanceNm = 0 },
    (v) => { v.request.routeMarkers[1].id = v.request.routeMarkers[0].id },
    (v) => { v.request.routeMarkers.reverse() },
  ]) { const v = input(); mutate(v); assert.throws(() => normalize(v)) }
})

test('time overrides preserve IDs/UTC and reject missing or duplicate markers', () => {
  const v = input()
  v.request.nwpTimeSelection = { baseTime: '2026-09-21T03:00:00+09:00', waypointOverrides: [
    { waypointId: v.request.routeMarkers[1].id, offsetHours: 3 },
    { waypointId: v.request.routeMarkers[2].id, offsetHours: 6 },
  ] }
  const normalized = normalize(v)
  assert.equal(normalized.request.nwpTimeSelection.baseTime, '2026-09-20T18:00:00.000Z')
  assert.deepEqual(normalized.request.nwpTimeSelection.waypointOverrides, v.request.nwpTimeSelection.waypointOverrides)
  const duplicate = structuredClone(v)
  duplicate.request.nwpTimeSelection.waypointOverrides.push(duplicate.request.nwpTimeSelection.waypointOverrides[0])
  assert.throws(() => normalize(duplicate), { code: 'INVALID_NWP_MARKER_ID' })
  v.request.routeMarkers = []
  assert.throws(() => normalize(v), { code: 'NWP_MARKERS_REQUIRED' })
})

test('published airway validation fails closed when navdata is missing', () => {
  assert.throws(() => normalizeRouteContext(input()), { code: 'NAVDATA_SEGMENT_UNAVAILABLE' })
})

test('server catalog replaces client procedure limits and rejects mismatched fixes', () => {
  const resolveProcedure = createProcedureCatalog(fileURLToPath(new URL('../../frontend/public/data/navdata/procedures', import.meta.url)))
  const value = input()
  value.request.procedureContext.procedures[0].fixes[1].altitude.minFt = 59000
  const result = normalizeRouteContext(value, { navdata, resolveProcedure })
  assert.equal(result.request.procedureContext.procedures[0].fixes[1].altitude.minFt, 2000)
  assert.equal(result.procedureSources.length, 3)
  assert.equal(result.issues.length, 0)
  value.request.procedureContext.procedures[0].fixes[1].lon = 100
  assert.throws(() => normalizeRouteContext(value, { navdata, resolveProcedure }), { code: 'PROCEDURE_CATALOG_MISMATCH' })
})

test('live context uses current snapshots, retains revision and pins results across later changes', async () => {
  let time = Date.parse('2026-09-23T12:00:00Z'), reads = 0
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-ai-context-test', navdata, now: () => time,
    readSnapshot() { reads++; return { snapshot: null } } })
  const value = input()
  const registered = runtime.registerContext(value, 'alice')
  assert.equal(registered.status, 'ok')
  value.request.plannedCruiseAltitudeFt = 1000
  const args = { context_ref: registered.contextRef }
  assert.equal((await runtime.call('get_route_briefing', args, 'bob')).error.code, 'REFERENCE_NOT_FOUND')
  const briefing = await runtime.call('get_route_briefing', args, 'alice')
  assert.equal(briefing.status, 'partial')
  assert.equal(briefing.reference.clockMode, 'live')
  assert.equal(briefing.reference.contextRevision, 'applied-1')
  assert.equal(briefing.data.flight.plannedCruiseAltitudeFt, 31000)
  const count = reads
  time += 60_000
  const saved = runtime.getResult(briefing.reference.briefingRef, 'alice')
  assert.equal(saved.resultHash, briefing.reference.resultHash)
  assert.equal(saved.reference.briefingRef, briefing.reference.briefingRef)
  assert.equal(saved.reference.resultHash, briefing.reference.resultHash)
  assert.equal(saved.comparisonInputs, undefined)
  assert.equal(saved.reference.effectiveNow, '2026-09-23T12:00:00.000Z')
  assert.equal(reads, count)
  assert.equal(runtime.getResult(briefing.reference.briefingRef, 'bob').error.code, 'REFERENCE_NOT_FOUND')
  time += 15 * 60_000
  assert.equal(runtime.getResult(briefing.reference.briefingRef, 'alice').error.code, 'REFERENCE_EXPIRED')
})

test('trusted worker operations are distinct from model tools', async () => {
  const worker = createWorkerExecutor({ dataRoot: '/nonexistent-ai-context-test', navdata })
  try {
    assert.equal((await worker.call('registerContext', input(), 'alice')).error.code, 'UNKNOWN_TOOL')
    const registered = await worker.registerContext(input(), 'alice')
    assert.equal(registered.status, 'ok')
    const result = await worker.call('get_route_briefing', { context_ref: registered.contextRef }, 'alice')
    assert.equal(result.status, 'partial')
    assert.equal((await worker.getResult(result.reference.briefingRef, 'alice')).resultHash, result.reference.resultHash)
  } finally { await worker.close() }
})
