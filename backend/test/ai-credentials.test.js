import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import express from 'express'
import { createDb } from '../src/db/index.js'
import { createAiCredentials } from '../src/ai/credentials.js'
import { createAiRouter } from '../src/ai/router.js'
import { createOpenAIProvider } from '../src/ai/providers/openai.js'

const aliceKey = 'sk-test-only-alice-aaaaaaaaaaaaaaaaaaaa'
const bobKey = 'sk-test-only-bob-bbbbbbbbbbbbbbbbbbbb'
function fixture(t, options = {}) {
  const db = createDb(':memory:')
  for (const id of [1, 2]) db.prepare('INSERT INTO users(id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, `user${id}`, 'test', '2026-09-24T00:00:00Z')
  const encryptionKey = randomBytes(32).toString('hex'), calls = []
  const credentials = createAiCredentials({ database: db, encryptionKey, model: 'gpt-6-luna', reasoningEffort: 'high',
    providerFactory: (input) => ({ async complete(request) {
      calls.push({ ...input, maxOutputTokens: request.maxOutputTokens })
      return { text: '자료를 확인합니다.', usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } }
    } }), ...options })
  t.after(() => db.close())
  return { db, credentials, encryptionKey, calls }
}

test('default OFF, encrypted storage, explicit opt-in, owner-bound ciphertext and no key echo', (t) => {
  const { db, credentials, encryptionKey } = fixture(t)
  assert.equal(credentials.settings(1).enabled, false)
  assert.equal(credentials.provider(1), null)
  assert.throws(() => credentials.update(1, { enabled: true }), { code: 'PERSONAL_KEY_REQUIRED' })
  const saved = credentials.update(1, { apiKey: aliceKey })
  assert.equal(saved.configured, true)
  assert.equal(saved.enabled, false)
  assert.equal(JSON.stringify(saved).includes(aliceKey), false)
  const encrypted = db.prepare('SELECT encrypted_key FROM ai_credentials WHERE user_id=1').get().encrypted_key
  assert.equal(encrypted.includes(aliceKey), false)
  credentials.update(1, { enabled: true })
  assert.ok(credentials.provider(1))
  assert.equal(credentials.provider(2), null)
  credentials.update(2, { apiKey: bobKey, enabled: true })
  db.prepare('UPDATE ai_credentials SET encrypted_key=? WHERE user_id=2').run(encrypted)
  assert.equal(credentials.provider(2), null)
  assert.equal(credentials.settings(2).reason, 'KEY_UNREADABLE')
  const reopened = createAiCredentials({ database: db, encryptionKey, model: 'gpt-6-luna' })
  assert.ok(reopened.provider(1))
  assert.equal(createAiCredentials({ database: db, encryptionKey: 'a'.repeat(64), model: 'gpt-6-luna' }).provider(1), null)
  credentials.update(1, { apiKey: bobKey })
  assert.equal(credentials.settings(1).enabled, false)
  credentials.update(1, { deleteKey: true })
  assert.equal(credentials.settings(1).stored, false)
  assert.equal(credentials.provider(1), null)
})

test('missing encryption configuration fails closed but deletion remains available', (t) => {
  const { db, credentials } = fixture(t)
  credentials.update(1, { apiKey: aliceKey, enabled: true })
  const unavailable = createAiCredentials({ database: db, model: 'gpt-6-luna' })
  assert.equal(unavailable.settings(1).storageReady, false)
  assert.equal(unavailable.provider(1), null)
  assert.throws(() => unavailable.update(1, { apiKey: bobKey }), { code: 'KEY_STORAGE_UNAVAILABLE' })
  assert.equal(unavailable.update(1, { deleteKey: true }).stored, false)
  for (const input of [{}, { apiKey: aliceKey, userId: 2 }, { apiKey: 'sk-invalid\nheader' }, { enabled: true, deleteKey: true }, { provider: 'claude' }]) {
    assert.throws(() => credentials.update(1, input), { code: 'INVALID_INPUT' })
  }
})

