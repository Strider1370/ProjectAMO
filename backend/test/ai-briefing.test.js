import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { composeBriefing } from '../src/briefing/briefing-composer.js'
import { executeBriefing, BRIEFING_DATASETS } from '../src/briefing/briefing-service.js'
import { createReferenceStore } from '../src/ai/reference-store.js'
import { getRouteBriefing } from '../src/ai/tools/get-route-briefing.js'
import { getBriefingDetail } from '../src/ai/tools/get-briefing-detail.js'
import { BriefingOutputSchema } from '../src/ai/briefing-contracts.js'
import { createLocalRuntime } from '../src/ai/local-runtime.js'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
const now = () => Date.parse(fixture.effectiveNow)
const request = fixture.request
const data = { now: now(), enrouteCrossSection: { available: false }, airspaceZones: [] }
const ctx = (overrides = {}) => ({
  owner: 'alice', references: createReferenceStore({ now }), realNow: now, displayTimezone: 'Asia/Seoul',
  fixtures: new Map([[fixture.id, fixture]]),
  execute: () => ({ briefing: composeBriefing(request, data), data }), ...overrides,
})

test('shared service preserves composer output and reads each dataset once', () => {
  const reads = []
  const result = executeBriefing(request, {
    readCached: (kind) => { reads.push(kind); return null }, weatherNow: now,
    enrouteCrossSection: { available: false },
  })
  assert.deepEqual(reads, Object.values(BRIEFING_DATASETS))
  assert.deepEqual(result.briefing, composeBriefing(request, result.data))
  for (const [body, message] of [
    [{}, 'departureAirport, arrivalAirport, routeGeometry are required'],
    [{ ...request, etd: null }, 'etd and eta are required'],
    [{ ...request, eta: 'bad' }, 'etd and eta must be valid ISO timestamps'],
    [{ ...request, eta: request.etd }, 'eta must be later than etd'],
  ]) assert.throws(() => executeBriefing(body, { readCached() { throw new Error('must not read') } }), { message, status: 400 })
})

test('reference store isolates ownership, clones data and expires on the real clock', () => {
  let time = 0
  const store = createReferenceStore({ now: () => time, ttlMs: 100, maxEntries: 2, maxBytes: 200 })
  const value = { item: 1 }
  const ref = store.put('alice', 'briefing', value)
  value.item = 9
  assert.equal(store.get('alice', 'briefing', ref.id).value.item, 1)
  store.get('alice', 'briefing', ref.id).value.item = 8
  assert.equal(store.get('alice', 'briefing', ref.id).value.item, 1)
  assert.throws(() => store.get('bob', 'briefing', ref.id), { code: 'REFERENCE_NOT_FOUND' })
  assert.throws(() => store.get('alice', 'context', ref.id), { code: 'REFERENCE_NOT_FOUND' })
  time = 100
  assert.throws(() => store.get('alice', 'briefing', ref.id), { code: 'REFERENCE_EXPIRED' })
  assert.equal(store.stats().bytes, 0)
  assert.throws(() => store.put('alice', 'briefing', { big: 'x'.repeat(201) }), { code: 'RESULT_TOO_LARGE' })
  const evicted = store.put('alice', 'briefing', {})
  store.put('alice', 'briefing', {})
  store.put('bob', 'briefing', {})
  assert.equal(store.stats().entries, 2)
  assert.throws(() => store.get('alice', 'briefing', evicted.id), { code: 'REFERENCE_NOT_FOUND' })
  store.clearOwner('alice')
  assert.equal(store.stats().entries, 1)
})

test('route and detail preserve result hash, effective time, source IDs and do not reread', async () => {
  let calls = 0
  const hazard = { id: 'test-sigmet', phenomenon_code: 'SEV_TURB',
    geometry: { type: 'Polygon', coordinates: [[[125, 33], [128, 33], [128, 38], [125, 38], [125, 33]]] },
    valid_from: request.etd, valid_to: request.eta, altitude: { lower_fl: 200, upper_fl: 400 } }
  const fixed = { ...data, sigmet: { items: [hazard] } }
  const context = ctx({ execute() { calls++; return { briefing: composeBriefing(request, fixed), data: fixed } } })
  const result = await getRouteBriefing({ fixture_id: fixture.id }, context)
  assert.equal(result.status, 'partial')
  assert.equal(BriefingOutputSchema.safeParse(result).success, true)
  assert.equal(result.data.flight.departureAirport, 'RKSS')
  assert.equal(result.data.flight.distanceNm, 325.62)
  assert.equal(result.data.hazards.items[0].sourceId, hazard.id)
  const detail = getBriefingDetail({ briefing_ref: result.reference.briefingRef, section: 'hazards' }, context)
  assert.equal(detail.reference.resultHash, result.reference.resultHash)
  assert.equal(detail.reference.effectiveNow, fixture.effectiveNow)
  assert.equal(detail.data.items[0].sourceId, hazard.id)
  assert.equal(detail.data.items[0].timeStatus, result.data.hazards.items[0].timeStatus)
  assert.equal(calls, 1)
  const denied = getBriefingDetail({ briefing_ref: result.reference.briefingRef, section: 'hazards' }, { ...context, owner: 'bob' })
  assert.equal(denied.error.code, 'REFERENCE_NOT_FOUND')
})

