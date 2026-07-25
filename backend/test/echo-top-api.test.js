import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'
import { ECHO_TOP_QUALITY, encodeEchoTopBinary } from '../src/processors/echo-top-model.js'

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

let root
let server

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  process.env.DISABLE_COLLECTION = '1'

  const dir = path.join(root, 'radar', 'echotop')
  fs.mkdirSync(dir, { recursive: true })

  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  const siteIndex = new Uint8Array(size).fill(255)
  const index = echoTopIndexForLatLon(37.5, 127.0)
  heightM[index] = 9327; quality[index] = ECHO_TOP_QUALITY.INTERPOLATED; siteIndex[index] = 0

  fs.writeFileSync(path.join(dir, 'echotop_202607252035.bin'), encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid: ECHO_TOP_GRID }))
  fs.writeFileSync(path.join(dir, 'echotop_202607252035.webp'), Buffer.from('webp'))
  fs.writeFileSync(path.join(dir, 'echotop_meta.json'), JSON.stringify({
    type: 'RADAR_ECHO_TOP', tm: '202607252035', threshold_dbz: 18, reference: 'MSL',
    frames: [{ tm: '202607252035', observedAt: '2026-07-25T11:35:00.000Z', path: '/data/radar/echotop/echotop_202607252035.webp', sites: [{ stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' }], siteCount: { ok: 1, total: 1 } }],
  }))

  const mod = await import('../server.js?echotop-api-test=' + Date.now())
  server = await listen(mod.app)
})

test.after(() => {
  server?.close()
  fs.rmSync(root, { recursive: true, force: true })
  delete process.env.DATA_PATH
  delete process.env.DISABLE_COLLECTION
})

function get(pathname) {
  const { port } = server.address()
  return fetch(`http://127.0.0.1:${port}${pathname}`)
}

test('point query returns FL, feet and the interpolation state', async () => {
  const response = await get('/api/radar/echo-top-point?tm=202607252035&lat=37.5&lon=127.0')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.heightM, 9327)
  assert.equal(body.fl, 306)
  assert.equal(body.quality, 'interpolated')
  assert.equal(body.threshold_dbz, 18)
  assert.equal(body.reference, 'MSL')
  assert.equal(body.observedAt, '2026-07-25T11:35:00.000Z')
  assert.equal(body.site, 'AAA')
})

test('a cell without an echo top is 404, not a fabricated value', async () => {
  const response = await get('/api/radar/echo-top-point?tm=202607252035&lat=33.0&lon=126.0')
  assert.equal(response.status, 404)
})

test('a malformed query is rejected', async () => {
  assert.equal((await get('/api/radar/echo-top-point?tm=nope&lat=37.5&lon=127.0')).status, 400)
  assert.equal((await get('/api/radar/echo-top-point?tm=202607252035&lat=999&lon=127.0')).status, 400)
})

test('an unknown frame is 404', async () => {
  assert.equal((await get('/api/radar/echo-top-point?tm=202607252000&lat=37.5&lon=127.0')).status, 404)
})

test('the raw composite binary is never served to the browser', async () => {
  assert.equal((await get('/data/radar/echotop/echotop_202607252035.bin')).status, 404)
  assert.equal((await get('/data/radar/echotop/echotop_202607252035.webp')).status, 200)
})

test('the meta endpoint serves the published frame list', async () => {
  const body = await (await get('/api/radar/echo-top-meta')).json()
  assert.equal(body.tm, '202607252035')
})
