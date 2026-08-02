import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'
import config from '../src/config.js'

import {
  KIM_NWP_LEVELS,
  KIM_NWP_MODEL,
  buildKimNwpIndex,
  buildKimNwpIndexEntry,
  buildKimNwpGrid,
} from '../src/processors/kim-nwp-model.js'
import {
  buildKimNwpRunId,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
} from '../src/processors/kim-nwp-store.js'
import {
  writeKtgCoords,
  writeKtgGrid,
  writeKtgIndex,
  writeKtgLatest,
} from '../src/processors/ktg-store.js'
import {
  clearRouteCrossSectionCache,
  loadRouteCrossSection,
  routeCrossSectionCacheMetrics,
} from '../src/briefing/enroute-cross-section.js'

const ROUTE_GEOMETRY = {
  type: 'LineString',
  coordinates: [[126.0, 37.0], [127.0, 38.0]],
}
const BOUNDS = {
  lonMin: 124, latMin: 33, lonMax: 130, latMax: 40,
  dx: 0.083333, dy: 0.083333,
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
}

test('cross-section route validates fields and returns cross-section structure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-cross-section-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  const previousStorage = { ...config.storage }
  // The test module's static imports have already initialized config. Mutate only
  // its shared test object before importing server so the HTTP handler reads this
  // temporary fixture root rather than the repository data directory.
  config.storage.base_path = root
  config.storage.active_path = root

  const level = KIM_NWP_LEVELS.find((l) => l.id === '850hPa')
  const tmfc = '2099010100'
  const hf = 0
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL, tmfc, hf, level,
    components: [
      { variable: 'u', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(5) },
      { variable: 'v', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(0) },
      { variable: 'hgt', unit: 'm', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(1500) },
      { variable: 'cld', unit: '1', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(.72) },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  const gridPath = writeKimNwpGrid({ root, grid })
  writeKimNwpIndex(root, buildKimNwpIndex({
    model: KIM_NWP_MODEL, tmfc, entries: [buildKimNwpIndexEntry(grid, gridPath)],
  }))
  writeKimNwpLatest(root, {
    type: 'kim_nwp_latest',
    model: KIM_NWP_MODEL,
    latestRun: tmfc,
    latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }),
    indexPath: 'kim_nwp/index.json',
    updated_at: '2099-01-01T00:00:00.000Z',
    content_hash: 'test-hash',
  })

  const { app } = await import(`../server.js?cross-section-route-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`

    // missing routeGeometry → 400
    const r400 = await fetch(`${baseUrl}/api/briefing/cross-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(r400.status, 400)

    // valid request → 200 + structure
    const r200 = await fetch(`${baseUrl}/api/briefing/cross-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeGeometry: ROUTE_GEOMETRY, tmfc, hf }),
    })
    assert.equal(r200.status, 200)
    const body = await r200.json()
    assert.ok(body.run)
    assert.ok(Array.isArray(body.levels))
    assert.ok(body.coverage)
    assert.ok(body.coverage.byVariable)
    const level850 = body.levels.find(({ pressure }) => pressure === 850)
    assert.ok(level850)
    assert.ok(Math.abs(level850.values[0].cld - .72) < .001)
    assert.equal(level850.values[0].icing, null)
    assert.equal(body.coverage.byVariable.cld.threshold, .6)
    assert.equal(body.coverage.byVariable.cld.available, true)
    assert.equal(body.run.tmfc, tmfc)
    assert.equal(body.run.hf, hf)
  } finally {
    await close(server)
    Object.assign(config.storage, previousStorage)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})

