import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createConversationStore } from '../src/ai/conversation-store.js'

test('a new context conversation never inherits same-owner prose, slots or tool references', () => {
  const store = createConversationStore()
  const owner = 'context-choice-owner'
  const first = store.create(owner)
  const requestId = randomUUID()
  store.begin(owner, first.conversationId, { revision: 0, requestId, fingerprint: 'first' })
  store.finish(owner, first.conversationId, requestId, {
    messages: [{ role: 'user', content: '김포–김해 경로' }, { role: 'assistant', content: '이전 경로의 자료' }],
    slots: { window: { value: { start: '2026-09-23T12:00:00Z', end: '2026-09-23T13:00:00Z' } } },
    references: [{ briefingRef: 'briefing-previous' }],
    context: { contextRef: 'context-previous', revision: 'applied-previous', airport: 'RKSS' },
    result: { text: '이전 경로의 자료', status: 'completed' },
  })
  const second = store.create(owner)
  const current = store.begin(owner, second.conversationId, { revision: 0, requestId: randomUUID(), fingerprint: 'second' }).state
  assert.notEqual(second.conversationId, first.conversationId)
  assert.equal(current.context, null)
  assert.deepEqual(current.messages, [])
  assert.deepEqual(current.references, [])
  assert.deepEqual(current.slots, {})
  // Choosing the previous context instead retains its original owner-bound state.
  const previous = store.begin(owner, first.conversationId, { revision: 1, requestId: randomUUID(), fingerprint: 'follow-up' }).state
  assert.equal(previous.context.contextRef, 'context-previous')
  assert.equal(previous.messages.length, 2)
  assert.equal(previous.references[0].briefingRef, 'briefing-previous')
  assert.ok(previous.slots.window)
  assert.throws(() => store.begin('different-owner', first.conversationId, { revision: 1, requestId: randomUUID(), fingerprint: 'stolen' }), { code: 'CONVERSATION_NOT_FOUND' })
})
