import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { executeAltitudeComparison, captureAltitudeInputs } from '../src/briefing/altitude-service.js'
import { buildAltitudeCandidates, buildAltitudeWeatherComparison } from '../src/briefing/altitude-weather-comparison.js'
import { buildRouteAxis } from '../src/briefing/route-axis.js'
import { buildVerticalProfile } from '../src/briefing/vertical-profile.js'
import { executeBriefing } from '../src/briefing/briefing-service.js'
import { createReferenceStore } from '../src/ai/reference-store.js'
import { getRouteBriefing } from '../src/ai/tools/get-route-briefing.js'
import { compareRouteAltitudes } from '../src/ai/tools/compare-route-altitudes.js'
import { getBriefingDetail } from '../src/ai/tools/get-briefing-detail.js'
import { readStoredBriefing } from '../src/ai/stored-briefing.js'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
const request = fixture.request
const axis = buildRouteAxis(request.routeGeometry)
const matched = (series = 'Odd') => ({ status: 'matched', segments: [{ id: 'test', status: 'matched', constraints: {
  minimumFlightAltitude: { value: 20000, unit: 'FT' }, upperLimit: { value: 400, unit: 'FL' },
  cruisingLevelSeries: { series },
} }], provenance: { publicationId: 'test-publication' } })
const model = () => ({ available: true, axis, totalDistanceNm: axis.totalDistanceNm, availableTimes: [{ hf: 0 }],
  timeRules: { waypointOverrides: [{ waypointId: 'test-marker', offsetHours: 3 }] },
  crossSection: { run: { tmfc: '2026092318', validTime: '2026-09-23T12:00:00Z' }, levels: [21000, 31000, 39000].map((altFt) => ({
    altFt, values: axis.samples.map(({ distanceNm }) => ({ distanceNm, altFt, u: 10, v: 0, t: -10, icing: 2 })),
  })) }, turbulence: { levels: [] } })
const terrainSampler = { sampleAxis: (a) => ({ terrain: { unit: 'm', values: a.samples.map(({ index }) => ({ index, elevationM: 0 })) }, warnings: [] }) }

test('extracted REST service matches the original candidate/profile/weather calculation exactly', () => {
  const aip = matched(), crossSectionResult = model()
  const candidateResult = buildAltitudeCandidates({ routeSegments: aip.segments,
    plannedCruiseAltitudeFt: request.plannedCruiseAltitudeFt, crossSection: crossSectionResult.crossSection })
  const flightPlanProfiles = Object.fromEntries(candidateResult.candidates.map((candidate) => [candidate.altitudeFt,
    buildVerticalProfile({ ...request, plannedCruiseAltitudeFt: candidate.altitudeFt }, terrainSampler).flightPlan.profile]))
  const expectedRows = buildAltitudeWeatherComparison({ candidates: candidateResult.candidates,
    axis, crossSection: crossSectionResult.crossSection, turbulence: crossSectionResult.turbulence,
    hazards: [], notams: [], etd: request.etd, eta: request.eta, flightPlanProfiles })
  const actual = executeAltitudeComparison(request, { loadConstraints: () => aip, loadModel: () => crossSectionResult,
    readCached: () => null, terrainSampler })
  assert.deepEqual(actual, { constraints: { ...candidateResult.constraints, provenance: aip.provenance }, rows: expectedRows,
    crossSectionRun: crossSectionResult.crossSection.run,
    crossSection: { ...crossSectionResult.crossSection, turbulence: crossSectionResult.turbulence, availableTimes: crossSectionResult.availableTimes,
      timeRules: crossSectionResult.timeRules, nwpTimeAvailability: crossSectionResult.nwpTimeAvailability } })
})

test('requested altitudes retain valid/input_invalid and unavailable/conflicting input_only states', () => {
  const captured = captureAltitudeInputs(request, { enrouteCrossSection: model() }, { loadConstraints: () => matched(), terrainSampler })
  const result = executeAltitudeComparison(request, { captured, altitudesFt: [31000, 32000, 59000] })
  assert.deepEqual(result.rows.map((row) => row.status), ['valid', 'input_invalid', 'input_invalid'])
  assert.equal(result.rows[0].wind.speedKt, 19)
  assert.equal(result.rows[0].profileStatus, 'applied')
  assert.equal(result.rows[1].weatherStatus, 'unavailable')
  for (const status of ['unavailable', 'partial', 'conflicting']) {
    const without = { ...captured, aip: { status, provenance: null,
      segments: [{ status, constraints: null }] }, model: { available: false }, terrain: null }
    const rows = executeAltitudeComparison(request, { captured: without, altitudesFt: [31000, 33000] }).rows
    assert.deepEqual(rows.map((row) => row.status), ['input_only', 'input_only'])
    assert.ok(rows.every((row) => row.wind === null && row.icing.summary.status === 'unavailable' && row.profileStatus === 'cruise_fallback'))
  }
})