test('cross-section reuses same-revision grids and clears them on latest revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-cross-section-cache-'))
  const level = KIM_NWP_LEVELS.find((l) => l.id === '850hPa')
  const tmfc = '2099010100'
  const hf = 0
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL, tmfc, hf, level,
    components: [
      { variable: 'u', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(5) },
      { variable: 'v', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(0) },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  writeKimNwpGrid({ root, grid })
  const writeLatest = (content_hash) => writeKimNwpLatest(root, {
    type: 'kim_nwp_latest', model: KIM_NWP_MODEL, latestRun: tmfc,
    latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }),
    indexPath: 'kim_nwp/index.json', updated_at: '2099-01-01T00:00:00.000Z', content_hash,
  })

  clearRouteCrossSectionCache()
  try {
    writeLatest('revision-a')
    const first = loadRouteCrossSection({ root, routeGeometry: ROUTE_GEOMETRY, body: { tmfc, hf } })
    const afterFirst = routeCrossSectionCacheMetrics()
    const second = loadRouteCrossSection({ root, routeGeometry: ROUTE_GEOMETRY, body: { tmfc, hf } })
    const afterSecond = routeCrossSectionCacheMetrics()
    assert.deepEqual(second.crossSection, first.crossSection)
    assert.ok(afterSecond.kim.hits > afterFirst.kim.hits)

    writeLatest('revision-b')
    loadRouteCrossSection({ root, routeGeometry: ROUTE_GEOMETRY, body: { tmfc, hf } })
    const afterRevision = routeCrossSectionCacheMetrics()
    assert.ok(afterRevision.kim.misses > afterSecond.kim.misses)
  } finally {
    clearRouteCrossSectionCache()
    await rm(root, { recursive: true, force: true })
  }
})

test('cross-section selects KIM closest to ETD and KTG closest to the selected valid time', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-cross-section-etd-'))
  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const tmfc = '2026072200'
  const entries = []

  for (const hf of [9, 12, 30]) {
    const grid = buildKimNwpGrid({
      model: KIM_NWP_MODEL,
      tmfc,
      hf,
      level,
      components: [
        { variable: 'u', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(hf) },
        { variable: 'v', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(0) },
      ],
      fetchedAt: '2026-07-22T00:30:00.000Z',
    })
    const gridPath = writeKimNwpGrid({ root, grid })
    entries.push(buildKimNwpIndexEntry(grid, gridPath))
  }
  writeKimNwpIndex(root, buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc, entries }))
  writeKimNwpLatest(root, {
    type: 'kim_nwp_latest',
    model: KIM_NWP_MODEL,
    latestRun: tmfc,
    latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }),
    indexPath: 'kim_nwp/index.json',
    updated_at: '2026-07-22T00:30:00.000Z',
    content_hash: 'etd-selection',
  })

  const ktgTmfc = '2026072206'
  const ktgHours = [
    { hf: 0, validTime: '2026-07-22T06:00:00.000Z' },
    { hf: 3, validTime: '2026-07-22T09:00:00.000Z' },
    { hf: 6, validTime: '2026-07-22T12:00:00.000Z' },
  ]
  writeKtgIndex(root, {
    type: 'ktg_index',
    tmfc: ktgTmfc,
    hf: 0,
    validTime: ktgHours[0].validTime,
    hours: ktgHours,
    altLevelsFt: [3000],
    fetched_at: '2026-07-22T06:30:00.000Z',
  })
  writeKtgLatest(root, {
    type: 'ktg_latest',
    tmfc: ktgTmfc,
    hf: 0,
    validTime: ktgHours[0].validTime,
    updated_at: '2026-07-22T06:30:00.000Z',
  })
  writeKtgCoords({
    root,
    tmfc: ktgTmfc,
    hf: 3,
    coords: { type: 'ktg_coords', ny: 1, nx: 1, lat: [37], lon: [126] },
  })
  writeKtgGrid({
    root,
    grid: {
      type: 'ktg_grid',
      tmfc: ktgTmfc,
      hf: 3,
      validTime: ktgHours[1].validTime,
      altFt: 3000,
      grid: { ny: 1, nx: 1 },
      ktg: [0.5],
    },
  })

  clearRouteCrossSectionCache()
  try {
    const result = loadRouteCrossSection({
      root,
      routeGeometry: ROUTE_GEOMETRY,
      body: { etd: '2026-07-22T10:00:00.000Z' },
    })

    assert.deepEqual(result.crossSection.run, {
      tmfc,
      hf: 9,
      validTime: '2026-07-22T09:00:00.000Z',
    })
    assert.deepEqual(result.turbulence.run, {
      tmfc: ktgTmfc,
      hf: 3,
      validTime: '2026-07-22T09:00:00.000Z',
    })
    assert.equal(result.turbulence.available, true)
  } finally {
    clearRouteCrossSectionCache()
    await rm(root, { recursive: true, force: true })
  }
})
