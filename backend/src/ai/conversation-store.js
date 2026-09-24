import { randomUUID } from 'node:crypto'

const fail = (code, status) => { throw Object.assign(new Error(code), { code, status }) }

export function createConversationStore({ now = Date.now, ttlMs = 30 * 60_000, maxEntries = 64 } = {}) {
  const entries = new Map()
  function prune() {
    for (const [id, entry] of entries) if (!entry.active && entry.expiresAt <= now()) entries.delete(id)
  }
  function find(owner, id) {
    prune()
    const entry = entries.get(id)
    if (!entry || entry.owner !== owner) fail('CONVERSATION_NOT_FOUND', 404)
    return entry
  }
  return {
    create(owner) {
      prune()
      if (entries.size >= maxEntries) fail('CONVERSATION_CAPACITY', 429)
      const id = `conversation_${randomUUID()}`
      entries.set(id, { owner, revision: 0, messages: [], references: [], slots: {}, context: null,
        active: null, completed: new Map(), expiresAt: now() + ttlMs })
      return { conversationId: id, revision: 0, expiresAt: new Date(now() + ttlMs).toISOString() }
    },
    begin(owner, id, { requestId, revision, fingerprint }) {
      const entry = find(owner, id)
      const previous = entry.completed.get(requestId)
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('REQUEST_ID_REUSED', 409)
        return { replay: structuredClone(previous.result) }
      }
      if (entry.active) fail('CONVERSATION_BUSY', 409)
      if (entry.revision !== revision) fail('CONVERSATION_REVISION_CONFLICT', 409)
      entry.active = { requestId, fingerprint }
      return { state: structuredClone({ revision: entry.revision, messages: entry.messages,
        references: entry.references, slots: entry.slots, context: entry.context }) }
    },
    abandon(owner, id, requestId) {
      const entry = find(owner, id)
      if (entry.active?.requestId === requestId) entry.active = null
    },
    finish(owner, id, requestId, { messages, references, slots, context, result }) {
      const entry = find(owner, id)
      if (entry.active?.requestId !== requestId) fail('REQUEST_NOT_ACTIVE', 409)
      entry.revision++
      const response = { ...result, conversationId: id, revision: entry.revision, requestId }
      entry.completed.set(requestId, { fingerprint: entry.active.fingerprint, result: structuredClone(response) })
      while (entry.completed.size > 4) entry.completed.delete(entry.completed.keys().next().value)
      // Keep complete user/assistant pairs. Original tool payloads are not history.
      entry.messages = messages.slice(-20)
      while (JSON.stringify(entry.messages).length > 24_000) entry.messages.splice(0, 2)
      entry.references = references.slice(-6)
      entry.slots = structuredClone(slots)
      entry.context = structuredClone(context)
      entry.active = null
      entry.expiresAt = now() + ttlMs
      return response
    },
    clearOwner(owner) {
      for (const [id, entry] of entries) if (entry.owner === owner && !entry.active) entries.delete(id)
    },
  }
}
