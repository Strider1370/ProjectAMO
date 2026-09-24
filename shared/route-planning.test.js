import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createNavdataProvider } from './route-planning/navdataProvider.js'
import { createRoutePlanner } from './route-planning/routePlanner.js'
import { planRoute } from './route-planning/planRoute.js'
import { buildEditorPreview } from './route-planning/editorPreview.js'
import { createRouteEditor } from './route-planning/routeEditor.js'

const fixture = JSON.parse(await readFile(new URL('./fixtures/route-planning-baseline.json', import.meta.url)))
const root = new URL('../frontend/public/data/navdata/', import.meta.url)
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'))
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

for (const { input, expected } of fixture.cases) {
  test(`planRoute matches pre-extraction browser baseline: ${input.routeForm.departureAirport}-${input.routeForm.arrivalAirport}, wind ${input.metarData.airports[input.routeForm.departureAirport].observation.wind.direction}`, async () => {
    const result = await planRoute(input, createNavdataProvider({ readJson }))
    assert.equal(result.publicationId, expected.publicationId)
    assert.deepEqual(result.editor.routeForm, expected.routeForm)
    assert.equal(result.editor.rawText, expected.routeString)
    assert.equal(result.editor.procedures.sid.id, expected.sid)
    assert.equal(result.editor.procedures.star.id, expected.star)
    assert.equal(result.editor.procedures.iapKey, expected.iapKey)
    assert.equal(result.routeResult.distanceNm, expected.distanceNm)
    assert.equal(result.routeResult.totalDistanceNm, expected.totalDistanceNm)
    assert.equal(result.eta, expected.eta)
    assert.equal(hash(result.editor), expected.editorHash)
    assert.equal(hash(result.routeGeometry), expected.geometryHash)
    assert.equal(hash(result.routeModel), expected.modelHash)
    assert.equal(hash(result.profileRequest), expected.profileHash)
    const noWind = input.metarData.airports[input.routeForm.departureAirport].observation.wind.direction === null
    assert.equal(result.assumptions.missingWindAirports.length, noWind ? 2 : 0)
    assert.equal(result.assumptions.operationalClearance, false)
  })
}

test('provider shares file loads across procedures, IAP and concurrent graph callers; rejected reads retry', async () => {
  const counts = new Map()
  let fail = true
  const provider = createNavdataProvider({ readJson: async (name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1)
    if (fail && name === 'procedures/rkss-sid-procedures.json') throw new Error('transient')
    return readJson(name)
  } })
  await assert.rejects(provider.getProcedures('RKSS', 'SID'), /transient/)
  fail = false
  const [a, b] = await Promise.all([provider.loadNavdata(), provider.loadNavdata(),
    provider.getProcedures('RKSS', 'SID'), provider.getProcedures('RKSS', 'SID'),
    provider.loadIapData('RKPC'), provider.loadIapData('RKPC')])
  assert.equal(a, b)
  assert.equal(counts.get('enroute.json'), 1)
  assert.equal(counts.get('procedures/rkss-sid-procedures.json'), 2)
  assert.equal(counts.get('procedures/rkpc-representative-iap-routes.json'), 1)
})

test('new AIRAC provider cannot reuse old graph, procedure or IAP cache', async () => {
  const provider = (id) => createNavdataProvider({ publicationId: id, readJson: async (name) => {
    const data = await readJson(name)
    if (name === 'enroute.json') data.publicationId = id
    if (name === 'procedures/rkpc-representative-iap-routes.json') data.snapshot = id
    if (name === 'procedures/rkss-sid-procedures.json') {
      for (const proc of Object.values(data.sidProcedures ?? data)) if (proc?.name) proc.name += id
    }
    return data
  } })
  const a = provider('A'), b = provider('B')
  const [navA, navB, sidA, sidB, iapA, iapB] = await Promise.all([
    a.loadNavdata(), b.loadNavdata(), a.getProcedures('RKSS', 'SID'), b.getProcedures('RKSS', 'SID'), a.loadIapData('RKPC'), b.loadIapData('RKPC'),
  ])
  assert.notEqual(navA.routeGraph, navB.routeGraph)
  assert.equal(navA.publicationId, 'A')
  assert.equal(navB.publicationId, 'B')
  assert.notEqual(sidA[0].name, sidB[0].name)
  assert.equal(iapA.snapshot, 'A')
  assert.equal(iapB.snapshot, 'B')
  assert.equal(await a.loadIapData('RKPC'), iapA)
  await assert.rejects(createNavdataProvider({ publicationId: 'WRONG', readJson }).loadNavdata(), { code: 'NAVDATA_PUBLICATION_MISMATCH' })
})

