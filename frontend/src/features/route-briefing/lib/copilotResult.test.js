import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptCopilotResult, copilotResultContext } from './copilotResult.js'
import { createBriefingProvider } from './briefingProvider.js'

const reference = { briefingRef: 'briefing_12345678-1234-1234-1234-123456789abc', resultHash: 'fixed-hash' }
const result = () => ({ status: 'ok', reference, resultHash: reference.resultHash, expiresAt: '2026-09-24T00:00:00Z',
  request: { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC',
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36], [126, 33]] },
    routeModel: { routeAxis: { totalDistanceNm: 250 } }, routeMarkers: [{ id: 'a', label: 'A', lon: 127, lat: 36 }],
    nwpTimeSelection: { baseTime: '2026-09-23T12:00:00Z', waypointOverrides: [{ waypointId: 'a', offsetHours: 3 }] } },
  briefing: { meta: { departureAirport: 'RKSS', arrivalAirport: 'RKPC' }, sections: {} },
  verticalProfile: { flightPlan: { profile: [31000] } }, crossSection: { run: { tmfc: 'frozen-run' } },
  altitudeComparison: { rows: [{ altitudeFt: 31000, status: 'input_only' }] } })

test('stored result adapter preserves geometry, markers, NWP time, weather and comparison identity without calculation', () => {
  const value = result()
  const bundle = adaptCopilotResult(value, reference, Date.parse('2026-09-23T12:00:00Z'))
  assert.equal(bundle.briefing, value.briefing)
  assert.equal(bundle.crossSection, value.crossSection)
  assert.equal(bundle.verticalProfile, value.verticalProfile)
  assert.equal(bundle.altitudeComparison, value.altitudeComparison)
  assert.deepEqual(bundle.routeResult.previewGeojson.features[0].geometry, value.request.routeGeometry)
  assert.deepEqual(bundle.routeResult.routeMarkers, value.request.routeMarkers)
  assert.deepEqual(bundle.request.nwpTimeSelection, value.request.nwpTimeSelection)
  assert.equal(bundle.routePreviewModel.pendingRouteResult, undefined)
  const context = copilotResultContext(bundle)
  assert.deepEqual(context.request, bundle.request)
  context.request.routeGeometry.coordinates[0][0] = 0
  assert.notEqual(bundle.request.routeGeometry.coordinates[0][0], 0)
  assert.equal(copilotResultContext(null), null)
})

test('expired, wrong-reference, wrong-hash and malformed results fail closed', () => {
  const now = Date.parse('2026-09-23T12:00:00Z')
  assert.throws(() => adaptCopilotResult(result(), reference, Date.parse('2026-09-24T00:00:00Z')), /REFERENCE_EXPIRED/)
  assert.throws(() => adaptCopilotResult(result(), { ...reference, resultHash: 'new' }, now), /RESULT_IDENTITY_MISMATCH/)
  assert.throws(() => adaptCopilotResult(result(), { ...reference, briefingRef: 'briefing_wrong' }, now), /RESULT_IDENTITY_MISMATCH/)
  assert.throws(() => adaptCopilotResult({ ...result(), request: {} }, reference, now), /INVALID_RESULT/)
})

test('saved provenance must match the requested owner-checked origin and weather result', () => {
  const ref = { ...reference, savedRouteOriginRef: 'saved_origin_12345678-1234-1234-1234-123456789abc' }
  const value = { ...result(), reference: ref, savedRouteOrigin: { briefingRef: ref.briefingRef, resultHash: ref.resultHash,
    savedRoute: { id: 42, name: '내 저장 경로' }, mode: 'current_briefing' } }
  const now = Date.parse('2026-09-23T12:00:00Z')
  assert.equal(adaptCopilotResult(value, ref, now).savedRouteOrigin.savedRoute.id, 42)
  for (const changed of [undefined, { ...value.savedRouteOrigin, resultHash: 'another' }, { ...value.savedRouteOrigin, mode: 'historical_result' }]) {
    assert.throws(() => adaptCopilotResult({ ...value, savedRouteOrigin: changed }, ref, now), /SAVED_ORIGIN_MISMATCH/)
  }
})

test('copilot provider reads only the stored endpoint and never falls back to current weather', async () => {
  const forbidden = () => { throw new Error('Unexpected latest-data calculation') }
  let seen
  const signal = new AbortController().signal
  const provider = createBriefingProvider({ kind: 'copilot', reference }, {
    briefing: forbidden, profile: forbidden, crossSection: forbidden, organization: forbidden,
    copilot: async (ref, options) => { seen = { ref, options }; throw new Error('REFERENCE_EXPIRED') },
  })
  await assert.rejects(provider.load({ signal }), /REFERENCE_EXPIRED/)
  assert.equal(seen.ref, reference)
  assert.equal(seen.options.signal, signal)
})
