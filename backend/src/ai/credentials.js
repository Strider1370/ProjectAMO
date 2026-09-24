import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { createOpenAIProvider } from './providers/openai.js'

const inputSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/).optional(),
  deleteKey: z.literal(true).optional(),
}).strict().refine((v) => Object.keys(v).length > 0 && !(v.deleteKey && (v.apiKey || v.enabled)))
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }) }

export function createAiCredentials({ database, encryptionKey, model, reasoningEffort, providerFactory = createOpenAIProvider }) {
  // Separate from both session secrets and provider credentials. Missing/changed key fails closed.
  const key = /^[a-f0-9]{64}$/i.test(encryptionKey ?? '') ? Buffer.from(encryptionKey, 'hex') : null
  const db = () => typeof database === 'function' ? database() : database
  const row = (userId) => db().prepare('SELECT * FROM ai_credentials WHERE user_id = ?').get(userId)
  function decrypt(userId, encrypted) {
    if (!key || !encrypted) return null
    try {
      const [iv, tag, value] = encrypted.split('.')
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
      cipher.setAAD(Buffer.from(`projectamo:openai:${userId}`))
      cipher.setAuthTag(Buffer.from(tag, 'base64'))
      return Buffer.concat([cipher.update(Buffer.from(value, 'base64')), cipher.final()]).toString('utf8')
    } catch { return null }
  }
  function encrypt(userId, value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(`projectamo:openai:${userId}`))
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString('base64')).join('.')
  }
  function settings(userId) {
    const value = row(userId)
    const configured = Boolean(decrypt(userId, value?.encrypted_key))
    return { enabled: Boolean(value?.enabled) && configured, configured, stored: Boolean(value?.encrypted_key),
      storageReady: Boolean(key), provider: 'openai', model: model || null, reasoningEffort: reasoningEffort || null,
      revision: value?.revision ?? 0, reason: !key ? 'KEY_STORAGE_UNAVAILABLE'
        : value?.encrypted_key && !configured ? 'KEY_UNREADABLE' : null }
  }
  return {
    settings,
    update(userId, input) {
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) fail('INVALID_INPUT')
      const data = parsed.data, previous = row(userId)
      if (data.apiKey && !key) fail('KEY_STORAGE_UNAVAILABLE', 503)
      const encrypted = data.deleteKey ? null : data.apiKey ? encrypt(userId, data.apiKey) : previous?.encrypted_key ?? null
      // Saving/replacing a key alone never implicitly opts in.
      const enabled = data.deleteKey || data.apiKey ? data.enabled === true : data.enabled ?? Boolean(previous?.enabled)
      if (enabled && !decrypt(userId, encrypted)) fail('PERSONAL_KEY_REQUIRED')
      db().prepare(`INSERT INTO ai_credentials (user_id, enabled, encrypted_key, revision, updated_at)
        VALUES (?, ?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,
        encrypted_key=excluded.encrypted_key, revision=ai_credentials.revision+1, updated_at=excluded.updated_at`)
        .run(userId, Number(enabled), encrypted, new Date().toISOString())
      return settings(userId)
    },
    provider(userId) {
      const value = row(userId)
      if (!value?.enabled) return null
      const apiKey = decrypt(userId, value.encrypted_key)
      return apiKey ? providerFactory({ apiKey, model, reasoningEffort }) : null
    },
  }
}