test('invalid, conflicting and arbitrary path inputs fail before calculation', async () => {
  const context = ctx({ execute() { assert.fail('must not execute') } })
  for (const input of [{}, { fixture_id: fixture.id, context_ref: 'x' }, { fixture_id: fixture.id, altitude: 9000 }]) {
    assert.equal((await getRouteBriefing(input, context)).error.code, 'INVALID_INPUT')
  }
  assert.equal((await getRouteBriefing({ fixture_id: '../../etc/passwd' }, context)).error.code, 'FIXTURE_NOT_FOUND')
  assert.equal((await getRouteBriefing({ context_ref: 'other' }, context)).error.code, 'REFERENCE_NOT_FOUND')
})

test('real procedure route enroute details paginate every leg without geometry or weather rereads', async () => {
  let reads = 0
  const full = composeBriefing(request, data)
  const context = ctx({ execute() { reads++; return { briefing: full, data } } })
  const result = await getRouteBriefing({ fixture_id: fixture.id }, context)
  const items = []
  let cursor = 0
  do {
    const detail = getBriefingDetail({ briefing_ref: result.reference.briefingRef, section: 'enroute', cursor, limit: 2 }, context)
    assert.equal(detail.status, 'partial')
    assert.equal(detail.reference.resultHash, result.reference.resultHash)
    assert.ok(Buffer.byteLength(JSON.stringify(detail.data.items)) <= 24 * 1024)
    items.push(...detail.data.items)
    cursor = detail.truncation.nextCursor
  } while (cursor !== null)
  assert.equal(items[0].kind, 'summary')
  assert.equal(items.filter(x => x.kind === 'enroute_leg').length, full.sections.enroute.legs.length)
  const procedures = full.sections.enroute.procedures ?? []
  assert.equal(items.filter(x => x.kind === 'procedure').length, procedures.length)
  assert.equal(items.filter(x => x.kind === 'procedure_leg').length, procedures.reduce((sum, p) => sum + p.legs.length, 0))
  assert.ok(!JSON.stringify(items).includes('coordinates'))
  assert.equal(reads, 1)
})

test('detail pagination accounts for every item, rejects bad cursor and oversized singleton', () => {
  const context = ctx()
  const saved = context.references.put('alice', 'briefing', {
    reference: {}, sources: [], coverage: [], issues: [], sections: { warnings: Array.from({ length: 25 }, (_, id) => ({ id })), enroute: [{ raw: 'x'.repeat(25_000) }] },
  })
  const page = getBriefingDetail({ briefing_ref: saved.id, section: 'warnings', limit: 20 }, context)
  assert.equal(page.data.items.length, 20)
  assert.equal(page.truncation.omittedCount, 5)
  assert.equal(page.truncation.nextCursor, 20)
  const last = getBriefingDetail({ briefing_ref: saved.id, section: 'warnings', cursor: 20 }, context)
  assert.equal(last.data.items[0].id, 20)
  assert.equal(last.truncation.nextCursor, null)
  assert.equal(getBriefingDetail({ briefing_ref: saved.id, section: 'warnings', cursor: 26 }, context).error.code, 'INVALID_CURSOR')
  assert.equal(getBriefingDetail({ briefing_ref: saved.id, section: 'enroute' }, context).error.code, 'DETAIL_ITEM_TOO_LARGE')
})

test('saved fixture is a versioned procedure route, not the diagnostic straight line', () => {
  assert.equal(request.routeGeometry.coordinates.length, 38)
  assert.equal(request.routeModel.schemaVersion, 1)
  assert.equal(request.routeModel.enRouteSegments.length, 8)
  assert.deepEqual(request.procedureContext.procedures.map((p) => p.type), ['SID', 'STAR', 'IAP'])
  assert.equal(new Set(request.routeMarkers.map((p) => p.id)).size, request.routeMarkers.length)
  assert.equal(fixture.provenance.navdataPublication, '2026-06-25')
  const navdata = JSON.parse(fs.readFileSync(new URL('../../frontend/public/data/navdata/enroute.json', import.meta.url)))
  assert.equal(navdata.publicationId, fixture.provenance.navdataPublication)
  for (const segment of request.routeModel.enRouteSegments) {
    const published = navdata.segments.find((item) => item.id === segment.id)
    assert.equal(published.fromFix, segment.fromFix)
    assert.equal(published.toFix, segment.toFix)
    assert.ok(segment.startNm >= request.routeModel.enRouteRange.startNm)
    assert.ok(segment.endNm <= request.routeModel.enRouteRange.endNm)
  }
})

test('missing local datasets produce explicit partial result and no invented model weather', async () => {
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-projectamo-fixture', fixture, now })
  const result = await runtime.call('get_route_briefing', { fixture_id: fixture.id }, 'dev')
  assert.equal(result.status, 'partial')
  assert.equal(result.data.enroute.weatherAvailable, false)
  assert.ok(result.sources.some((s) => s.kind === 'sigmet' && s.status === 'missing'))
  assert.ok(result.issues.some((i) => i.code === 'SOURCE_COVERAGE_UNVERIFIED'))
})
