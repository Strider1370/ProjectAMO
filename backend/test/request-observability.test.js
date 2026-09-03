import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRequestObservedApi } from '../src/lib/request-observability.js'

function operation(overrides = {}) {
  return {
    id: 'metar',
    apiHub: true,
    requestPolicy: { timeoutMs: 1_000, maxAttempts: 2, allowedOverrides: ['signal'] },
    ...overrides,
  }
}

function seams({ responses = [], error } = {}) {
  const ledger = []
  const events = []
  let calls = 0
  return {
    ledger,
    events,
    requestObservedApi: createRequestObservedApi({
      usage: {
        assertAllowed: (credential) => events.push(['allowed', credential]),
        record: async (credential, entry) => ledger.push([credential, entry]),
      },
      stats: {
        recordApiOperationStart: (id) => events.push(['start', id]),
        recordApiOperationSuccess: (id) => events.push(['success', id]),
        recordApiOperationFailure: (id, message) => events.push(['failure', id, message]),
      },
      fetchImpl: async () => {
        calls += 1
        if (error) throw error
        return responses.shift()
      },
      resolveOperation: ({ id, url }) => operation({ id, canonicalUrl: url.toString() }),
      sleep: async () => {},
    }),
    calls: () => calls,
  }
}

test('records every physical API Hub retry once and reports one final success', async () => {
  const testSeams = seams({ responses: [new Response('retry', { status: 500 }), new Response('ok', { status: 200 })] })

  const response = await testSeams.requestObservedApi({
    operation: operation(),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
    validate: (value) => assert.equal(value.status, 200),
  })

  assert.equal(await response.text(), 'ok')
  assert.equal(testSeams.calls(), 2)
  assert.deepEqual(testSeams.ledger.map(([, entry]) => [entry.status, entry.bytes, entry.endpoint]), [[500, 5, 'metar'], [200, 2, 'metar']])
  assert.deepEqual(testSeams.events.filter(([kind]) => ['start', 'success', 'failure'].includes(kind)), [['start', 'metar'], ['success', 'metar']])
})

test('retries a throttled API Hub response under the declared operation policy', async () => {
  const testSeams = seams({ responses: [new Response('slow down', { status: 429 }), new Response('ok', { status: 200 })] })

  const response = await testSeams.requestObservedApi({
    operation: operation(),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
  })

  assert.equal(response.status, 200)
  assert.deepEqual(testSeams.ledger.map(([, entry]) => entry.status), [429, 200])
})

test('records a logical validation failure once as the final operation failure', async () => {
  const testSeams = seams({ responses: [new Response('{"resultCode":"99"}', { status: 200 })] })

  await assert.rejects(() => testSeams.requestObservedApi({
    operation: operation({ requestPolicy: { timeoutMs: 1_000, maxAttempts: 1, allowedOverrides: ['signal'] } }),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
    validate: () => { throw new Error('upstream_result_code') },
  }), /upstream_result_code/)

  assert.deepEqual(testSeams.ledger.map(([, entry]) => [entry.status, entry.bytes]), [[200, 19]])
  assert.deepEqual(testSeams.events.filter(([kind]) => ['start', 'success', 'failure'].includes(kind)), [['start', 'metar'], ['failure', 'metar', 'upstream_result_code']])
})

test('records every retried transport failure as a zero-byte physical API Hub attempt', async () => {
  const testSeams = seams({ error: new Error('socket_timeout') })

  await assert.rejects(() => testSeams.requestObservedApi({
    operation: operation({ requestPolicy: { timeoutMs: 1_000, maxAttempts: 1, allowedOverrides: ['signal'] } }),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
  }), /socket_timeout/)

  assert.deepEqual(testSeams.ledger.map(([, entry]) => [entry.status, entry.bytes]), [[0, 0], [0, 0]])
  assert.deepEqual(testSeams.events.filter(([kind]) => ['start', 'success', 'failure'].includes(kind)), [['start', 'metar'], ['failure', 'metar', 'socket_timeout']])
})

test('rejects options not declared by the operation request policy before transport', async () => {
  const testSeams = seams({ responses: [new Response('unused')] })

  await assert.rejects(() => testSeams.requestObservedApi({
    operation: operation(),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
    options: { headers: { 'x-unapproved': 'value' } },
  }), { code: 'api_operation_override_not_allowed' })

  assert.equal(testSeams.calls(), 0)
  assert.equal(testSeams.ledger.length, 0)
})

test('does not count a budget-blocked API Hub request as a physical attempt', async () => {
  const ledger = []
  const events = []
  const requestObservedApi = createRequestObservedApi({
    usage: {
      assertAllowed: () => { const error = new Error('api_hub_budget_blocked'); error.code = 'api_hub_budget_blocked'; throw error },
      record: async (...args) => ledger.push(args),
    },
    stats: {
      recordApiOperationStart: (id) => events.push(['start', id]),
      recordApiOperationSuccess: (id) => events.push(['success', id]),
      recordApiOperationFailure: (id, message) => events.push(['failure', id, message]),
    },
    fetchImpl: async () => assert.fail('blocked request must not reach transport'),
  })

  await assert.rejects(() => requestObservedApi({
    operation: operation({ requestPolicy: { timeoutMs: 1_000, maxAttempts: 1, allowedOverrides: ['signal'] } }),
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
  }), { code: 'api_hub_budget_blocked' })

  assert.equal(ledger.length, 0)
  assert.deepEqual(events.filter(([kind]) => ['start', 'success', 'failure'].includes(kind)), [['start', 'metar'], ['failure', 'metar', 'api_hub_budget_blocked']])
})

test('requires the registry to resolve the operation id against the request URL before transport', async () => {
  let transportCalls = 0
  const requestObservedApi = createRequestObservedApi({
    resolveOperation: () => { const error = new Error('api_operation_id_url_mismatch'); error.code = 'api_operation_id_url_mismatch'; throw error },
    usage: { assertAllowed() {}, record: async () => {} },
    stats: { recordApiOperationStart() {}, recordApiOperationSuccess() {}, recordApiOperationFailure() {} },
    fetchImpl: async () => { transportCalls += 1; return new Response('unexpected') },
  })

  await assert.rejects(() => requestObservedApi({
    operation: { id: 'metar' },
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf?authKey=secret',
  }), { code: 'api_operation_id_url_mismatch' })
  assert.equal(transportCalls, 0)
})

test('aborts immediately while waiting between wrapper retries', async () => {
  const controller = new AbortController()
  let calls = 0
  const requestObservedApi = createRequestObservedApi({
    resolveOperation: ({ id }) => operation({ id, requestPolicy: { timeoutMs: 1_000, maxAttempts: 2, retryDelayMs: 100, allowedOverrides: ['signal'] } }),
    usage: { assertAllowed() {}, record: async () => {} },
    stats: { recordApiOperationStart() {}, recordApiOperationSuccess() {}, recordApiOperationFailure() {} },
    fetchImpl: async () => { calls += 1; throw new Error('upstream_unavailable') },
  })

  const request = requestObservedApi({
    operation: 'metar',
    url: 'https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?authKey=secret',
    options: { signal: controller.signal },
  })
  setTimeout(() => controller.abort(new Error('collection_cancelled')), 10)

  await assert.rejects(request, /collection_cancelled/)
  assert.equal(calls, 1)
})
