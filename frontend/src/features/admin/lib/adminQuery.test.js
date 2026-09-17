import assert from 'node:assert/strict'
import test from 'node:test'

import { createAdminQuerySession } from './adminQuery.js'

function response(body, { ok = true, headers = {} } = {}) {
  return { ok, headers: new Headers(headers), json: async () => body }
}

test('admin query session은 scope·증가 generation을 보내고 마지막 정상 결과를 실패 뒤에도 보존한다', async () => {
  const requests = []
  const session = createAdminQuerySession({ scope: 'page-a', fetchImpl: async (_url, init) => {
    requests.push(init)
    if (requests.length === 1) return response({ value: 'good' }, { headers: { 'X-Admin-Query-Current': 'true', 'X-Admin-Query-State': 'ready' } })
    return response({ error: 'admin_query_failed', query: { status: 'stale', stale: true, lastGood: { value: 'good' } } }, { ok: false })
  } })
  assert.equal((await session.get('/api/admin/data-health')).data.value, 'good')
  await assert.rejects(session.get('/api/admin/data-health'), (error) => {
    assert.deepEqual(error.lastGood, { value: 'good' })
    assert.equal(error.query.stale, true)
    return true
  })
  assert.equal(requests[0].headers.get('X-Admin-Request-Generation'), '1')
  assert.equal(requests[1].headers.get('X-Admin-Request-Generation'), '2')
  assert.equal(requests[0].headers.get('X-Admin-Request-Generation-Scope'), 'page-a')
})

test('admin query session은 같은 요청 키의 늦은 응답을 current로 처리하지 않는다', async () => {
  const pending = []
  const session = createAdminQuerySession({ scope: 'page-b', fetchImpl: (_url, init) => new Promise((resolve) => pending.push({ resolve, init })) })
  const first = session.get('/api/admin/metrics?range=1h')
  const second = session.get('/api/admin/metrics?range=1h')
  pending[1].resolve(response({ value: 'new' }, { headers: { 'X-Admin-Query-Current': 'true' } }))
  assert.equal((await second).query.current, true)
  pending[0].resolve(response({ value: 'old' }, { headers: { 'X-Admin-Query-Current': 'false' } }))
  assert.equal((await first).query.current, false)
})
