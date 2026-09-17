import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createAdminQueryState } from '../src/admin/query-state.js'

function fixture() {
  let tick = 0
  return createAdminQueryState({ now: () => `2026-09-12T00:00:0${++tick}.000Z` })
}

test('admin query state: 정상 뒤 실패는 마지막 정상 payload를 stale/error와 함께 보존한다', () => {
  const state = fixture()
  const first = state.begin({ endpoint: 'metrics', requestKey: 'metrics?range=24h', requestGeneration: 1 })
  assert.equal(state.succeed(first, { current: { cpuPct: 12 } }).status, 'ready')

  const retry = state.begin({ endpoint: 'metrics', requestKey: 'metrics?range=24h', requestGeneration: 2 })
  const failed = state.fail(retry, new Error('db unavailable'))
  assert.deepEqual(failed.lastGood, { current: { cpuPct: 12 } })
  assert.equal(failed.status, 'stale')
  assert.equal(failed.stale, true)
  assert.equal(failed.error.code, 'admin_query_failed')
  assert.equal(failed.lastSuccessAt, '2026-09-12T00:00:01.000Z')
})

test('admin query state: 첫 실패는 빈 정상 상태나 lastGood으로 위장하지 않는다', () => {
  const state = fixture()
  const request = state.begin({ endpoint: 'traffic', requestKey: 'traffic', requestGeneration: 1 })
  const failed = state.fail(request, new Error('db unavailable'))
  assert.equal(failed.status, 'error')
  assert.equal(failed.stale, false)
  assert.equal('lastGood' in failed, false)
  assert.equal(failed.lastSuccessAt, null)
})

test('admin query state: 늦게 끝난 이전 A 요청은 최신 B 결과를 덮지 못한다', () => {
  const state = fixture()
  const a = state.begin({ endpoint: 'trends', requestKey: 'trends?granularity=week', requestGeneration: 41 })
  const b = state.begin({ endpoint: 'trends', requestKey: 'trends?granularity=week', requestGeneration: 42 })
  assert.equal(state.succeed(b, { granularity: 'week', value: 'B' }).current, true)

  const staleA = state.succeed(a, { granularity: 'week', value: 'A' })
  assert.equal(staleA.current, false)
  assert.deepEqual(state.inspect({ endpoint: 'trends', requestKey: 'trends?granularity=week' }).lastGood, { granularity: 'week', value: 'B' })
})

test('admin query state: 새 browser scope의 낮은 generation은 이전 scope의 최신값에 막히지 않는다', () => {
  const state = fixture()
  const oldScope = state.begin({ endpoint: 'metrics', requestKey: 'metrics', requestGeneration: 42, requestScope: 'page-before-restart' })
  state.succeed(oldScope, { value: 'old' })

  const newScopeA = state.begin({ endpoint: 'metrics', requestKey: 'metrics', requestGeneration: 1, requestScope: 'page-after-restart' })
  const newScopeB = state.begin({ endpoint: 'metrics', requestKey: 'metrics', requestGeneration: 2, requestScope: 'page-after-restart' })
  assert.equal(state.succeed(newScopeB, { value: 'new-B' }).current, true)
  assert.equal(state.succeed(newScopeA, { value: 'new-A' }).current, false, '같은 scope의 늦은 A는 B를 덮지 못한다')
  assert.deepEqual(state.inspect({ endpoint: 'metrics', requestKey: 'metrics', requestScope: 'page-after-restart' }).lastGood, { value: 'new-B' })
  assert.deepEqual(state.inspect({ endpoint: 'metrics', requestKey: 'metrics', requestScope: 'page-before-restart' }).lastGood, { value: 'old' })
})

test('admin query state: 회복 성공은 이전 error/stale 상태를 지운다', () => {
  const state = fixture()
  const good = state.begin({ endpoint: 'data-health', requestKey: 'data-health', requestGeneration: 1 })
  state.succeed(good, { rows: ['good'] })
  const bad = state.begin({ endpoint: 'data-health', requestKey: 'data-health', requestGeneration: 2 })
  state.fail(bad, new Error('temporary'))

  const recovered = state.begin({ endpoint: 'data-health', requestKey: 'data-health', requestGeneration: 3 })
  const result = state.succeed(recovered, { rows: ['recovered'] })
  assert.equal(result.status, 'ready')
  assert.equal(result.stale, false)
  assert.equal(result.error, null)
  assert.deepEqual(state.inspect({ endpoint: 'data-health', requestKey: 'data-health' }).lastGood, { rows: ['recovered'] })
})
