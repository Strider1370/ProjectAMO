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

test('KIM field routes use immutable cache headers and ETag revalidation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-field-cache-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root

  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const tmfc = '2099010100'
  const hf = 0
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level,
    components: [
      { variable: 'T', unit: 'K', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [263.15, 263.15, 263.15, 263.15] },
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 90, 90, 90] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.2, 0.2, 0.2, 0.2] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [2e-4, 2e-4, 2e-4, 2e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.8, 0.8, 0.8, 0.8] },
    ],
    fetchedAt: '2099-01-01T00:00:00.000Z',
  })
  writeKimNwpGrid({ root, grid })
  writeKimNwpIndex(root, buildKimNwpIndex({
    model: KIM_NWP_MODEL,
    tmfc,
    entries: [buildKimNwpIndexEntry(grid, path.relative(
      root,
      resolveKimNwpGridPath({
        root,
        model: grid.model,
        tmfc: grid.tmfc,
        hf: grid.hf,
        levelId: grid.level.id,
      }),
    ).replace(/\\/g, '/'))],
  }))
  writeKimNwpLatest(root, {
    type: 'kim_nwp_latest',
    model: KIM_NWP_MODEL,
    latestRun: tmfc,
    latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }),
    indexPath: 'kim_nwp/index.json',
    updated_at: '2099-01-01T00:00:00.000Z',
    content_hash: 'test-index-hash',
  })

  const { app } = await import(`../server.js?kim-field-cache-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const url = `${baseUrl}/api/kim/icing/field?tmfc=${tmfc}&hf=${hf}&level=850hPa`
    const first = await fetch(url)
    assert.equal(first.status, 200)
    assert.match(first.headers.get('cache-control'), /public/)
    assert.match(first.headers.get('cache-control'), /immutable/)
    const etag = first.headers.get('etag')
    assert.ok(etag)

    const second = await fetch(url, { headers: { 'If-None-Match': etag } })
    assert.equal(second.status, 304)
  } finally {
    await close(server)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})
