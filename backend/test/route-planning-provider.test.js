import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFileRoutePlanningProvider } from '../src/briefing/route-planning-provider.js'
import { planRoute } from '../../shared/route-planning/planRoute.js'
import { normalizeRouteContext } from '../src/ai/route-context.js'
import { createProcedureCatalog } from '../src/ai/procedure-catalog.js'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

test('server file provider creates real domestic routes without browser globals', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../shared/fixtures/route-planning-baseline.json', import.meta.url)))
  const provider = await createFileRoutePlanningProvider({ servedNavdataRoot: null })
  const navdata = JSON.parse(await readFile(new URL('../../frontend/public/data/navdata/enroute.json', import.meta.url)))
  const resolveProcedure = createProcedureCatalog(fileURLToPath(new URL('../../frontend/public/data/navdata/procedures/', import.meta.url)))
  for (const { input, expected } of fixture.cases) {
    const result = await planRoute(input, provider)
    assert.equal(result.editor.rawText, expected.routeString)
    assert.equal(result.eta, expected.eta)
    assert.equal(result.publicationId, expected.publicationId)
    assert.match(result.snapshotId, /^[a-f0-9]{64}$/)
    const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
    assert.equal(hash(result.editor), expected.editorHash)
    assert.equal(hash(result.routeGeometry), expected.geometryHash)
    assert.equal(hash(result.routeModel), expected.modelHash)
    assert.equal(hash(result.profileRequest), expected.profileHash)
    const { routeGeometry, routeModel, routeMarkers, procedureContext, plannedCruiseAltitudeFt } = result.profileRequest
    const context = normalizeRouteContext({
      schemaVersion: 1, scope: 'personal', revision: 'server-generated', request: {
        flightRule: 'IFR', departureAirport: input.routeForm.departureAirport, arrivalAirport: input.routeForm.arrivalAirport,
        routeGeometry, routeModel, routeMarkers, procedureContext, plannedCruiseAltitudeFt, etd: result.etd, eta: result.eta,
      },
    }, { navdata, resolveProcedure })
    assert.deepEqual(context.issues, [])
    assert.equal(context.procedureSources.length, 3)
  }
})

test('captured server files and missing IAP stay fixed while a new provider sees a new publication', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'amo-route-planner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'procedures'))
  await writeFile(path.join(root, 'airports.json'), '{}')
  const enroute = (id) => JSON.stringify({ publicationId: id, points: {}, segments: [], routes: {} })
  await writeFile(path.join(root, 'enroute.json'), enroute('A'))
  const a = await createFileRoutePlanningProvider({ navdataRoot: root, servedNavdataRoot: root })
  await writeFile(path.join(root, 'enroute.json'), enroute('B'))
  await writeFile(path.join(root, 'procedures/rkpc-representative-iap-routes.json'), '{"cycle":"B"}')
  const b = await createFileRoutePlanningProvider({ navdataRoot: root, servedNavdataRoot: root })
  assert.equal((await a.loadNavdata()).publicationId, 'A')
  assert.equal((await b.loadNavdata()).publicationId, 'B')
  assert.equal(await a.loadIapData('RKPC'), null)
  assert.equal((await b.loadIapData('RKPC')).cycle, 'B')
  assert.notEqual(a.snapshotId, b.snapshotId)
  assert.equal((await a.loadNavdata()).publicationId, 'A')
})

test('build/source mismatch rejects even when the AIRAC labels match', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'amo-route-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), built = path.join(root, 'built')
  for (const dir of [source, built]) {
    await mkdir(dir)
    await writeFile(path.join(dir, 'enroute.json'), '{"publicationId":"A","points":{},"segments":[],"routes":{}}')
    await writeFile(path.join(dir, 'airports.json'), '{}')
  }
  await createFileRoutePlanningProvider({ navdataRoot: source, servedNavdataRoot: built })
  await writeFile(path.join(built, 'airports.json'), '{"RKSS":{}}')
  await assert.rejects(createFileRoutePlanningProvider({ navdataRoot: source, servedNavdataRoot: built }), { code: 'NAVDATA_BUILD_MISMATCH' })
})
