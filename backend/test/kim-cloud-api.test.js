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

test('cloud API exposes filtered index, field payload, invalid selection, and snapshot hash', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-cloud-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root

  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const upperLevel = KIM_NWP_LEVELS.find((entry) => entry.id === '300hPa')
  const tmfc = '2099010100'
  const hf = 0
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level,
    components: [
      { variable: 'T', unit: 'K', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [293.15, 293.15, 293.15, Number.NaN] },
      { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 60, 100, 80] },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  const upperGrid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level: upperLevel,
    components: [
      { variable: 'T', unit: 'K', level: 300, nx: 2, ny: 2, bounds: BOUNDS, values: [230, 231, 232, 233] },
      { variable: 'rh', unit: '%', level: 300, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 90, 90, 90] },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  writeKimNwpGrid({ root, grid })
  writeKimNwpGrid({ root, grid: upperGrid })
  const index = buildKimNwpIndex({
    model: KIM_NWP_MODEL,
    tmfc,
    entries: indexEntries([grid, upperGrid], root),
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

  const { app } = await import(`../server.js?kim-cloud-api-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const cloudIndexResponse = await fetch(`${baseUrl}/api/kim/cloud/index`)
    assert.equal(cloudIndexResponse.status, 200)
    const cloudIndex = await cloudIndexResponse.json()
    assert.equal(cloudIndex.type, 'kim_nwp_cloud_index')
    assert.deepEqual(cloudIndex.levels.map((entry) => entry.id), ['850hPa', '300hPa'])
    assert.deepEqual(cloudIndex.availability['300hPa']['0'].variables, ['T', 'rh'])
    assert.deepEqual(cloudIndex.availability['850hPa']['0'].variables, ['T', 'rh'])
    assert.equal(JSON.stringify(cloudIndex).includes('293.15'), false)

    const fieldResponse = await fetch(`${baseUrl}/api/kim/cloud/field?tmfc=${tmfc}&hf=${hf}&level=850hPa`)
    assert.equal(fieldResponse.status, 200)
    const field = await fieldResponse.json()
    assert.equal(field.type, 'kim_nwp_cloud_potential')
    assert.deepEqual(field.units, { spread: 'C', cloudPotential: '%' })
    assert.equal(Array.isArray(field.spread), true)
    assert.equal(Array.isArray(field.cloudPotential), true)
    assert.equal(field.T, undefined)
    assert.equal(field.rh, undefined)

    const invalidResponse = await fetch(`${baseUrl}/api/kim/cloud/field?tmfc=../bad&hf=0&level=../bad`)
    assert.equal(invalidResponse.status, 400)

    const snapshotResponse = await fetch(`${baseUrl}/api/snapshot-meta`)
    assert.equal(snapshotResponse.status, 200)
    const snapshot = await snapshotResponse.json()
    assert.equal(typeof snapshot.kimNwp.variables.cloud.hash, 'string')
  } finally {
    await close(server)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})
