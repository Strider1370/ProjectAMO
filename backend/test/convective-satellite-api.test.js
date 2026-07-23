import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { CTPS_GRID, ctpsIndexForLatLon } from '../src/lib/ctps-grid.js'
import { CTPS_INVALID_HEIGHT, CTPS_INVALID_QUALITY, CTPS_INVALID_TEMPERATURE, encodeCtpsBinary } from '../src/processors/convective-satellite-model.js'

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'convective-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  const dir = path.join(root, 'satellite', 'convective')
  fs.mkdirSync(dir, { recursive: true })
  const tm = '202607231200'
  const heightFt = new Uint32Array(CTPS_GRID.width * CTPS_GRID.height).fill(CTPS_INVALID_HEIGHT)
  const temperatureCentiC = new Int16Array(CTPS_GRID.width * CTPS_GRID.height).fill(CTPS_INVALID_TEMPERATURE)
  const quality = new Uint8Array(CTPS_GRID.width * CTPS_GRID.height).fill(CTPS_INVALID_QUALITY)
  const index = ctpsIndexForLatLon(37.5, 127)
  heightFt[index] = 25000; temperatureCentiC[index] = -350; quality[index] = 0
  fs.writeFileSync(path.join(dir, 'ctps_' + tm + '.bin'), encodeCtpsBinary({ attrs: CTPS_GRID, heightFt, temperatureCentiC, quality }))
  fs.writeFileSync(path.join(dir, 'convective_meta.json'), JSON.stringify({ type: 'SATELLITE_CONVECTIVE', tm, frames: [{ tm, request_tm_utc: '202607230300', ctps: { images: { all: '/data/satellite/convective/ctps_202607231200_all.webp' } } }] }))
  const mod = await import('../server.js?convective-api-test=' + Date.now())
  server = await listen(mod.app)
})

test.after(() => {
  server?.close()
  fs.rmSync(root, { recursive: true, force: true })
  delete process.env.DATA_PATH
})

test('CTPS point API validates, filters, and hides server binary', async () => {
  const base = 'http://127.0.0.1:' + server.address().port
  const valid = await fetch(base + '/api/satellite/convective/ctps-point?tm=202607231200&lat=37.5&lon=127&minFl=200')
  assert.equal(valid.status, 200)
  assert.match(valid.headers.get('cache-control'), /immutable/)
  assert.deepEqual(await valid.json(), { tm: '202607231200', observedAt: '2026-07-23T03:00:00.000Z', heightFt: 25000, fl: 250, temperatureC: -3.5, qualityCode: 0, quality: 'normal' })
  assert.equal((await fetch(base + '/api/satellite/convective/ctps-point?tm=x&lat=37.5&lon=127&minFl=all')).status, 400)
  assert.equal((await fetch(base + '/api/satellite/convective/ctps-point?tm=202607231210&lat=37.5&lon=127&minFl=all')).status, 404)
  assert.equal((await fetch(base + '/api/satellite/convective/ctps-point?tm=202607231200&lat=37.5&lon=127&minFl=300')).status, 404)
  assert.equal((await fetch(base + '/data/satellite/convective/ctps_202607231200.bin')).status, 404)
})
