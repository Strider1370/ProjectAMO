import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { createAiRouter } from '../src/ai/router.js'

async function start(options = {}) {
  const app = express()
  app.use((req, _res, next) => { if (req.headers['x-test-user']) req.session = { userId: req.headers['x-test-user'] }; next() })
  app.use('/api/ai', createAiRouter({ enabled: true, provider: { async complete() { return { text: '확인할 공항을 알려주세요.', usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 } } } },
    executor: { async registerContext(_input, owner) { return { status: 'ok', owner } }, async getResult(_ref, owner) { return { status: 'ok', owner } } }, ...options }))
  const server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { async request(path, body, headers = {}) {
    const response = await fetch(`${origin}/api/ai${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, 'x-test-user': 'alice', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r) }) }
}

test('authenticated chat lifecycle, owner isolation, origin, payload limits and feature gates', async () => {
  const api = await start()
  try {
    assert.equal((await api.request('/status')).body.ready, true)
    assert.equal((await api.request('/conversations', {}, { 'x-test-user': '' })).status, 401)
    assert.equal((await api.request('/conversations', {}, { Origin: 'https://evil.example' })).status, 403)
    const created = await api.request('/conversations', {})
    assert.equal(created.status, 201)
    const body = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '안녕' }
    assert.equal((await api.request('/chat', body, { 'x-test-user': 'bob' })).status, 404)
    const result = await api.request('/chat', body)
    assert.equal(result.body.status, 'completed')
    assert.equal(result.body.revision, 1)
    assert.deepEqual((await api.request('/chat', body)).body, result.body)
    assert.equal((await api.request('/contexts', { value: 'x'.repeat(257 * 1024) })).status, 413)
    assert.equal((await api.request('/results/not-a-ref')).status, 404)
    assert.equal((await api.request('/contexts', {})).body.owner, 'user:alice')
  } finally { await api.close() }
  for (const config of [{ enabled: false }, { provider: null }, { available: () => false }]) {
    const disabled = await start(config)
    try {
      assert.equal((await disabled.request('/status')).body.ready, false)
      assert.equal((await disabled.request('/conversations', {})).status, 503)
    } finally { await disabled.close() }
  }
})

test('explicit cancellation ends an active provider request and returns its new revision', async () => {
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const api = await start({ provider: { complete() { entered(); return new Promise(() => {}) } } })
  try {
    const created = await api.request('/conversations', {})
    const input = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '김포 날씨' }
    const running = api.request('/chat', input)
    await started
    assert.equal((await api.request('/chat', { ...input, requestId: randomUUID() })).status, 409)
    assert.equal((await api.request('/cancel', { conversationId: input.conversationId, requestId: input.requestId })).body.accepted, true)
    const response = await running
    assert.equal(response.body.status, 'cancelled')
    assert.equal(response.body.revision, 1)
  } finally { await api.close() }
})

test('output budget is operator-only and incomplete output is not retried or claimed complete', async (t) => {
  let calls = 0
  const api = await start({ maxOutputTokens: 3200, provider: { async complete(input) {
    calls++
    assert.equal(input.maxOutputTokens, 3200)
    return { incomplete: true, diagnostics: { incompleteReason: 'max_output_tokens' },
      text: 'unfinished unsafe fragment', usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 3200 } }
  } } })
  t.after(() => api.close())
  const created = await api.request('/conversations', {})
  const body = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '경로 브리핑' }
  assert.equal((await api.request('/chat', { ...body, maxOutputTokens: 8192 })).status, 400)
  assert.equal(calls, 0)
  const response = await api.request('/chat', body)
  assert.equal(response.body.status, 'partial')
  assert.equal(response.body.error, 'PROVIDER_OUTPUT_LIMIT')
  assert.equal(response.body.usage.outputTokens, 3200)
  assert.equal(response.body.text.includes('unsafe fragment'), false)
  assert.equal(calls, 1)
  assert.deepEqual((await api.request('/chat', body)).body, response.body)
  assert.equal(calls, 1)
})
