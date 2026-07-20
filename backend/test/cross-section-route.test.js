import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'

import {
  KIM_NWP_LEVELS,
  KIM_NWP_MODEL,
  buildKimNwpGrid,
} from '../src/processors/kim-nwp-model.js'
import {
  buildKimNwpRunId,
  writeKimNwpGrid,
  writeKimNwpLatest,
} from '../src/processors/kim-nwp-store.js'
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
  } finally {
    await close(server)
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