test('capture pins model/AIP/terrain once; stored comparison ignores later weather and preserves markers/time selections', async () => {
  let reads = 0, modelReads = 0, aipReads = 0, terrainReads = 0, time = Date.parse(fixture.effectiveNow)
  let currentModel = model(), currentAip = matched()
  const selected = structuredClone(fixture)
  selected.request.nwpTimeSelection = { baseTime: '2026-09-23T12:00:00Z', waypointOverrides: [
    { waypointId: selected.request.routeMarkers[1].id, offsetHours: 3 },
  ] }
  const refs = createReferenceStore({ now: () => time })
  const context = { owner: 'alice', realNow: () => time, displayTimezone: 'Asia/Seoul', references: refs,
    fixtures: new Map([[selected.id, selected]]), execute: (selection) => executeBriefing(selection.request, {
      dataRoot: '/not-a-real-data-root', readCached: () => { reads++; return null }, weatherNow: () => time, captureComparison: true,
      loadModel: ({ body }) => { modelReads++; assert.deepEqual(body.nwpTimeSelection, selected.request.nwpTimeSelection); return currentModel },
      loadConstraints: () => { aipReads++; return currentAip },
      terrainSampler: { sampleAxis: (a) => { terrainReads++; return terrainSampler.sampleAxis(a) } },
    }) }
  const briefing = await getRouteBriefing({ fixture_id: selected.id }, context)
  assert.equal(briefing.status, 'partial')
  assert.equal(modelReads, 1); assert.equal(aipReads, 1); assert.equal(terrainReads, 1)
  const counts = [reads, modelReads, aipReads, terrainReads]
  const args = { briefing_ref: briefing.reference.briefingRef, altitudes_ft: [31000, 33000] }
  const first = compareRouteAltitudes(args, context)
  assert.equal(first.status, 'partial')
  assert.equal(first.reference.parentResultHash, briefing.reference.resultHash)
  currentModel.crossSection.run.tmfc = 'MUTATED'
  currentModel.crossSection.levels[0].values[0].u = 999
  currentAip.segments[0].status = 'unavailable'
  time += 60_000
  const second = compareRouteAltitudes(args, context)
  assert.deepEqual(first.data.rows, second.data.rows)
  assert.deepEqual(first.reference.crossSectionRun, second.reference.crossSectionRun)
  assert.equal(second.reference.effectiveNow, briefing.reference.effectiveNow)
  assert.deepEqual([reads, modelReads, aipReads, terrainReads], counts)
  const stored = refs.get('alice', 'briefing', second.reference.briefingRef).value
  assert.deepEqual(stored.request.routeMarkers, selected.request.routeMarkers)
  assert.deepEqual(stored.request.nwpTimeSelection, selected.request.nwpTimeSelection)
  const detail = getBriefingDetail({ briefing_ref: second.reference.briefingRef, section: 'altitudes' }, context)
  assert.equal(detail.reference.resultHash, second.reference.resultHash)
  assert.equal(detail.data.items[0].wind.speedKt, second.data.rows[0].wind.speedKt)
})

test('comparison fails closed for foreign/expired refs, missing capture, malformed input and internal errors', () => {
  let time = 0
  const references = createReferenceStore({ now: () => time, ttlMs: 100 })
  const context = { owner: 'alice', references, realNow: () => time }
  const ref = references.put('alice', 'briefing', { request, comparisonInputs: null })
  const args = { briefing_ref: ref.id, altitudes_ft: [31000, 33000] }
  for (const invalid of [{ ...args, altitudes_ft: [31000] }, { ...args, altitudes_ft: [31000, 31000] },
    { ...args, altitudes_ft: [NaN, 33000] }, { ...args, altitudes_ft: [100, 33000] }, { ...args, altitudes_ft: [31000, 60001] },
    { ...args, etd: request.etd }, { ...args, altitudes_ft: [1000, 2000, 3000, 4000, 5000, 6000] }]) {
    assert.equal(compareRouteAltitudes(invalid, context).error.code, 'INVALID_INPUT')
  }
  assert.equal(compareRouteAltitudes(args, { ...context, owner: 'bob' }).error.code, 'REFERENCE_NOT_FOUND')
  assert.equal(compareRouteAltitudes(args, context).error.code, 'COMPARISON_INPUTS_EXPIRED_REQUERY')
  time = 100
  assert.equal(compareRouteAltitudes(args, context).error.code, 'REFERENCE_EXPIRED')
  const broken = references.put('alice', 'briefing', { request, comparisonInputs: {} })
  assert.equal(compareRouteAltitudes({ ...args, briefing_ref: broken.id }, context).error.code, 'ALTITUDE_COMPARISON_FAILED')
})

test('repeated comparisons share one large snapshot, flatten references and expire with their original data', () => {
  let time = 0
  const references = createReferenceStore({ now: () => time, maxBytes: 1_000_000, ttlMs: 100 })
  const captured = captureAltitudeInputs(request, { enrouteCrossSection: { available: false, largePayload: 'x'.repeat(600_000) } },
    { loadConstraints: () => ({ segments: [], provenance: {} }) })
  const root = references.put('alice', 'briefing', { request, comparisonInputs: captured, reference: { effectiveNow: '2026-09-23T00:00:00Z' },
    issues: [], sources: [], coverage: [], sections: { provenance: ['original'] } })
  const context = { owner: 'alice', references, realNow: () => time }
  time = 50
  let previous = root.id
  for (let i = 0; i < 8; i++) {
    const comparison = compareRouteAltitudes({ briefing_ref: previous, altitudes_ft: [31000, 33000] }, context)
    assert.equal(comparison.status, 'partial')
    previous = comparison.reference.briefingRef
    const entry = readStoredBriefing(references, 'alice', previous)
    assert.equal(entry.baseBriefingRef, root.id)
    assert.equal(entry.expiresAt, root.expiresAt)
    assert.equal(entry.value.comparisonInputs.model.largePayload.length, 600_000)
    assert.deepEqual(getBriefingDetail({ briefing_ref: previous, section: 'provenance' }, context).data.items, ['original'])
  }
  assert.ok(references.stats().bytes < 800_000)
  time = 101
  assert.throws(() => readStoredBriefing(references, 'alice', previous), { code: 'REFERENCE_EXPIRED' })
})
