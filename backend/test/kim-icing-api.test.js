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
  buildKimNwpIndexEntry,
  buildKimNwpIndex,
} from '../src/processors/kim-nwp-model.js'
import {
  buildKimNwpRunId,
  resolveKimNwpGridPath,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
} from '../src/processors/kim-nwp-store.js'

const BOUNDS = {
  lonMin: 119,
  latMin: 30,
  lonMax: 119.083333,
  latMax: 30.083333,
  dx: 0.083333,
  dy: 0.083333,
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

function indexEntries(grids, root) {
  return grids.map((grid) => buildKimNwpIndexEntry(grid, path.relative(root, resolveKimNwpGridPath({
    root, model: grid.model, tmfc: grid.tmfc, hf: grid.hf, levelId: grid.level.id,
  })).replace(/\\/g, '/')))
}

test('icing API exposes filtered index, field payload, invalid selection, and snapshot hash', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-icing-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root

  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const partialLevel = KIM_NWP_LEVELS.find((entry) => entry.id === '700hPa')
  const tmfc = '2099010100'
  const hf = 0
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level,
    components: [
      { variable: 'T', unit: 'K', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [263.15, 263.15, 263.15, Number.NaN] },
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 40, 95, 90] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.2, 0.2, 0.2, 0.2] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [2e-4, 2e-4, 2e-4, 2e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 5e-4, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.8, 0.8, 0.8, 0.8] },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  const partialGrid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level: partialLevel,
    components: [
      { variable: 'T', unit: 'K', level: 700, nx: 2, ny: 2, bounds: BOUNDS, values: [263.15, 263.15, 263.15, 263.15] },
      { variable: 'rh_liq', unit: '%', level: 700, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 90, 90, 90] },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  writeKimNwpGrid({ root, grid })
  writeKimNwpGrid({ root, grid: partialGrid })
  const index = buildKimNwpIndex({
    model: KIM_NWP_MODEL,
    tmfc,
    entries: indexEntries([grid, partialGrid], root),
  })
  writeKimNwpIndex(root, index)
  writeKimNwpLatest(root, {
    type: 'kim_nwp_latest',
    model: KIM_NWP_MODEL,
    latestRun: tmfc,
    latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }),
    indexPath: 'kim_nwp/index.json',
    updated_at: '2099-01-01T00:00:00.000Z',
    content_hash: 'test-index-hash',
  })

  const { app } = await import(`../server.js?kim-icing-api-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const indexResponse = await fetch(`${baseUrl}/api/kim/icing/index`)
    assert.equal(indexResponse.status, 200)
    const icingIndex = await indexResponse.json()
    assert.equal(icingIndex.type, 'kim_nwp_icing_index')
    assert.deepEqual(icingIndex.levels.map((entry) => entry.id), ['850hPa'])
    assert.equal(icingIndex.availability['700hPa'], undefined)
    assert.equal(JSON.stringify(icingIndex).includes('263.15'), false)

    const fieldResponse = await fetch(`${baseUrl}/api/kim/icing/field?tmfc=${tmfc}&hf=${hf}&level=850hPa`)
    assert.equal(fieldResponse.status, 200)
    const field = await fieldResponse.json()
    assert.equal(field.type, 'kim_nwp_icing_potential')
    assert.equal(field.variant, 'k-fip-lite')
    assert.equal(Array.isArray(field.icingScore), true)
    assert.equal(Array.isArray(field.icingGrade), true)
    assert.equal(field.u, undefined)
    assert.equal(field.v, undefined)

    const invalidResponse = await fetch(`${baseUrl}/api/kim/icing/field?tmfc=../bad&hf=0&level=../bad`)
    assert.equal(invalidResponse.status, 400)

    const snapshotResponse = await fetch(`${baseUrl}/api/snapshot-meta`)
    assert.equal(snapshotResponse.status, 200)
    assert.equal(snapshotResponse.headers.get('cache-control'), 'no-cache')
    const snapshot = await snapshotResponse.json()
    assert.equal(typeof snapshot.kimNwp.variables.icing.hash, 'string')
  } finally {
    await close(server)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})
