import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildOrganizationBriefingBundle, validateOrganizationCrossSection } from '../src/organizations/briefing.js'
import { projectOrganizationAnnotations } from '../src/organizations/geometry.js'
import { writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { writeKtgCoords, writeKtgGrid } from '../src/processors/ktg-store.js'

const request = { etd: '2026-09-10T10:00:00Z', nwpTimeSelection: { baseTime: '2026-09-10T10:00:00Z' } }

test('organization NWP validation keeps an out-of-range model payload for presentation', () => {
  const result = validateOrganizationCrossSection({ request, result: {
    available: true,
    availableTimes: [{ validTime: '2026-09-09T09:00:00Z' }, { validTime: '2026-09-09T12:00:00Z' }],
    crossSection: { run: { validTime: '2026-09-09T12:00:00Z' }, levels: [] },
    turbulence: { levels: [] },
  } })
  assert.equal(result.status, 'out_of_range')
  assert.equal(result.composerInput.available, true)
  assert.equal(result.displayData.run.validTime, '2026-09-09T12:00:00Z')
})

test('organization NWP validation keeps both model payloads when KTG is out of range', () => {
  const values = [{ u: 1, v: 2, t: -5, icing: 0 }, { u: 1, v: 2, t: -5, icing: 0 }]
  const completeRequest = { ...request, plannedCruiseAltitudeFt: 10000,
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
  const result = validateOrganizationCrossSection({ request: completeRequest, result: {
    available: true,
    axis: { samples: [{ lon: 126, lat: 37 }, { lon: 127, lat: 36 }] },
    availableTimes: [{ validTime: '2026-09-10T09:00:00Z' }, { validTime: '2026-09-10T12:00:00Z' }],
    crossSection: { run: { validTime: '2026-09-10T09:00:00Z' }, levels: [{ pressure: 500, values }] },
    turbulence: { run: { validTime: '2026-09-09T12:00:00Z' }, levels: [{ values: [{ ktg: 0.2 }] }] },
  }, sourceState: { ktg: { index: { hours: [{ validTime: '2026-09-09T09:00:00Z' }, { validTime: '2026-09-09T12:00:00Z' }] } } } })
  assert.equal(result.status, 'out_of_range')
  assert.equal(result.modelStatus.kim.status, 'available')
  assert.equal(result.modelStatus.ktg.status, 'out_of_range')
  assert.equal(result.composerInput.available, true)
  assert.equal(result.composerInput.turbulence.run.validTime, '2026-09-09T12:00:00Z')
  assert.equal(result.displayData.turbulence.run.validTime, '2026-09-09T12:00:00Z')
})

test('organization NWP validation keeps valid KTG when KIM is unavailable', () => {
  const ktgRun = { tmfc: '2026091000', hf: 10, validTime: '2026-09-10T10:00:00Z' }
  const turbulence = { run: ktgRun, levels: [{ altFt: 10000, values: [{ ktg: 0.2 }, { ktg: 0.2 }] }] }
  const completeRequest = { ...request, plannedCruiseAltitudeFt: 10000,
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
  const result = validateOrganizationCrossSection({ request: completeRequest, result: {
    available: false, reason: 'kim unavailable', crossSection: null, turbulence,
    axis: { samples: [{ lon: 126, lat: 37 }, { lon: 127, lat: 36 }] },
  }, sourceState: { ktg: { latest: { tmfc: '2026091000' }, index: { hours: [ktgRun] } } } })
  assert.equal(result.modelStatus.kim.status, 'out_of_range')
  assert.equal(result.modelStatus.ktg.status, 'available')
  assert.equal(result.composerInput.available, true)
  assert.deepEqual(result.composerInput.crossSection.levels, [])
  assert.deepEqual(result.displayData.turbulence, turbulence)
})

test('organization NWP validation never calls incomplete route, sample and altitude coverage available', () => {
  const highRequest = { ...request, plannedCruiseAltitudeFt: 30000,
    routeGeometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }
  const result = validateOrganizationCrossSection({ request: highRequest, result: {
    available: true, axis: { samples: [{ lon: 0, lat: 0 }] },
    availableTimes: [{ validTime: '2026-09-10T09:00:00Z' }, { validTime: '2026-09-10T12:00:00Z' }],
    crossSection: { run: { validTime: '2026-09-10T09:00:00Z' },
      levels: [{ pressure: 850, values: [{ u: 1, v: 2, t: -5, icing: 0 }] }] },
    turbulence: { run: { tmfc: '2026091000', hf: 9, validTime: '2026-09-10T09:00:00Z' },
      levels: [{ altFt: 3000, values: [{ ktg: 0.2 }] }] },
  }, sourceState: { ktg: { latest: { tmfc: '2026091000' }, index: { hours: [
    { hf: 9, validTime: '2026-09-10T09:00:00Z' }, { hf: 12, validTime: '2026-09-10T12:00:00Z' },
  ] } } } })
  assert.equal(result.status, 'partial')
  assert.equal(result.modelStatus.kim.status, 'partial')
  assert.equal(result.modelStatus.ktg.status, 'partial')
})

test('briefing bundle retries once on a changed data context and injects explicit unavailable/NON-NOTAM inputs', async () => {
  let reads = 0
  let assertions = 0
  const composerInputs = []
  const flight = {
    id: 5, orgId: 2, version: 3, name: 'AMO5', etd: '2026-09-10T10:00:00Z', eta: '2026-09-10T12:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 17000 }, annotations: [], blocks: [], materialRefs: [],
  }
  const bundle = await buildOrganizationBriefingBundle(flight, {}, {
    terrainSampler: {}, buildVerticalProfile: () => ({ flightPlan: {} }),
    readWeatherSnapshot: () => ({ dataRoot: '/tmp', weather: { notam: { shouldNotLeak: true } },
      effectiveNowMs: Date.parse('2026-09-10T09:00:00Z'), contextRevision: `r${++reads}` }),
    loadRouteCrossSection: () => ({ available: false, reason: 'missing' }),
    composeBriefing: (_request, data) => { composerInputs.push(data); return { ok: true } },
    assertDataContextUnchanged: () => {
      assertions += 1
      if (assertions === 1) { const error = new Error('data_context_changed'); error.code = 'DATA_CONTEXT_CHANGED'; throw error }
    },
  })
  assert.equal(reads, 2)
  assert.equal(bundle.componentStatus.nwp, 'unavailable')
  assert.deepEqual(composerInputs[1].enrouteCrossSection, { available: false, crossSection: null, turbulence: null })
  assert.equal(composerInputs[1].notam, null)
  assert.deepEqual(composerInputs[1].airspaceZones, [])
  assert.equal(bundle.provenance.automaticNotamIncluded, false)
})

test('route projection preserves repeated annotation crossings', () => {
  const routeGeometry = { type: 'LineString', coordinates: [[0, 0], [3, 0], [0, 1], [3, 1]] }
  const [linked] = projectOrganizationAnnotations({ routeGeometry, annotations: [{
    id: 'a', title: '반복 교차', shapeType: 'Polygon',
    geometry: { type: 'Polygon', coordinates: [[[1, -1], [2, -1], [2, 2], [1, 2], [1, -1]]] },
    altitudeMinFt: 5000, altitudeMaxFt: 9000,
  }] })
  assert.ok(linked.distanceIntervals.length >= 3)
  assert.deepEqual(linked.altitude, { minFt: 5000, maxFt: 9000, reference: 'AMSL' })
})

test('bundle pins frame and per-level model resource revisions under its bundle id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-org-map-'))
  const kimRun = { tmfc: '2026091006', hf: 3, validTime: '2026-09-10T09:00:00Z' }
  const ktgRun = { tmfc: '2026091000', hf: 9, validTime: '2026-09-10T09:00:00Z' }
  writeKimNwpGrid({ root, grid: { model: 'KIMG/NE57', ...kimRun, level: { id: '850hPa' }, grid: { nx: 1, ny: 1 }, variables: {} } })
  writeKtgCoords({ root, ...ktgRun, coords: { ny: 1, nx: 1, lat: [37], lon: [126] } })
  writeKtgGrid({ root, grid: { ...ktgRun, altFt: 3000, ktg: [0.2] } })
  const flight = {
    id: 7, orgId: 2, version: 1, name: 'AMO7', etd: '2026-09-10T09:00:00Z', eta: '2026-09-10T10:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 10000 }, annotations: [], blocks: [], materialRefs: [],
  }
  try {
    const bundle = await buildOrganizationBriefingBundle(flight, {}, {
      terrainSampler: {}, buildVerticalProfile: () => ({ flightPlan: {} }), composeBriefing: () => ({}),
      readWeatherSnapshot: () => ({ dataRoot: root, weather: {}, effectiveNowMs: Date.parse('2026-09-10T09:00:00Z'),
        contextRevision: 'context-1', sourceRevision: 'source-1',
        sourceState: { ktg: { index: { hours: [ktgRun] } } },
        mapDataSelection: { frames: { radar: { status: 'available', revision: 'radar-sha', url: '/api/weather/frame/radar/a', bounds: [[30, 120], [40, 130]] } } } }),
      loadRouteCrossSection: () => ({ available: true, availableTimes: [kimRun],
        crossSection: { run: kimRun, levels: [{ pressure: 850, values: [{ u: 1, v: 2, t: -4, icing: 0 }] }] },
        turbulence: { run: ktgRun, levels: [{ altFt: 3000, values: [{ ktg: 0.2 }] }] } }),
    })
    assert.equal(bundle.mapDataSelection.bundleId, bundle.bundleId)
    assert.equal(bundle.mapDataSelection.frames.radar.revision, 'radar-sha')
    assert.deepEqual(bundle.mapDataSelection.models.kim.levelIds, ['850hPa'])
    assert.match(bundle.mapDataSelection.models.kim.resources.wind[0].revision, /^[a-f0-9]{64}$/)
    assert.match(bundle.mapDataSelection.models.kim.resources.temp[0].resourceId, /\/api\/kim\/temp\/field/)
    assert.match(bundle.mapDataSelection.models.kim.resources.cloud[0].resourceId, /\/api\/kim\/cloud\/field/)
    assert.match(bundle.mapDataSelection.models.kim.resources.icing[0].resourceId, /\/api\/kim\/icing\/field/)
    assert.deepEqual(bundle.mapDataSelection.models.ktg.altLevelsFt, [3000])
    assert.match(bundle.mapDataSelection.models.ktg.resources.turbulence[0].revision, /^[a-f0-9]{64}$/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('bundle joins composer hazard sourceId back to original advisory geometry', async () => {
  const geometry = { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] }
  const flight = {
    id: 8, orgId: 2, version: 1, name: 'HAZ1', etd: '2026-09-10T09:00:00Z', eta: '2026-09-10T10:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 10000 }, annotations: [], blocks: [], materialRefs: [],
  }
  const bundle = await buildOrganizationBriefingBundle(flight, {}, {
    terrainSampler: {}, buildVerticalProfile: () => ({}), loadRouteCrossSection: () => ({ available: false }),
    readWeatherSnapshot: () => ({ dataRoot: '/tmp', contextRevision: 'r', effectiveNowMs: Date.parse('2026-09-10T09:00:00Z'),
      weather: { sigmet: { items: [{ id: 'SIG-1', geometry, phenomenon_label: 'Severe icing' }] } } }),
    composeBriefing: () => ({ sections: { adverse: { hazards: [{ source: 'SIGMET', sourceId: 'SIG-1', label: 'SEV ICE' }] } } }),
  })
  const linked = bundle.linkedItems.find((item) => item.sourceId === 'SIG-1')
  assert.deepEqual(linked.geometry, geometry)
  assert.equal(linked.sourceKind, 'sigmet')
})

test('bundle id covers generated payload changes even under the same source context revision', async () => {
  let effectiveNowMs = Date.parse('2026-09-10T09:00:00Z')
  const flight = {
    id: 9, orgId: 2, version: 1, name: 'HASH1', etd: '2026-09-10T09:00:00Z', eta: '2026-09-10T10:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 10000 }, annotations: [], blocks: [], materialRefs: [],
  }
  const dependencies = {
    terrainSampler: {}, buildVerticalProfile: () => ({}), loadRouteCrossSection: () => ({ available: false }),
    composeBriefing: (_request, data) => ({ generatedFor: data.now }),
    readWeatherSnapshot: () => ({ dataRoot: '/tmp', contextRevision: 'same-context', effectiveNowMs, weather: {} }),
  }
  const first = await buildOrganizationBriefingBundle(flight, {}, dependencies)
  effectiveNowMs += 60_000
  const second = await buildOrganizationBriefingBundle(flight, {}, dependencies)
  assert.notEqual(first.bundleId, second.bundleId)
  assert.equal(first.mapDataSelection.bundleId, first.bundleId)
  assert.equal(second.mapDataSelection.bundleId, second.bundleId)
})
