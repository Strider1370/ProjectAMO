import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createOrganizationWeatherDependencies } from '../src/briefing/organization-runtime.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid, writeKimNwpLatest } from '../src/processors/kim-nwp-store.js'
import { writeKtgCoords, writeKtgGrid, writeKtgIndex, writeKtgLatest } from '../src/processors/ktg-store.js'
import { buildOrganizationBriefingBundle } from '../src/organizations/briefing.js'

test('same-run grid replacement invalidates organization cross-section cache and in-flight context', () => {
  fs.mkdirSync('artifacts', { recursive: true })
  const root = fs.mkdtempSync(path.resolve('artifacts/organization-runtime-'))
  const level = KIM_NWP_LEVELS.find(value => value.id === '850hPa')
  const tmfc = '2026091000'
  const write = u => writeKimNwpGrid({ root, grid: buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc, hf: 0, level,
    components: ['u', 'v', 'hgt'].map(variable => ({ variable, unit: variable === 'hgt' ? 'm' : 'm/s', level: 850, nx: 2, ny: 2,
      bounds: { lonMin: 126, lonMax: 127, latMin: 35, latMax: 36, dx: 1, dy: 1 }, values: Array(4).fill(variable === 'u' ? u : variable === 'hgt' ? 1500 : 0) })),
  }) })
  try {
    write(5)
    writeKimNwpLatest(root, { model: KIM_NWP_MODEL, latestRun: tmfc, content_hash: 'metadata-is-unchanged' })
    const deps = createOrganizationWeatherDependencies({ dataRoot: root, readWeather: () => null, getDataContext: () => ({ mode: 'live', revision: 'same-context' }), getNow: () => new Date('2026-09-10T00:00:00Z'), terrainSampler: {} })
    const args = { root, routeGeometry: { type: 'LineString', coordinates: [[126, 35], [127, 36]] }, body: { etd: '2026-09-10T00:00:00Z', hf: 0 } }
    const snapshot = deps.readWeatherSnapshot()
    assert.equal(deps.loadRouteCrossSection(args).crossSection.levels[0].values[0].u, 5)
    write(9)
    assert.throws(() => deps.assertDataContextUnchanged(snapshot.contextRevision), /data_context_changed/)
    assert.equal(deps.loadRouteCrossSection(args).crossSection.levels[0].values[0].u, 9)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('actual KTG-only files survive the runtime loader and organization bundle boundary', async () => {
  fs.mkdirSync('artifacts', { recursive: true })
  const root = fs.mkdtempSync(path.resolve('artifacts/organization-ktg-only-'))
  const tmfc = '2026091000'
  try {
    for (const hf of [9, 12]) {
      writeKtgCoords({ root, tmfc, hf, coords: { ny: 2, nx: 2, lat: [35, 35, 36, 36], lon: [126, 127, 126, 127] } })
      for (const altFt of [3000, 6000]) writeKtgGrid({ root, grid: { tmfc, hf, altFt, validTime: `2026-09-10T${String(hf).padStart(2, '0')}:00:00Z`, ktg: [.2, .2, .2, .2] } })
    }
    writeKtgIndex(root, { tmfc, hours: [9, 12].map(hf => ({ hf, validTime: `2026-09-10T${String(hf).padStart(2, '0')}:00:00Z` })), altLevelsFt: [3000, 6000] })
    writeKtgLatest(root, { tmfc, hf: 9, validTime: '2026-09-10T09:00:00Z' })
    const deps = createOrganizationWeatherDependencies({ dataRoot: root, readWeather: () => null, getDataContext: () => ({ mode: 'live', revision: 'test' }), getNow: () => new Date('2026-09-10T09:00:00Z'), terrainSampler: {} })
    const flight = { id: 1, orgId: 1, version: 1, name: 'KTG-only', etd: '2026-09-10T09:00:00Z', eta: '2026-09-10T09:30:00Z', snapshot: { routeGeometry: { type: 'LineString', coordinates: [[126.1, 35.1], [126.5, 35.5]] }, cruiseAltitudeFt: 3500 }, profileRequest: { plannedCruiseAltitudeFt: 3500 }, annotations: [] }
    const bundle = await buildOrganizationBriefingBundle(flight, {}, { ...deps, buildVerticalProfile: () => ({}), composeBriefing: () => ({}) })
    assert.ok(['available', 'partial'].includes(bundle.componentStatus.models.ktg.status), JSON.stringify(bundle.componentStatus))
    assert.ok(['unavailable', 'out_of_range'].includes(bundle.componentStatus.models.kim.status))
    assert.ok(bundle.crossSection.turbulence.levels.length > 0)
    assert.equal(bundle.mapDataSelection.models.ktg.tmfc, tmfc)
    const outside = await buildOrganizationBriefingBundle({ ...flight, snapshot: { ...flight.snapshot, routeGeometry: { type: 'LineString', coordinates: [[0, 0], [.1, .1]] } } }, {}, { ...deps, buildVerticalProfile: () => ({}), composeBriefing: () => ({}) })
    assert.equal(outside.componentStatus.models.ktg.status, 'unavailable')
    assert.equal(outside.crossSection?.turbulence?.levels?.length ?? 0, 0)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
