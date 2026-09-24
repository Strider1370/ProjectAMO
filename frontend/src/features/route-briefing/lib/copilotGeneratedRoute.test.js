import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createNavdataProvider } from '../../../../../shared/route-planning/navdataProvider.js'
import { planRoute } from '../../../../../shared/route-planning/planRoute.js'
import { generatedRouteAction, prepareGeneratedRoute } from './copilotGeneratedRoute.js'

const baseline = JSON.parse(await readFile(new URL('../../../../../shared/fixtures/route-planning-baseline.json', import.meta.url)))
const provider = createNavdataProvider({ readJson: async (name) => JSON.parse(await readFile(new URL(`../../../../public/data/navdata/${name}`, import.meta.url))) })
const now = () => Date.parse('2026-09-23T12:00:00Z')
async function bundleFor(input) {
  const planned = await planRoute(input, provider)
  const navdata = await provider.loadNavdata()
  const sourceSegments = [...new Set(planned.profileRequest.routeModel.enRouteSegments
    .filter((segment) => segment.kind === 'airway').map((segment) => segment.id))]
    .map((id) => navdata.routeSegmentsById[id])
  const { routeForm } = input
  const etd = new Date(planned.etd).toISOString(), eta = new Date(planned.eta).toISOString()
  return { status: 'ok', resultHash: 'hash', expiresAt: '2026-09-23T12:15:00Z',
    reference: { routeOrigin: 'server-planner', resultHash: 'hash', publicationId: planned.publicationId, navdataSnapshotId: 'snapshot' },
    request: { ...planned.profileRequest, etd, eta, departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport },
    plan: { ...planned, sourceSegments, schemaVersion: 1, origin: 'server-planner', snapshotId: 'snapshot',
      flight: { departureAirport: routeForm.departureAirport, arrivalAirport: routeForm.arrivalAirport, flightRule: 'IFR',
        routeType: 'ALL', cruiseAltitudeFt: input.cruiseAltitudeFt, tasKt: input.tasKt, etd, eta } } }
}

test('generated route handoff preserves exact server editor, geometry and explicit conditions across four routes', async () => {
  for (const { input } of baseline.cases) {
    const bundle = await bundleFor(input)
    const prepared = await prepareGeneratedRoute(bundle, { provider, now })
    assert.deepEqual(prepared.bundle, bundle)
    assert.notEqual(prepared.bundle, bundle)
    assert.equal(prepared.action.fields.etd, bundle.request.etd)
    assert.equal(prepared.action.fields.eta, bundle.request.eta)
    assert.equal(prepared.bundle.plan.flight.tasKt, 450)
    assert.ok(prepared.iapData.iapRoutes[bundle.plan.editor.procedures.iapKey])
  }
})

test('wrong publication, changed procedures and geometry are rejected instead of silently recalculated', async () => {
  const bundle = await bundleFor(baseline.cases[0].input)
  await assert.rejects(prepareGeneratedRoute(bundle, { provider: { ...provider,
    loadNavdata: async () => ({ ...(await provider.loadNavdata()), publicationId: 'other' }) }, now }), /NAVDATA_PLAN_MISMATCH/)
  const procedureChanged = structuredClone(bundle)
  procedureChanged.plan.selectedIap.fixes[0].lat += 0.001
  await assert.rejects(prepareGeneratedRoute(procedureChanged, { provider, now }), /NAVDATA_PLAN_MISMATCH/)
  const geometryChanged = structuredClone(bundle)
  geometryChanged.request.routeGeometry = JSON.parse(JSON.stringify(bundle.request.routeGeometry))
  geometryChanged.request.routeGeometry.coordinates[0][0] += 0.01
  await assert.rejects(prepareGeneratedRoute(geometryChanged, { provider, now }), /GENERATED_GEOMETRY_MISMATCH/)
})

test('expired/mismatched stored inputs cannot become an editor action, including expiry during catalog load', async () => {
  const bundle = await bundleFor(baseline.cases[0].input)
  assert.throws(() => generatedRouteAction(bundle, Date.parse(bundle.expiresAt)), /REFERENCE_EXPIRED/)
  for (const mutate of [
    (value) => { value.plan.flight.tasKt = 0 },
    (value) => { value.plan.flight.eta = '2026-09-23T14:00:00.000Z' },
    (value) => { value.plan.editor.routeForm.arrivalAirport = 'RKSI' },
    (value) => { value.plan.snapshotId = 'other' },
    (value) => { value.reference.resultHash = 'other' },
    (value) => { value.plan.origin = 'model' },
  ]) {
    const value = structuredClone(bundle)
    mutate(value)
    assert.throws(() => generatedRouteAction(value, now()), /INVALID_GENERATED_ROUTE/)
  }
  let clock = now()
  await assert.rejects(prepareGeneratedRoute(bundle, { provider: { ...provider,
    loadNavdata: async () => { clock += 16 * 60_000; return provider.loadNavdata() } }, now: () => clock }), /REFERENCE_EXPIRED/)
})

test('same-publication changes to used airway geometry or restrictions block import, unrelated records do not', async () => {
  const bundle = await bundleFor(baseline.cases[0].input)
  const id = bundle.plan.sourceSegments[0].id
  for (const mutate of [
    (data) => { data.routeSegmentsById[id].fromCoordinates.lat += 0.001 },
    (data) => { data.routeSegmentsById[id].lowerLimit = 'changed restriction' },
    (data) => { delete data.routeSegmentsById[id] },
  ]) {
    const changed = structuredClone(await provider.loadNavdata())
    mutate(changed)
    await assert.rejects(prepareGeneratedRoute(bundle, { provider: { ...provider, loadNavdata: async () => changed }, now }), /NAVDATA_PLAN_MISMATCH/)
  }
  for (const sources of [undefined, [], [...bundle.plan.sourceSegments, bundle.plan.sourceSegments[0]]]) {
    await assert.rejects(prepareGeneratedRoute({ ...bundle, plan: { ...bundle.plan, sourceSegments: sources } }, { provider, now }), /NAVDATA_PLAN_MISMATCH/)
  }
  const unrelated = structuredClone(await provider.loadNavdata())
  unrelated.routeSegmentsById['unused-record'] = { id: 'unused-record' }
  await prepareGeneratedRoute(bundle, { provider: { ...provider, loadNavdata: async () => unrelated }, now })
})
