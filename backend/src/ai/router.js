import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { requireTrustedMutationOrigin } from '../organizations/middleware.js'
import { createConversationStore } from './conversation-store.js'
import { createChatRunner } from './chat-runner.js'
import { PERSONAL_ROUTE_TOOLS } from './saved-route-contracts.js'
import { PERSONAL_ALERT_TOOLS } from './alert-contracts.js'

export function createAiRouter({ executor, provider = null, enabled = false, available = () => true,
  allowedOrigins = [], now = Date.now, conversations = createConversationStore({ now }), audit = () => {}, maxOutputTokens = 1600, personalRoutes = null, personalAlerts = null, credentials = null, access = null }) {
  // The application wires operator access; credentials remains a legacy test adapter.
  credentials = access ?? credentials
  const router = express.Router()
  const active = new Map(), rates = new Map()
  const runner = (requestProvider) => createChatRunner({ provider: requestProvider, conversations, now, maxOutputTokens, personalRoutesEnabled: Boolean(personalRoutes),
    personalAlertsEnabled: Boolean(personalAlerts),
    executor: { call: (name, args, owner, signal) => PERSONAL_ROUTE_TOOLS.includes(name)
      ? personalRoutes.call(name, args, owner, signal) : PERSONAL_ALERT_TOOLS.includes(name)
        ? personalAlerts.call(name, args, owner, signal) : executor.call(name, args, owner, signal) } })
  const owner = (req) => `user:${req.session.userId}`
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.get('/status', (req, res) => {
    if (!credentials) return res.json({ enabled, ready: enabled && Boolean(provider) && available(),
      reason: !enabled ? 'FEATURE_DISABLED' : !available() ? 'DATA_CONTEXT_UNSUPPORTED' : !provider ? 'PROVIDER_NOT_CONFIGURED' : null })
    if (!req.session?.userId || (req.session.absoluteExpiry && req.session.absoluteExpiry <= now())) {
      return res.json({ enabled: false, ready: false, reason: 'LOGIN_REQUIRED' })
    }
    const settings = credentials.settings(req.session.userId)
    const active = enabled && settings.enabled
    res.json({ ...settings, enabled: active, ready: active && settings.configured && Boolean(settings.model) && available(), maxOutputTokens,
      reason: !enabled ? 'FEATURE_DISABLED' : settings.reason || (!settings.enabled ? (access ? 'COPILOT_DISABLED' : 'PERSONAL_KEY_REQUIRED')
        : !available() ? 'DATA_CONTEXT_UNSUPPORTED' : !settings.model ? 'PROVIDER_NOT_CONFIGURED' : null) })
  })
  router.use(requireAuth, requireTrustedMutationOrigin({ allowedOrigins }))
  // Preferences stay accessible while the feature/data is unavailable (OFF must still work).
  router.get('/settings', (req, res) => credentials ? res.json(credentials.settings(req.session.userId))
    : res.status(404).json({ error: 'FEATURE_UNAVAILABLE' }))
  router.post('/settings', express.json({ limit: '2kb', strict: true }), (req, res, next) => {
    if (!credentials) return res.status(404).json({ error: 'FEATURE_UNAVAILABLE' })
    try {
      const result = credentials.update(req.session.userId, req.body)
      for (const [key, entry] of active) if (key.startsWith(`${owner(req)}:`)) entry.controller.abort()
      conversations.clearOwner(owner(req))
      res.json(result)
    } catch (error) { next(error) }
  })
  router.use((_req, res, next) => {
    if (!enabled || !available()) return res.status(503).json({ error: !enabled ? 'FEATURE_DISABLED' : 'DATA_CONTEXT_UNSUPPORTED' })
    next()
  })
  router.use((req, res, next) => {
    if (credentials && req.path !== '/cancel') {
      const settings = credentials.settings(req.session.userId)
      if (!settings.enabled) return res.status(403).json({ error: access ? 'COPILOT_DISABLED' : 'PERSONAL_KEY_REQUIRED' })
      req.aiCredentialRevision = settings.revision
    }
    const time = now()
    for (const [key, value] of rates) if (value.until <= time) rates.delete(key)
    const key = owner(req)
    if (!rates.has(key)) {
      if (rates.size >= 128) return res.status(429).json({ error: 'RATE_LIMIT' })
      rates.set(key, { count: 0, until: time + 60_000 })
    }
    // Cancellation remains possible after the normal API budget is exhausted.
    if (req.path !== '/cancel' && ++rates.get(key).count > 30) return res.status(429).json({ error: 'RATE_LIMIT' })
    next()
  })
  router.use(express.json({ limit: '256kb', strict: true }))
  const handle = (fn) => async (req, res, next) => {
    try { await fn(req, res) } catch (error) { next(error) }
  }
  router.post('/conversations', handle((req, res) => {
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) return res.status(400).json({ error: 'INVALID_INPUT' })
    if (!(credentials ? credentials.provider(req.session.userId) : provider)) return res.status(503).json({ error: 'PROVIDER_NOT_CONFIGURED' })
    res.status(201).json(conversations.create(owner(req)))
  }))
  router.post('/contexts', handle(async (req, res) => {
    const result = await executor.registerContext(req.body, owner(req))
    res.status(result.status === 'error' ? 400 : 201).json(result)
  }))
  // Intentionally absent from CHAT_TOOLS and the independent MCP server.
  router.post('/confirm', handle((req, res) => {
    if (!personalAlerts) return res.status(404).json({ error: 'FEATURE_UNAVAILABLE' })
    res.json(personalAlerts.confirm(req.body, owner(req)))
  }))
  router.get('/results/:ref', handle(async (req, res) => {
    if (!/^briefing_[0-9a-f-]{36}$/.test(req.params.ref)) return res.status(404).json({ error: 'REFERENCE_NOT_FOUND' })
    let result = await executor.getResult(req.params.ref, owner(req))
    if (result.status !== 'error' && req.query.savedOrigin !== undefined) {
      if (!personalRoutes || typeof req.query.savedOrigin !== 'string' || !/^saved_origin_[0-9a-f-]{36}$/.test(req.query.savedOrigin)) {
        return res.status(404).json({ error: 'REFERENCE_NOT_FOUND' })
      }
      try { result = personalRoutes.attachResultOrigin(result, req.query.savedOrigin, owner(req)) }
      catch (error) {
        const code = ['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED', 'RESULT_IDENTITY_MISMATCH'].includes(error.code) ? error.code : 'RESULT_UNAVAILABLE'
        return res.status(404).json({ error: code })
      }
    }
    res.status(result.status === 'error' ? 404 : 200).json(result)
  }))
  router.get('/saved-routes/:ref', handle((req, res) => {
    if (!personalRoutes || !/^saved_route_[0-9a-f-]{36}$/.test(req.params.ref)) return res.status(404).json({ error: 'REFERENCE_NOT_FOUND' })
    try { res.json(personalRoutes.getForScreen(req.params.ref, owner(req))) }
    catch (error) {
      const code = ['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED', 'SAVED_ROUTE_NOT_FOUND', 'SAVED_ROUTE_CHANGED',
        'SAVED_ROUTE_CORRUPT', 'SCHEDULED_FLIGHT_NOT_SAVED_ROUTE', 'ORGANIZATION_CONTEXT_UNSUPPORTED'].includes(error.code)
        ? error.code : 'SAVED_ROUTE_UNAVAILABLE'
      res.status(code === 'SAVED_ROUTE_CHANGED' ? 409 : 404).json({ error: code })
    }
  }))
  router.post('/chat', handle(async (req, res) => {
    const key = `${owner(req)}:${req.body?.conversationId}`
    if ([...active.keys()].some((id) => id.startsWith(`${owner(req)}:`))) return res.status(409).json({ error: 'CONVERSATION_BUSY' })
    const controller = new AbortController()
    const disconnect = () => { if (!res.writableEnded) controller.abort() }
    active.set(key, { controller, requestId: req.body?.requestId })
    res.on('close', disconnect)
    try {
      const requestProvider = credentials ? credentials.provider(req.session.userId) : provider
      if (!requestProvider) return res.status(503).json({ error: 'PROVIDER_NOT_CONFIGURED' })
      const result = await runner(requestProvider)(req.body, owner(req), controller.signal,
        (request) => access?.consume(req.session.userId, request.requestId))
      // Never log prompts, source contents, API credentials or user identifiers.
      audit({ status: result.status, usage: result.usage, durationMs: result.durationMs,
        modelCalls: result.modelCalls, toolCalls: result.toolCalls })
      if (!res.destroyed) res.json({ ...result, ...(access ? { quota: access.quota(req.session.userId) } : {}) })
    } finally {
      active.delete(key)
      if (credentials && credentials.settings(req.session.userId).revision !== req.aiCredentialRevision) conversations.clearOwner(owner(req))
      res.removeListener('close', disconnect)
    }
  }))
  router.post('/cancel', (req, res) => {
    const parsed = z.object({ conversationId: z.string().max(100), requestId: z.string().uuid() }).strict().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })
    const entry = active.get(`${owner(req)}:${parsed.data.conversationId}`)
    if (entry?.requestId === parsed.data.requestId) entry.controller.abort()
    res.json({ accepted: true })
  })
  router.use((error, req, res, _next) => {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 500
    res.status(status).json({ error: status === 500 ? 'AI_REQUEST_FAILED' : error.type === 'entity.too.large'
      ? 'REQUEST_TOO_LARGE' : error.type === 'entity.parse.failed' ? 'INVALID_JSON' : error.code ?? 'INVALID_REQUEST',
      ...(access && req.session?.userId ? { quota: access.quota(req.session.userId) } : {}) })
  })
  return router
}
