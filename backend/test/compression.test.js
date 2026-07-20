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
  resolveKimNwpGridPath,
  writeKimNwpGrid,
  writeKimNwpIndex,
} from '../src/processors/kim-nwp-store.js'

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

test('JSON API responses can be compressed with gzip', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-compression-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root

  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const tmfc = '2099010106'
  const hf = 0
  const bounds = { lonMin: 119, latMin: 30, lonMax: 123.083317, latMax: 34.083317, dx: 0.083333, dy: 0.083333 }
  const values = Array.from({ length: 2500 }, () => 263.15)
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level,
    components: [
      { variable: 'T', unit: 'K', level: 850, nx: 50, ny: 50, bounds, values },
      { variable: 'rh_liq', unit: '%', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 90) },
      { variable: 'w', unit: 'm/s', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 0.2) },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 2e-4) },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 0) },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 0) },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 0) },
      { variable: 'cld', unit: '1', level: 850, nx: 50, ny: 50, bounds, values: values.map(() => 0.8) },
    ],
    fetchedAt: '2099-01-01T06:00:00.000Z',
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

  const { app } = await import(`../server.js?compression-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/kim/icing/field?tmfc=${tmfc}&hf=${hf}&level=850hPa`, {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-encoding'), 'gzip')
  } finally {
    await close(server)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})
