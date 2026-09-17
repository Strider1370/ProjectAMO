import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

function writeLatest(root, type, payload) {
  const dir = path.join(root, type)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'latest.json'),
    JSON.stringify({ type, content_hash: `${type}-hash`, updated_at: '2099-01-01T00:00:00.000Z', ...payload }),
    'utf8',
  )
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

let sharedServer = null
let sharedBaseUrl = null
let sharedRoot = null

async function getServerBaseUrl() {
  if (sharedBaseUrl) return sharedBaseUrl
  sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'api-cache-policy-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = sharedRoot
  writeLatest(sharedRoot, 'metar', { items: [{ icao: 'RKSI' }] })

  const { app } = await import(`../server.js?api-cache-policy-test=${Date.now()}-${Math.random()}`)
  sharedServer = await listen(app)
  sharedBaseUrl = `http://127.0.0.1:${sharedServer.address().port}`
  return sharedBaseUrl
}

test.after(async () => {
  if (sharedServer) await close(sharedServer)
  if (sharedRoot) {
    fs.rmSync(sharedRoot, { recursive: true, force: true })
    delete process.env.DATA_PATH
  }
})

test('SIGWX zoom images use revisioned static-image caching', async () => {
  const baseUrl = await getServerBaseUrl()
  const dir = path.join(sharedRoot, 'sigwx_low')
  fs.mkdirSync(dir, { recursive: true })
  for (const suffix of ['', '_standard', '_detail']) {
    for (const kind of ['fronts', 'clouds']) {
    const name = `${kind}_2026072205${suffix}.png`
    fs.writeFileSync(path.join(dir, name), 'fixture')
    const response = await fetch(`${baseUrl}/data/sigwx_low/${name}?v=zoom-v4`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /max-age=10800, immutable/)
    await response.arrayBuffer()
    }
  }
})

test('static configuration API uses revalidation cache instead of no-store', async () => {
  const baseUrl = await getServerBaseUrl()
  const first = await fetch(`${baseUrl}/api/warning-types`)
  assert.equal(first.status, 200)
  assert.match(first.headers.get('cache-control'), /no-cache/)
  assert.doesNotMatch(first.headers.get('cache-control'), /no-store/)
  const etag = first.headers.get('etag')
  assert.ok(etag)

  const second = await fetch(`${baseUrl}/api/warning-types`, { headers: { 'If-None-Match': etag } })
  assert.equal(second.status, 304)
})

test('mutable latest weather API revalidates with content-hash ETag', async () => {
  const baseUrl = await getServerBaseUrl()
  const first = await fetch(`${baseUrl}/api/metar`)
  assert.equal(first.status, 200)
  assert.match(first.headers.get('cache-control'), /no-cache/)
  assert.match(first.headers.get('cache-control'), /must-revalidate/)
  assert.doesNotMatch(first.headers.get('cache-control'), /immutable/)
  assert.doesNotMatch(first.headers.get('cache-control'), /no-store/)
  const etag = first.headers.get('etag')
  assert.ok(etag)

  const second = await fetch(`${baseUrl}/api/metar`, { headers: { 'If-None-Match': etag } })
  assert.equal(second.status, 304)
})

test('unallowlisted API responses keep no-store default', async () => {
  const baseUrl = await getServerBaseUrl()
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.deepEqual((await response.json()).capabilities, { testMutations: false })
})
