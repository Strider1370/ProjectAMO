import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createNavdataProvider } from '../../../../../shared/route-planning/navdataProvider.js'
import { planRoute } from '../../../../../shared/route-planning/planRoute.js'
import { prepareCopilotSavedRoute, validateSavedRouteBundle } from './copilotSavedRoute.js'

const provider = createNavdataProvider({ readJson: async (name) => JSON.parse(await readFile(new URL(`../../../../public/data/navdata/${name}`, import.meta.url))) })
const baseline = JSON.parse(await readFile(new URL('../../../../../shared/fixtures/route-planning-baseline.json', import.meta.url)))
const now = () => Date.parse('2026-09-23T12:00:00Z')
const bundle = (entry) => ({ status: 'ok', entry: { id: 42, name: '저장 경로', ...entry }, routeHash: 'a'.repeat(64),
  expiresAt: '2026-09-23T12:15:00Z', reference: { savedRouteRef: 'saved_route_00000000-0000-4000-8000-000000000000' } })
const form = { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL', entryFix: '', exitFix: '' }
async function plannedEntry(input = baseline.cases[0].input) {
  const planned = await planRoute(input, provider)
  return { version: 3, base: { routeForm: planned.editor.routeForm, procedures: planned.editor.procedures,
    enroute: planned.editor.enroute, routeString: planned.editor.rawText }, alternatives: [],
    etd: new Date(planned.etd).toISOString(), eta: new Date(planned.eta).toISOString(), tasKt: input.tasKt,
    cruiseAltitudeFt: input.cruiseAltitudeFt, routeGeometry: planned.profileRequest.routeGeometry,
    routeModel: planned.profileRequest.routeModel, routeMarkers: planned.profileRequest.routeMarkers }
}

test('saved import preserves exact stored geometry/model/conditions without touching the input', async () => {
  for (const { input } of baseline.cases) {
    const source = bundle(await plannedEntry(input)), before = structuredClone(source)
    const value = await prepareCopilotSavedRoute(source, { provider, now })
    assert.deepEqual(source, before)
    assert.deepEqual(value.designs[0].routeModel.routeGeometry, source.entry.routeGeometry)
    assert.deepEqual(value.designs[0].routeResult.routeMarkers, source.entry.routeMarkers)
    assert.equal(value.saved.etd, source.entry.etd)
    assert.deepEqual(value.retainedFields, [])
    assert.equal(value.designs[0].routeExposure.trigger, 'unavailable')
    assert.equal(value.mode, 'route')
  }
})

test('alternatives restore together from current navdata, selection is preserved and missing alternatives reject', async () => {
  const entry = await plannedEntry()
  entry.alternatives = [{ ...structuredClone(entry.base), id: 'alt-1', name: '대안' }]
  entry.selectedAlternativeId = 'alt-1'
  const value = await prepareCopilotSavedRoute(bundle(entry), { provider, now })
  assert.equal(value.designs.length, 2)
  assert.equal(value.saved.selectedAlternativeId, 'alt-1')
  assert.ok(value.designs[1].routeModel.routeGeometry.coordinates.length > 2)
  assert.match(value.notices.join(' '), /현재 항법자료/)
  entry.alternatives[0].routeString = ''
  await assert.rejects(prepareCopilotSavedRoute(bundle(entry), { provider, now }), /SAVED_ALTERNATIVE_INPUTS_INCOMPLETE/)
  entry.alternatives = []
  await assert.rejects(prepareCopilotSavedRoute(bundle(entry), { provider, now }), /SAVED_SELECTION_UNAVAILABLE/)
})

test('legacy form becomes draft only; legacy VFR waypoints reconstruct with disclosure', async () => {
  const draft = await prepareCopilotSavedRoute(bundle({ routeForm: form }), { provider, now })
  assert.equal(draft.mode, 'draft')
  assert.equal(draft.designs[0].routeResult, null)
  assert.deepEqual(draft.retainedFields, ['etd', 'cruiseAltitudeFt', 'tasKt'])
  const vfr = await prepareCopilotSavedRoute(bundle({ routeForm: { ...form, flightRule: 'VFR' }, vfrWaypoints: [
    { lon: 126.79, lat: 37.55 }, { lon: 126.6, lat: 35 }, { lon: 126.49, lat: 33.5 },
  ] }), { provider, now })
  assert.equal(vfr.mode, 'route')
  assert.equal(vfr.designs[0].enroute.userWaypoints.length, 1)
  assert.match(vfr.notices.join(' '), /현재 항법자료/)
})

test('missing current procedures preserve stored geometry with notice, but cannot reconstruct an alternative', async () => {
  const entry = await plannedEntry()
  entry.base.procedureIds = { sid: 'missing-procedure' }
  const value = await prepareCopilotSavedRoute(bundle(entry), { provider, now })
  assert.deepEqual(value.designs[0].routeModel.routeGeometry, entry.routeGeometry)
  assert.match(value.notices.join(' '), /저장 절차/)
  entry.alternatives = [{ ...entry.base, id: 'alt-1' }]
  await assert.rejects(prepareCopilotSavedRoute(bundle(entry), { provider, now }), /SAVED_PROCEDURE_UNAVAILABLE/)
})

test('invalid saved times/geometry/markers and expiry during reads are rejected before commit', async () => {
  for (const etd of ['2026-02-30T12:00:00Z', '2026-09-23T24:00:00Z', '2026-09-23T12:00:00']) {
    assert.throws(() => validateSavedRouteBundle(bundle({ etd }), now()), /INVALID_SAVED_ROUTE_TIME/)
  }
  assert.throws(() => validateSavedRouteBundle(bundle({ routeGeometry: { type: 'Point', coordinates: [1, 2] } }), now()), /INVALID_SAVED_GEOMETRY/)
  assert.throws(() => validateSavedRouteBundle(bundle({ routeMarkers: [{ lat: 99, lon: 126 }] }), now()), /INVALID_SAVED_MARKERS/)
  for (const selection of [{ waypointOverrides: {} }, { baseTime: '2026-02-30T00:00:00Z', waypointOverrides: [] },
    { waypointOverrides: [{ waypointId: 'absent', offsetHours: 1 }] }]) {
    assert.throws(() => validateSavedRouteBundle(bundle({ nwpTimeSelection: selection }), now()), /INVALID_SAVED_NWP_SELECTION/)
  }
  let clock = now()
  const entry = await plannedEntry()
  entry.base.procedureIds = { sid: 'load' }
  await assert.rejects(prepareCopilotSavedRoute(bundle(entry), { provider: { ...provider, getProcedures: async () => {
    clock += 16 * 60_000; return []
  } }, now: () => clock }), /REFERENCE_EXPIRED/)
})

test('VFR stored geometry keeps every interior point even when legacy marker metadata is absent', async () => {
  const geometry = { type: 'LineString', coordinates: [[126.79, 37.55], [127, 36], [126.6, 35], [126.49, 33.5]] }
  const value = await prepareCopilotSavedRoute(bundle({ routeForm: { ...form, flightRule: 'VFR' }, routeGeometry: geometry }), { provider, now })
  assert.deepEqual(value.designs[0].routeResult.manualRoute.points.map((point) => point.coordinates), geometry.coordinates.slice(1, -1))
})
