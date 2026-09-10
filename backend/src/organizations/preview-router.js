import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Router } from 'express'
import { createDb } from '../db/index.js'
import { createRoutesRouter } from '../me/routes.js'
import { createOrganizationRouter } from './router.js'
import { requireTrustedMutationOrigin } from './middleware.js'
import { PREVIEW_USER, seedOrganizationPreview } from './preview-seed.js'

const COOKIE = 'amo.lounge-preview'
const COOKIE_PATH = '/api/lounge-preview'
const TWO_HOURS = 2 * 3600_000

// Mount BEFORE the real login-session middleware. The synthetic principal exists
// only inside this terminal router and can never be saved into a login session.
export function createOrganizationPreviewRouter({
  briefingDependencies = {}, situationDependencies = {},
  trustedMutationOrigin = requireTrustedMutationOrigin(),
  now = Date.now, ttlMs = TWO_HOURS, maxSessions = 24,
} = {}) {
  const router = Router()
  const sessions = new Map()
  let creating = 0
  const dispose = (token, entry) => {
    sessions.delete(token)
    entry.db.close()
    fs.rmSync(entry.filesPath, { recursive: true, force: true })
  }
  const sweep = () => {
    for (const [token, entry] of sessions) if (entry.expiresAt <= now() && entry.active === 0 && entry.pending === 0 && !entry.resetting) dispose(token, entry)
  }
  const timer = setInterval(sweep, 60_000)
  timer.unref()
  router.close = () => { clearInterval(timer); for (const [token, entry] of sessions) dispose(token, entry) }
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH, maxAge: ttlMs }
  const envelope = (entry) => ({ preview: true, user: PREVIEW_USER, organization: entry.organization, expiresAt: new Date(entry.expiresAt).toISOString() })
  const lookup = (req) => {
    const token = req.cookies?.[COOKIE]
    const entry = typeof token === 'string' ? sessions.get(token) : null
    return entry?.expiresAt > now() ? entry : null
  }
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    trustedMutationOrigin(req, res, next)
  })
  router.post(['/session', '/reset'], async (req, res) => {
    sweep()
    const prior = lookup(req)
    if (prior?.resetting) return res.status(409).json({ error: 'preview_busy', message: '예시를 초기화하고 있습니다. 잠시 후 다시 시도해 주세요.' })
    if (prior && req.path === '/session') return res.json(envelope(prior))
    if (prior && (prior.active || prior.pending)) return res.status(409).json({ error: 'preview_busy', message: '현재 작업이 끝난 뒤 다시 초기화해 주세요.' })
    if (creating >= 4 || (sessions.size + creating >= maxSessions && !prior)) return res.status(429).json({ error: 'preview_capacity', message: '체험 공간이 모두 사용 중입니다. 잠시 후 다시 시도해 주세요.' })
    if (prior) prior.resetting = true
    creating += 1
    let db, filesPath
    try {
      db = createDb(':memory:')
      filesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-lounge-preview-'))
      const organization = await seedOrganizationPreview(db, filesPath, now())
      const entry = { db, filesPath, organization, expiresAt: now() + ttlMs, active: 0, pending: 0, requests: 0, windowStart: now(), writes: 0, uploadedBytes: 0 }
      entry.router = createOrganizationRouter({
        db, filesPath, trustedMutationOrigin, briefingDependencies, situationDependencies,
        runOperation: async (operation) => {
          entry.pending += 1
          try { return await operation() } finally { entry.pending -= 1 }
        },
      })
      entry.savedRoutesRouter = createRoutesRouter({ db })
      const token = crypto.randomBytes(32).toString('hex')
      sessions.set(token, entry)
      if (prior) dispose(req.cookies[COOKIE], prior)
      res.cookie(COOKIE, token, cookieOptions).status(201).json(envelope(entry))
    } catch (error) {
      db?.close()
      if (filesPath) fs.rmSync(filesPath, { recursive: true, force: true })
      console.error('[lounge-preview] Initialization failed:', error.message)
      res.status(503).json({ error: 'preview_unavailable', message: '미리보기를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    } finally { creating -= 1; if (prior) prior.resetting = false }
  })
  router.use((req, res, next) => {
    const entry = lookup(req)
    if (!entry) return res.status(401).json({ error: 'preview_expired', message: '체험 시간이 끝났습니다. 미리보기를 다시 시작해 주세요.' })
    if (entry.resetting) return res.status(409).json({ error: 'preview_busy', message: '예시를 초기화하고 있습니다. 잠시 후 다시 시도해 주세요.' })
    if (now() - entry.windowStart >= 60_000) { entry.windowStart = now(); entry.requests = 0 }
    if (++entry.requests > 180) return res.status(429).json({ error: 'preview_rate_limit', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('transfer-encoding')) return res.status(411).json({ error: 'preview_length_required', message: '파일 크기를 확인할 수 없습니다. 파일을 다시 선택해 주세요.' })
      const bytes = Number(req.get('content-length')) || 0
      // Public sandboxes are bounded and short-lived; the normal organization's
      // version/file permissions and validators still run in the reused router.
      if (++entry.writes > 200 || entry.db.pragma('page_count', { simple: true }) * entry.db.pragma('page_size', { simple: true }) > 16 * 1024 * 1024
        || entry.uploadedBytes + bytes > 32 * 1024 * 1024) {
        return res.status(413).json({ error: 'preview_limit', message: '체험 저장 한도에 도달했습니다. 예시 초기화 후 다시 이용해 주세요.' })
      }
      entry.uploadedBytes += bytes
    }
    entry.active += 1
    let released = false
    const release = () => { if (!released) { released = true; entry.active -= 1 } }
    res.once('finish', release); res.once('close', release)
    req.previewEntry = entry
    req.session = { userId: PREVIEW_USER.id, role: 'pilot' }
    next()
  })
  router.use('/saved-routes', (req, res, next) => {
    const originalUrl = req.url
    req.url = `/routes${req.url === '/' ? '' : req.url}`
    req.previewEntry.savedRoutesRouter(req, res, (error) => { req.url = originalUrl; next(error) })
  })
  router.use('/organizations', (req, res, next) => req.previewEntry.router(req, res, next))
  // Never fall through to the application's real session or private endpoints.
  router.use((_req, res) => res.status(404).json({ error: 'preview_not_found' }))
  router.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'preview_request_failed' }))
  return router
}
