import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import { createDb } from '../src/db/index.js'
import { createAiAccess } from '../src/ai/access.js'
import { createAiRouter } from '../src/ai/router.js'
import { createOpenAIProvider } from '../src/ai/providers/openai.js'

const operatorKey = 'sk-test-operator-only-not-a-real-key'
function database(file = ':memory:') {
  const db = createDb(file)
  for (const id of [1, 2]) db.prepare('INSERT OR IGNORE INTO users(id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `quota-${id}`, 'test', '2026-09-24T00:00:00Z')
  return db
}
function service(db, options = {}) {
  return createAiAccess({ database: db, apiKey: operatorKey, model: 'gpt-6-luna', reasoningEffort: 'high', ...options })
}
async function api(t, { provider, ...options } = {}) {
  const db = database()
  t.after(() => db.close())
  const calls = []
  const access = service(db, { providerFactory: () => provider ?? { async complete(input) {
    calls.push(input)
    return { text: '기상 자료를 확인하세요.', usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 } }
  } }, ...options })
  const app = express()
  app.use((req, _res, next) => { if (req.headers['x-user']) req.session = { userId: Number(req.headers['x-user']) }; next() })
  app.use('/api/ai', createAiRouter({ access, enabled: true, maxOutputTokens: 3200,
    now: options.now, executor: { async call() { return { status: 'error', error: { code: 'DATA_UNAVAILABLE' } } } } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = `http://127.0.0.1:${server.address().port}`
  async function request(route, body, user = 1, requestOrigin = origin) {
    const response = await fetch(`${origin}/api/ai${route}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: requestOrigin, 'x-user': user ? String(user) : '' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }
  async function question(user = 1) {
    const created = await request('/conversations', {}, user)
    return { conversationId: created.body.conversationId, revision: 0, requestId: randomUUID(), message: '김포 날씨' }
  }
  return { access, db, calls, request, question }
}

test('operator preferences default OFF, never accept/echo personal keys, never read legacy ciphertext', (t) => {
  const db = database(); t.after(() => db.close())
  db.prepare('INSERT INTO ai_credentials(user_id,enabled,encrypted_key,updated_at) VALUES (1,1,?,?)').run('legacy-ciphertext', 'now')
  const access = service(db)
  assert.equal(access.settings(1).enabled, false)
  assert.equal(access.settings(1).configured, true)
  assert.equal(access.provider(1), null)
  for (const input of [{ apiKey: operatorKey }, { enabled: true, userId: 2 }, { deleteKey: true }, {}]) {
    assert.throws(() => access.update(1, input), { code: 'INVALID_INPUT' })
  }
  assert.equal(access.update(1, { enabled: true }).enabled, true)
  assert.ok(access.provider(1))
  assert.equal(JSON.stringify(access.settings(1)).includes(operatorKey), false)
  assert.equal(db.prepare('SELECT encrypted_key FROM ai_credentials').get().encrypted_key, 'legacy-ciphertext')
  const unavailable = service(db, { apiKey: '' })
  assert.equal(unavailable.provider(1), null)
  assert.throws(() => unavailable.update(1, { enabled: true }), { code: 'PROVIDER_NOT_CONFIGURED' })
  assert.equal(unavailable.update(1, { enabled: false }).enabled, false)
})

test('five per account, persistent across reopen/connections and toggle, KST midnight resets independently of display timezone', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'amo-quota-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'quota.db')
  let time = Date.parse('2026-09-24T14:59:59.999Z')
  let db = database(file)
  let access = service(db, { now: () => time })
  access.update(1, { enabled: true }); access.update(2, { enabled: true })
  const ids = Array.from({ length: 5 }, () => randomUUID())
  for (const id of ids) access.consume(1, id)
  assert.equal(access.quota(1).remaining, 0)
  assert.equal(access.quota(1).day, '2026-09-24')
  assert.equal(access.quota(1).resetsAt, '2026-09-24T15:00:00.000Z')
  assert.equal(access.quota(2).remaining, 5)
  assert.throws(() => access.consume(1, randomUUID()), { code: 'DAILY_QUESTION_LIMIT' })
  assert.throws(() => access.consume(1, ids[0]), { code: 'QUESTION_ALREADY_STARTED' })
  db.close(); db = database(file); t.after(() => db.close())
  access = service(db, { now: () => time })
  access.update(1, { enabled: false }); access.update(1, { enabled: true })
  assert.equal(access.quota(1).remaining, 0)
  const peer = database(file); t.after(() => peer.close())
  assert.throws(() => service(peer, { now: () => time }).consume(1, randomUUID()), { code: 'DAILY_QUESTION_LIMIT' })
  time++
  assert.equal(access.quota(1).remaining, 5)
  assert.throws(() => access.consume(1, ids[0]), { code: 'QUESTION_ALREADY_STARTED' })
  assert.equal(access.consume(1, randomUUID()).remaining, 4)
})

test('HTTP quota is charged only after validation, replay is free even at zero; reset/other device cannot bypass', async (t) => {
  const app = await api(t)
  assert.equal((await app.request('/status', undefined, null)).body.enabled, false)
  assert.equal((await app.request('/settings', undefined, null)).status, 401)
  assert.equal((await app.request('/chat', {}, null)).status, 401)
  assert.equal((await app.request('/settings', { enabled: true }, 1, 'https://evil.example')).status, 403)
  assert.equal((await app.request('/conversations', {})).status, 403)
  await app.request('/settings', { enabled: true })
  await app.request('/settings', { enabled: true }, 2)
  let last
  for (let i = 0; i < 5; i++) {
    last = await app.question()
    if (i === 0) {
      assert.equal((await app.request('/chat', { ...last, message: '' })).status, 400)
      assert.equal((await app.request('/chat', { ...last, maxOutputTokens: 8000 })).status, 400)
      assert.equal((await app.request('/chat', last, 2)).status, 404)
      assert.equal((await app.request('/chat', { ...last, revision: 10 })).status, 409)
      assert.equal(app.access.quota(1).used, 0)
    }
    const result = await app.request('/chat', last)
    assert.equal(result.body.status, 'completed')
    assert.equal(result.body.quota.remaining, 4 - i)
    assert.equal((await app.request('/chat', last)).body.quota.remaining, 4 - i)
    assert.equal(app.calls.length, i + 1)
  }
  assert.equal((await app.request('/status')).body.enabled, true) // history/launcher remain visible
  const extra = await app.question()
  assert.equal((await app.request('/chat', extra)).body.error, 'DAILY_QUESTION_LIMIT')
  assert.equal((await app.request('/chat', extra)).body.error, 'DAILY_QUESTION_LIMIT') // rejection releases conversation lock
  assert.equal((await app.request('/chat', last)).body.status, 'completed')
  assert.equal(app.calls.length, 5)
  assert.equal(app.access.quota(2).remaining, 5)
  await app.request('/settings', { enabled: false }); await app.request('/settings', { enabled: true })
  assert.equal((await app.request('/chat', await app.question())).body.error, 'DAILY_QUESTION_LIMIT')
})

test('parallel questions in different conversations are rejected; cancellation consumes only one and releases owner', async (t) => {
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const app = await api(t, { provider: { complete() { entered(); return new Promise(() => {}) } } })
  await app.request('/settings', { enabled: true })
  const first = await app.question(), second = await app.question()
  const running = app.request('/chat', first)
  await started
  assert.equal((await app.request('/chat', second)).body.error, 'CONVERSATION_BUSY')
  assert.equal(app.access.quota(1).used, 1)
  await app.request('/cancel', { conversationId: first.conversationId, requestId: first.requestId })
  assert.equal((await running).body.status, 'cancelled')
  assert.equal((await app.request('/chat', first)).body.status, 'cancelled')
  assert.equal(app.access.quota(1).used, 1)
})

test('multiple model/tool calls cost one question; OFF/ON retains usage and clears conversation', async (t) => {
  let calls = 0
  const app = await api(t, { provider: { async complete() {
    calls++
    return calls === 1 ? { toolCalls: [{ id: 'call1', name: 'get_weather_advisories', arguments: {} }] }
      : { text: '자료를 확인하지 못했어요.' }
  } } })
  await app.request('/settings', { enabled: true })
  const input = await app.question()
  const result = await app.request('/chat', input)
  assert.equal(result.body.modelCalls, 2)
  assert.equal(result.body.toolCalls, 1)
  assert.equal(result.body.quota.used, 1)
  await app.request('/settings', { enabled: false }); await app.request('/settings', { enabled: true })
  assert.equal(app.access.quota(1).used, 1)
  assert.equal((await app.request('/chat', input)).status, 404)
})

test('daily rejection releases the conversation for KST next day, without another conversation or server restart', async (t) => {
  let time = Date.parse('2026-09-24T14:59:59.999Z')
  const app = await api(t, { now: () => time })
  await app.request('/settings', { enabled: true })
  for (let i = 0; i < 5; i++) app.access.consume(1, randomUUID())
  const input = await app.question()
  assert.equal((await app.request('/chat', input)).body.error, 'DAILY_QUESTION_LIMIT')
  assert.equal(app.calls.length, 0)
  time++
  const result = await app.request('/chat', input)
  assert.equal(result.body.status, 'completed')
  assert.equal(result.body.quota.day, '2026-09-25')
  assert.equal(result.body.quota.remaining, 4)
  assert.equal(app.calls.length, 1)
})

test('OFF while active cancels the call, retains allowance use and invalidates late conversation', async (t) => {
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const app = await api(t, { provider: { complete() { entered(); return new Promise(() => {}) } } })
  await app.request('/settings', { enabled: true })
  const input = await app.question()
  const pending = app.request('/chat', input)
  await started
  await app.request('/settings', { enabled: false })
  assert.equal((await pending).body.status, 'cancelled')
  assert.equal(app.access.quota(1).used, 1)
  await app.request('/settings', { enabled: true })
  assert.equal((await app.request('/chat', input)).status, 404)
})

test('server provider sends operator auth with Luna high/3200; provider rejection is counted once and secrets never reach response', async (t) => {
  const requests = []
  const app = await api(t, { providerFactory: (options) => createOpenAIProvider({ ...options, fetchImpl: async (url, request) => {
    requests.push({ url, ...request, body: JSON.parse(request.body) })
    return new Response('sensitive upstream message', { status: 401 })
  } }) })
  await app.request('/settings', { enabled: true })
  const input = await app.question()
  const result = await app.request('/chat', input)
  assert.equal(result.body.error, 'PROVIDER_AUTH_FAILED')
  assert.equal(result.body.quota.used, 1)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].headers.Authorization, `Bearer ${operatorKey}`)
  assert.equal(requests[0].body.model, 'gpt-6-luna')
  assert.deepEqual(requests[0].body.reasoning, { effort: 'high' })
  assert.equal(requests[0].body.max_output_tokens, 3200)
  assert.equal(JSON.stringify(requests[0].body).includes(operatorKey), false)
  assert.equal(JSON.stringify(result).includes(operatorKey), false)
  assert.equal(JSON.stringify(result).includes('sensitive upstream'), false)
  await app.request('/chat', input)
  assert.equal(requests.length, 1)
})
