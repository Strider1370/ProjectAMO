import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { createFetchApiHub, endpointFor } from '../src/lib/fetch-api-hub.js'

test('classifies every direct KMA API Hub collector endpoint without using its query text as a label', () => {
  assert.equal(endpointFor(new URL('https://apihub.kma.go.kr/api/typ01/url/amos.php?authKey=secret')), 'amos')
  assert.equal(endpointFor(new URL('https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api?authKey=secret')), 'sfc_vis')
  assert.equal(endpointFor(new URL('https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B/IR105/KO/data?authKey=secret')), 'satellite_ir')
})

test('records exact response bytes and returns a readable replacement response', async (t) => {
  const calls = []
  const fetchApiHub = createFetchApiHub({
    usage: {
      assertAllowed: () => {},
      record: async (...args) => calls.push(args),
    },
    fetchImpl: async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  })

  const response = await fetchApiHub({ credential: 'key', url: 'https://apihub.kma.go.kr/example', endpoint: 'metar' })
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3])
  assert.deepEqual(calls, [['key', { bytes: 3, status: 200, endpoint: 'metar' }]])
})

test('does not open a network request after usage guard blocks the credential', async (t) => {
  const fetchImpl = mock.fn(async () => new Response('unexpected'))
  const fetchApiHub = createFetchApiHub({
    usage: { assertAllowed: () => { const error = new Error('blocked'); error.code = 'api_hub_budget_blocked'; throw error }, record: async () => {} },
    fetchImpl,
  })

  await assert.rejects(() => fetchApiHub({ credential: 'key', url: 'https://apihub.kma.go.kr/example', endpoint: 'metar' }), { code: 'api_hub_budget_blocked' })
  assert.equal(fetchImpl.mock.callCount(), 0)
})

test('records a KMA 403 response before returning it to the caller', async () => {
  const calls = []
  const fetchApiHub = createFetchApiHub({
    usage: { assertAllowed: () => {}, record: async (...args) => calls.push(args) },
    fetchImpl: async () => new Response('forbidden', { status: 403 }),
  })

  const response = await fetchApiHub({ credential: 'key', url: 'https://apihub.kma.go.kr/example', endpoint: 'metar' })
  assert.equal(response.status, 403)
  assert.deepEqual(calls, [['key', { bytes: 9, status: 403, endpoint: 'metar' }]])
})
