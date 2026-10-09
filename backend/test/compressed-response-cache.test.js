import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

import { createCompressedResponseCache, sendCompressedJson } from '../src/lib/compressed-response-cache.js'

test('builds each key once, keeps recent entries within the byte limit, and serves gzip or plain JSON', () => {
  let builds = 0
  const cache = createCompressedResponseCache({ maxBytes: 200 })
  const payload = (n) => () => { builds++; return { n, values: Array.from({ length: 20 }, (_, i) => i * n) } }
  const first = cache.get('a', payload(1))
  assert.equal(cache.get('a', payload(1)), first)
  assert.equal(builds, 1)
  assert.deepEqual(JSON.parse(zlib.gunzipSync(first.gzip)).n, 1)
  for (const key of ['b', 'c', 'd', 'e']) cache.get(key, payload(key.charCodeAt(0)))
  assert.ok(cache.bytes <= 200)
  cache.get('a', payload(1))
  assert.equal(builds, 6) // 'a'는 상한 때문에 밀려나 다시 만든다
  assert.throws(() => cache.get('bad', () => { throw new Error('read failed') }))
  assert.equal(cache.get('bad', () => ({ ok: true })).gzip.length > 0, true)

  const headers = {}
  const sent = []
  const res = { setHeader: (k, v) => { headers[k] = v }, end: (body) => sent.push(body) }
  sendCompressedJson({ headers: { 'accept-encoding': 'gzip, br' } }, res, first)
  assert.equal(headers['Content-Encoding'], 'gzip')
  assert.equal(sent[0], first.gzip)
  sendCompressedJson({ headers: {} }, res, first)
  assert.equal(JSON.parse(sent[1]).n, 1)
})
