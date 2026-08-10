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

// 중기예보가 3일간 안 들어온 사건: endpointFor가 중기 경로를 몰라 null을 돌려줬고,
// 이름 없는 호출은 record에서 unknown_api_hub_endpoint로 거부됐다. 화면에는 "일부 소스 지연:
// mid_land, mid_ta"만 뜨고 원인은 안 보였다. 새 API를 붙일 때 이 표를 빠뜨리면 같은 일이 난다.
test('API Hub로 호출하는 모든 엔드포인트에 이름이 붙고, 그 이름이 허용 목록에 있다', async () => {
  const { API_HUB_ENDPOINTS } = await import('../src/api-hub-usage.js')
  const paths = [
    '/MidFcstInfoService/getMidLandFcst',
    '/MidFcstInfoService/getMidTa',
    '/VilageFcstInfoService_2.0/getVilageFcst',
    '/VilageFcstMsgService/getLandFcst',
  ]
  for (const path of paths) {
    const name = endpointFor(new URL(`https://apihub.kma.go.kr${path}?authKey=x`))
    assert.ok(name, `${path}: 이름이 안 붙었다 — 이 호출은 거부된다`)
    assert.ok(Object.hasOwn(API_HUB_ENDPOINTS, name), `${path} → ${name}: 허용 목록에 없다`)
  }
})
