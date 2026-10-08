import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'

// config를 가져오는 모듈은 import하지 않는다. 서버를 띄우기 전에 DATA_PATH를 정해야 한다.
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid, buildKimNwpIndex, buildKimNwpIndexEntry } from '../src/processors/kim-nwp-model.js'
import { buildKimNwpRunId, resolveKimNwpGridPath, writeKimNwpGrid, writeKimNwpIndex, writeKimNwpLatest } from '../src/processors/kim-nwp-store.js'

const listen = app => new Promise((resolve, reject) => {
  const server = http.createServer(app)
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server))
})
const close = server => new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))

function seed(root, { domain, tmfc, hf, temperature, nx }) {
  const level = KIM_NWP_LEVELS.find(entry => entry.id === '850hPa')
  const bounds = { lonMin: 119, latMin: 30, lonMax: 119 + 0.083333 * (nx - 1), latMax: 30, dx: 0.083333, dy: 0.083333 }
  const grid = buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc, hf, level, fetchedAt: '2099-01-01T00:00:00.000Z',
    components: [{ variable: 'T', unit: 'K', level: 850, nx, ny: 1, bounds, values: Array(nx).fill(temperature) }] })
  writeKimNwpGrid({ root, grid, domain })
  const entry = buildKimNwpIndexEntry(grid, path.relative(root, resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: '850hPa', domain })))
  writeKimNwpIndex(root, buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc, entries: [entry] }), domain)
  writeKimNwpLatest(root, { type: 'kim_nwp_latest', model: KIM_NWP_MODEL, latestRun: tmfc, latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }) }, domain)
}

test('KIM map API serves the expanded domain only when asked and keeps Korea as the default', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kim-domain-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  const tmfc = '2099010100'
  seed(root, { domain: 'kr', tmfc, hf: 0, temperature: 280, nx: 2 })
  seed(root, { domain: 'ea', tmfc, hf: 30, temperature: 250, nx: 4 })

  const { app } = await import(`../server.js?kim-domain-api-test=${Date.now()}`)
  const server = await listen(app)
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const json = async url => { const response = await fetch(`${base}${url}`); return { status: response.status, etag: response.headers.get('etag'), body: await response.json() } }

    const kr = await json('/api/kim/temp/index')
    assert.equal(kr.status, 200)
    assert.equal(kr.body.domain, 'kr')
    assert.deepEqual(kr.body.times.map(time => time.hf), [0])
    const ea = await json('/api/kim/temp/index?domain=ea')
    assert.equal(ea.status, 200)
    assert.equal(ea.body.domain, 'ea')

    const krField = await json(`/api/kim/temp/field?tmfc=${tmfc}&hf=0&level=850hPa`)
    assert.equal(krField.status, 200)
    assert.equal(krField.body.grid.nx, 2)
    const eaField = await json(`/api/kim/temp/field?domain=ea&tmfc=${tmfc}&hf=30&level=850hPa`)
    assert.equal(eaField.status, 200)
    assert.equal(eaField.body.grid.nx, 4)
    assert.notEqual(eaField.etag, krField.etag)
    // +30h는 확대 영역에만 있는 예보시각이고, 같은 회차라도 한반도 요청은 한반도 저장소만 본다.
    assert.equal((await json(`/api/kim/temp/field?tmfc=${tmfc}&hf=30&level=850hPa`)).status, 400)
    assert.equal((await json(`/api/kim/temp/field?domain=ea&tmfc=${tmfc}&hf=0&level=850hPa`)).status, 400)

    assert.equal((await json('/api/kim/temp/index?domain=xx')).status, 400)
    assert.equal((await json(`/api/kim/temp/field?domain=xx&tmfc=${tmfc}&hf=0&level=850hPa`)).status, 400)
    assert.equal((await json('/api/kim/gktg/index?domain=xx')).status, 400)
    assert.equal((await json('/api/kim/tropopause/index?domain=ea')).status, 503)
  } finally {
    await close(server)
    await rm(root, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})