test('unsupported scope and invalid explicit inputs fail before any provider read', async () => {
  const input = fixture.cases[0].input
  const unreadable = new Proxy({}, { get() { throw new Error('unexpected I/O') } })
  for (const [patch, code] of [
    [{ routeForm: { ...input.routeForm, flightRule: 'VFR' } }, 'ROUTE_PLANNING_UNSUPPORTED'],
    [{ routeForm: { ...input.routeForm, arrivalAirport: 'RJTT' } }, 'ROUTE_PLANNING_UNSUPPORTED'],
    [{ tasKt: 0 }, 'INVALID_TAS'], [{ cruiseAltitudeFt: undefined }, 'INVALID_ROUTE_ALTITUDE'],
    [{ etd: '2026-09-23T21:03' }, 'INVALID_ETD'],
    [{ etd: '2026-02-30T12:00:00Z' }, 'INVALID_ETD'],
    [{ etd: '2026-09-23T24:00:00Z' }, 'INVALID_ETD'],
    [{ viaFixes: ['BULTI'] }, 'UNSUPPORTED_ROUTE_CONDITIONS'],
    [{ routeForm: { ...input.routeForm, entryFix: 'BULTI' } }, 'UNSUPPORTED_ROUTE_CONDITIONS'],
    [{ eta: '2026-09-23T10:00:00Z' }, 'INVALID_ROUTE_TIME_WINDOW'],
  ]) await assert.rejects(planRoute({ ...input, ...patch }, unreadable), { code })
})

test('missing procedure, no connected airway and user ETA are not silently replaced', async () => {
  const input = fixture.cases[0].input
  const provider = createNavdataProvider({ readJson })
  await assert.rejects(planRoute(input, { ...provider, getProcedures: async () => [] }), { code: 'PROCEDURE_DATA_UNAVAILABLE' })
  const broken = createNavdataProvider({ readJson: async (name) => {
    const value = await readJson(name)
    return name === 'enroute.json' ? { ...value, segments: [] } : value
  } })
  await assert.rejects(planRoute(input, broken))
  const eta = '2026-09-23T14:00:00Z'
  const result = await planRoute({ ...input, eta }, provider)
  assert.equal(result.eta, eta)
  assert.equal(result.assumptions.etaBasis, 'user-specified')
})

test('shared editor preserves manual DCT, local waypoint identity and VFR direct route', async () => {
  const planner = createRoutePlanner(createNavdataProvider({ readJson }))
  const editor = createRouteEditor({ routeForm: fixture.cases[0].input.routeForm })
  const result = await buildEditorPreview(editor, 'MEKIL DCT N3500.0E12800.0', { planner })
  assert.equal(result.result.manualLegs[0].kind, 'dct')
  assert.equal(result.editor.enroute.userWaypoints[0].id, 'user-wp-1')
  assert.equal(editor.enroute.userWaypoints.length, 0)
  assert.equal(result.editor.enroute.nextWaypointNumber, 2)
  const vfr = createRouteEditor({ routeForm: { ...editor.routeForm, flightRule: 'VFR' } })
  const direct = await buildEditorPreview(vfr, 'RKSS DCT RKPC', { planner })
  assert.equal(direct.result.flightRule, 'VFR')
  assert.equal(direct.result.previewGeojson.features[0].geometry.coordinates.length, 2)
})

test('shared planner imports no frontend, Node-only module or ambient browser I/O', async () => {
  for (const name of await readdir(new URL('./route-planning/', import.meta.url))) {
    const source = await readFile(new URL(`./route-planning/${name}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:frontend|node:)/, name)
    assert.doesNotMatch(source, /\b(?:fetch|localStorage|document|window)\s*(?:\(|\.)/, name)
  }
})
