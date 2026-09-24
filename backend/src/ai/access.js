import { z } from 'zod'
import { createOpenAIProvider } from './providers/openai.js'

const DAILY_LIMIT = 5
const DAY_MS = 86_400_000
const KST_OFFSET = 9 * 3_600_000
const fail = (code, status) => { throw Object.assign(new Error(code), { code, status }) }

// App-only operator funding. Neither the key nor private preferences reach MCP.
export function createAiAccess({ database, apiKey, model, reasoningEffort, now = Date.now,
  providerFactory = createOpenAIProvider }) {
  const db = () => typeof database === 'function' ? database() : database
  const provider = providerFactory({ apiKey, model, reasoningEffort })
  function quota(userId) {
    const time = now()
    const day = new Date(time + KST_OFFSET).toISOString().slice(0, 10)
    const used = db().prepare('SELECT used FROM ai_daily_usage WHERE user_id=? AND day=?').get(userId, day)?.used ?? 0
    return { day, timezone: 'Asia/Seoul', limit: DAILY_LIMIT, used, remaining: Math.max(0, DAILY_LIMIT - used),
      resetsAt: new Date((Math.floor((time + KST_OFFSET) / DAY_MS) + 1) * DAY_MS - KST_OFFSET).toISOString() }
  }
  function settings(userId) {
    const row = db().prepare('SELECT enabled, revision FROM ai_settings WHERE user_id=?').get(userId)
    return { enabled: Boolean(row?.enabled), configured: Boolean(provider), funding: 'operator',
      provider: 'openai', model: model || null, reasoningEffort: reasoningEffort || null,
      revision: row?.revision ?? 0, quota: quota(userId), reason: provider ? null : 'PROVIDER_NOT_CONFIGURED' }
  }
  return {
    settings, quota,
    update(userId, input) {
      const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(input)
      if (!parsed.success) fail('INVALID_INPUT', 400)
      if (parsed.data.enabled && !provider) fail('PROVIDER_NOT_CONFIGURED', 503)
      db().prepare(`INSERT INTO ai_settings(user_id, enabled, revision, updated_at) VALUES (?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled, revision=ai_settings.revision+1, updated_at=excluded.updated_at`)
        .run(userId, Number(parsed.data.enabled), new Date(now()).toISOString())
      return settings(userId)
    },
    provider(userId) { return settings(userId).enabled ? provider : null },
    consume(userId, requestId) {
      // Synchronous write transaction: no read/check/write race across DB connections.
      return db().transaction(() => {
        if (!settings(userId).enabled) fail('COPILOT_DISABLED', 403)
        if (!provider) fail('PROVIDER_NOT_CONFIGURED', 503)
        // A restart/expired in-memory receipt must never turn a retry into another paid call.
        if (db().prepare('SELECT 1 FROM ai_question_requests WHERE user_id=? AND request_id=?').get(userId, requestId)) {
          fail('QUESTION_ALREADY_STARTED', 409)
        }
        const current = quota(userId)
        db().prepare('INSERT OR IGNORE INTO ai_daily_usage(user_id, day, used) VALUES (?, ?, 0)').run(userId, current.day)
        const changed = db().prepare('UPDATE ai_daily_usage SET used=used+1 WHERE user_id=? AND day=? AND used<?')
          .run(userId, current.day, DAILY_LIMIT)
        if (!changed.changes) fail('DAILY_QUESTION_LIMIT', 429)
        db().prepare('INSERT INTO ai_question_requests(user_id, request_id, started_at) VALUES (?, ?, ?)')
          .run(userId, requestId, new Date(now()).toISOString())
        return quota(userId)
      }).immediate()
    },
  }
}
