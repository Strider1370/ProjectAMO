import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-collection-publication-'))
process.env.NODE_ENV = 'test'
process.env.DATA_PATH = root

const [{ default: config }, { default: store }, { default: apiClient }, { default: metarParser }, { default: tafParser }, { default: metarProcessor }, { default: tafProcessor }, { default: warningProcessor }, { collectionResult }, { runWithLock }, { app }] = await Promise.all([
  import('../src/config.js'),
  import('../src/store.js'),
  import('../src/api-client.js'),
  import('../src/parsers/metar-parser.js'),
  import('../src/parsers/taf-parser.js'),
  import('../src/processors/metar-processor.js'),
  import('../src/processors/taf-processor.js'),
  import('../src/processors/warning-processor.js'),
  import('../src/collector-execution.js'),
  import('../src/index.js'),
  import('../server.js'),
])

const originals = {
  airports: config.airports,
  fetch: apiClient.fetch,
  metarParse: metarParser.parse,
  tafParse: tafParser.parse,
}

function listen() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

function etagFor(hash) {
  return `"${crypto.createHash('sha256').update(String(hash)).digest('hex')}"`
}

test.after(() => {
  config.airports = originals.airports
  apiClient.fetch = originals.fetch
  metarParser.parse = originals.metarParse
  tafParser.parse = originals.tafParse
  delete process.env.DATA_PATH
  fs.rmSync(root, { recursive: true, force: true })
})

test('METAR partial failure publishes stale prior data, but parse-null total failure preserves publication and ETag', async () => {
  config.airports = [{ icao: 'RKSI' }, { icao: 'RKSS' }]
  store.save('metar', {
    type: 'METAR',
    fetched_at: '2026-09-12T00:00:00.000Z',
    airports: {
      RKSI: { header: { icao: 'RKSI', marker: 'old-rksi' } },
      RKSS: { header: { icao: 'RKSS', marker: 'old-rkss' } },
    },
  })

  apiClient.fetch = async (_type, icao) => icao
  metarParser.parse = (icao) => (icao === 'RKSI' ? { header: { icao: 'RKSI', marker: 'fresh-rksi' } } : null)
  const partial = await metarProcessor.processAll()
  assert.equal(partial.collection.outcome, 'partial')
  assert.deepEqual(partial.failedAirports, ['RKSS'])
  const partialLatest = JSON.parse(fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8'))
  assert.equal(partialLatest.airports.RKSI.header.marker, 'fresh-rksi')
  assert.equal(partialLatest.airports.RKSS.header.marker, 'old-rkss')
  assert.equal(partialLatest.airports.RKSS._stale, true)

  const historyBefore = fs.readdirSync(path.join(root, 'metar')).filter((name) => name !== 'latest.json').sort()
  const latestBefore = fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8')
  const hashBefore = partialLatest.content_hash
  const server = await listen()
  try {
    const first = await fetch(`http://127.0.0.1:${server.address().port}/api/metar`)
    assert.equal(first.headers.get('etag'), etagFor(hashBefore))

    metarParser.parse = () => null
    const failed = await metarProcessor.processAll()
    assert.equal(failed.collection.outcome, 'failed')
    assert.equal(failed.saved, false)
    assert.deepEqual(failed.failedAirports, ['RKSI', 'RKSS'])

    const latestAfter = fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8')
    assert.equal(latestAfter, latestBefore)
    assert.deepEqual(fs.readdirSync(path.join(root, 'metar')).filter((name) => name !== 'latest.json').sort(), historyBefore)
    assert.equal(JSON.parse(latestAfter).content_hash, hashBefore)
    const second = await fetch(`http://127.0.0.1:${server.address().port}/api/metar`)
    assert.equal(second.headers.get('etag'), first.headers.get('etag'))
  } finally {
    await close(server)
  }
})

test('TAF parse-null total failure leaves its last-good history and hash untouched', async () => {
  config.airports = [{ icao: 'RKSI' }]
  store.save('taf', {
    type: 'TAF',
    fetched_at: '2026-09-12T00:00:00.000Z',
    airports: { RKSI: { header: { icao: 'RKSI', marker: 'old-taf' }, base: {}, change_groups: [] } },
  })
  const latestPath = path.join(root, 'taf', 'latest.json')
  const before = fs.readFileSync(latestPath, 'utf8')
  const historyBefore = fs.readdirSync(path.join(root, 'taf')).filter((name) => name !== 'latest.json').sort()
  apiClient.fetch = async () => 'invalid-taf'
  tafParser.parse = () => null

  const failed = await tafProcessor.processAll()
  assert.equal(failed.collection.outcome, 'failed')
  assert.deepEqual(failed.failedAirports, ['RKSI'])
  assert.equal(fs.readFileSync(latestPath, 'utf8'), before)
  assert.deepEqual(fs.readdirSync(path.join(root, 'taf')).filter((name) => name !== 'latest.json').sort(), historyBefore)
})

test('warning HTTP 200 error XML keeps the last usable snapshot, history, and ETag while recording a collector failure', async () => {
  store.save('warning', {
    type: 'AIRPORT_WARNINGS',
    fetched_at: '2026-09-12T00:00:00.000Z',
    airports: { RKSI: { airport_name: 'Incheon', warnings: [{ marker: 'last-good-warning' }] } },
  })
  const latestPath = path.join(root, 'warning', 'latest.json')
  const latestBefore = fs.readFileSync(latestPath, 'utf8')
  const historyBefore = fs.readdirSync(path.join(root, 'warning')).filter((name) => name !== 'latest.json').sort()
  const hashBefore = JSON.parse(latestBefore).content_hash
  const collectorEvents = []
  apiClient.fetch = async () => `<?xml version="1.0" encoding="UTF-8"?>
    <response><header><resultCode>30</resultCode><resultMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</resultMsg></header><body/></response>`
  const server = await listen()
  try {
    const first = await fetch(`http://127.0.0.1:${server.address().port}/api/warning`)
    assert.equal(first.headers.get('etag'), etagFor(hashBefore))

    const result = await runWithLock('warning', warningProcessor.process, {
      resultOutcomes: ['complete', 'partial', 'failed', 'empty'],
      stats: {
        recordStart: () => ({ run: 'warning' }),
        recordFailure: (_type, reason) => collectorEvents.push(reason),
        recordSuccess: () => collectorEvents.push('unexpected_success'),
      },
      logger: { error: () => {} },
    })
    assert.equal(result.collection.outcome, 'failed')
    assert.match(result.collection.reason, /^warning_upstream_error:30:SERVICE_KEY_IS_NOT_REGISTERED_ERROR$/)
    assert.deepEqual(collectorEvents, ['warning_upstream_error:30:SERVICE_KEY_IS_NOT_REGISTERED_ERROR'])
    assert.equal(fs.readFileSync(latestPath, 'utf8'), latestBefore)
    assert.deepEqual(fs.readdirSync(path.join(root, 'warning')).filter((name) => name !== 'latest.json').sort(), historyBefore)
    assert.equal(JSON.parse(fs.readFileSync(latestPath, 'utf8')).content_hash, hashBefore)
    const second = await fetch(`http://127.0.0.1:${server.address().port}/api/warning`)
    assert.equal(second.headers.get('etag'), first.headers.get('etag'))
  } finally {
    await close(server)
  }
})

test('only warning resultCode 03 publishes a normal empty snapshot', async () => {
  apiClient.fetch = async () => '<response><header><resultCode>03</resultCode><resultMsg>NO_DATA</resultMsg></header></response>'

  const result = await warningProcessor.process()
  assert.equal(result.collection.outcome, 'empty')
  assert.equal(result.saved, true)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'warning', 'latest.json'), 'utf8')).airports, {})
  const normalEmptyLatest = fs.readFileSync(path.join(root, 'warning', 'latest.json'), 'utf8')
  apiClient.fetch = async () => '<response><header><resultCode>00</resultCode><resultMsg>NORMAL_SERVICE</resultMsg></header><body><items/></body></response>'
  const unexpectedEmpty = await warningProcessor.process()
  assert.equal(unexpectedEmpty.collection.outcome, 'failed')
  assert.equal(fs.readFileSync(path.join(root, 'warning', 'latest.json'), 'utf8'), normalEmptyLatest)
  assert.throws(
    () => store.publishCollection('metar', collectionResult('empty', { airports: {} }, { normalEmpty: true })),
    { message: 'unsupported_collection_outcome:empty' },
  )
})