async function api(t, options = {}) {
  const setup = fixture(t, options)
  let fallbackCalls = 0
  const app = express()
  app.use((req, _res, next) => { if (req.headers['x-user']) req.session = { userId: Number(req.headers['x-user']) }; next() })
  app.use('/api/ai', createAiRouter({ credentials: setup.credentials, enabled: true, maxOutputTokens: 3200,
    executor: {}, provider: { complete() { fallbackCalls++; throw new Error('OPERATOR_KEY_MUST_NOT_BE_USED') } } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = `http://127.0.0.1:${server.address().port}`
  return { ...setup, fallbackCalls: () => fallbackCalls, async request(path, body, user = 1, requestOrigin = origin) {
    const response = await fetch(`${origin}/api/ai${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-user': user ? String(user) : '', Origin: requestOrigin },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
  } }
}

test('HTTP uses only opted-in account key, high/3200, auth/origin/size limits and no operator fallback', async (t) => {
  const app = await api(t)
  assert.equal((await app.request('/status', null, null)).body.enabled, false)
  assert.equal((await app.request('/settings', null, null)).status, 401)
  assert.equal((await app.request('/conversations', {})).status, 403)
  assert.equal((await app.request('/settings', { apiKey: aliceKey }, 1, 'https://evil.example')).status, 403)
  assert.equal((await app.request('/settings', { apiKey: 'x'.repeat(2100) })).status, 413)
  const saved = await app.request('/settings', { apiKey: aliceKey })
  assert.equal(saved.cache, 'no-store')
  assert.equal(saved.body.enabled, false)
  await app.request('/settings', { enabled: true })
  assert.equal((await app.request('/status')).body.ready, true)
  assert.equal((await app.request('/status', null, 2)).body.enabled, false)
  const created = await app.request('/conversations', {})
  const input = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '안녕' }
  assert.equal((await app.request('/chat', input)).body.status, 'completed')
  assert.deepEqual(app.calls, [{ apiKey: aliceKey, model: 'gpt-6-luna', reasoningEffort: 'high', maxOutputTokens: 3200 }])
  await app.request('/settings', { enabled: false })
  assert.equal((await app.request('/chat', input)).status, 403)
  await app.request('/settings', { enabled: true })
  assert.equal((await app.request('/chat', input)).status, 404)
  await app.request('/settings', { deleteKey: true })
  assert.equal((await app.request('/conversations', {})).status, 403)
  assert.equal(app.fallbackCalls(), 0)
})

test('disabling/replacing a credential cancels active calls and invalidates their conversation', async (t) => {
  let entered
  const started = new Promise((r) => { entered = r })
  const app = await api(t, { providerFactory: () => ({ complete() { entered(); return new Promise(() => {}) } }) })
  await app.request('/settings', { apiKey: aliceKey, enabled: true })
  const created = await app.request('/conversations', {})
  const input = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '안녕' }
  const running = app.request('/chat', input)
  await started
  await app.request('/settings', { enabled: false })
  assert.equal((await running).body.status, 'cancelled')
  await app.request('/settings', { enabled: true })
  assert.equal((await app.request('/chat', input)).status, 404)
  assert.equal(app.fallbackCalls(), 0)
})

test('native provider sends personal auth and Luna high/3200; rejected credentials never fall back or retry', async (t) => {
  const requests = []
  const app = await api(t, { providerFactory: (options) => createOpenAIProvider({ ...options, fetchImpl: async (url, request) => {
    requests.push({ url, ...request, body: JSON.parse(request.body) })
    return new Response('sensitive upstream diagnostic MUST NOT LEAK', { status: 401 })
  } }) })
  await app.request('/settings', { apiKey: aliceKey, enabled: true })
  const created = await app.request('/conversations', {})
  const input = { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '안녕' }
  const result = await app.request('/chat', input)
  assert.equal(result.body.error, 'PROVIDER_AUTH_FAILED')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses')
  assert.equal(requests[0].headers.Authorization, `Bearer ${aliceKey}`)
  assert.equal(requests[0].body.model, 'gpt-6-luna')
  assert.deepEqual(requests[0].body.reasoning, { effort: 'high' })
  assert.equal(requests[0].body.max_output_tokens, 3200)
  assert.equal(JSON.stringify(requests[0].body).includes(aliceKey), false)
  assert.equal(JSON.stringify(result.body).includes('MUST NOT LEAK'), false)
  assert.equal(app.fallbackCalls(), 0)
})