test('stale-only merge state receives its own persisted content hash', () => {
  const fresh = {
    type: 'METAR',
    fetched_at: '2026-09-12T00:00:00.000Z',
    airports: {
      RKSI: { header: { icao: 'RKSI', marker: 'stale-hash-fresh' } },
      RKSS: { header: { icao: 'RKSS', marker: 'stale-hash-prior' } },
    },
  }
  store.save('metar', fresh)
  const stale = {
    type: 'METAR',
    fetched_at: '2026-09-12T00:05:00.000Z',
    airports: {
      RKSI: { header: { icao: 'RKSI', marker: 'stale-hash-fresh' } },
      RKSS: { header: { icao: 'RKSS', marker: 'stale-hash-prior' }, _stale: true },
    },
  }
  const publication = store.save('metar', stale)
  const latest = JSON.parse(fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8'))
  assert.equal(publication.saved, true)
  assert.notEqual(latest.content_hash, fresh.content_hash)
  assert.equal(latest.airports.RKSS._stale, true)
})

test('history and latest JSON publication leave no direct-write temporary files behind', () => {
  store.save('sigmet', { fetched_at: '2026-09-12T00:00:00.000Z', items: [{ id: 'first' }] })
  store.save('sigmet', { fetched_at: '2026-09-12T00:01:00.000Z', items: [{ id: 'second' }] })
  const dir = path.join(root, 'sigmet')
  const names = fs.readdirSync(dir)
  assert.equal(names.some((name) => name.endsWith('.tmp')), false)
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
  }
})
