import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'

import express, { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireRole } from '../auth/middleware.js'
import { sendTelegram } from '../alerts/ops-telegram.js'
import {
  MAX_UPLOAD_BYTES, feedbackFilesRoot, imagePath, reencodeImage, removeImages, writeImage,
} from './storage.js'

// 사용자 의견. 글은 운영자만 보고, 첨부 사진은 공개 자료 폴더 밖에 다시 그려 저장한다.
// 로그인하지 않아도 보낼 수 있으므로 IP 횟수 제한·사진 수·전체 용량·보존 기간으로 남용을 막는다.
export const KIND_LABEL = { error: '오류', inconvenience: '불편', suggestion: '제안' }
export const MAX_IMAGES = 3
export const IMAGE_RETENTION_DAYS = 90
const TOTAL_IMAGE_BUDGET_BYTES = 500 * 1024 * 1024
const UPLOAD_WINDOW_MS = 10 * 60 * 1000
const STATUSES = ['new', 'read', 'done', 'hidden']

const text = (max) => z.string().trim().max(max)
const contextSchema = z.object({
  path: text(200).optional(),
  airport: z.string().regex(/^[A-Z0-9]{4}$/).nullable().optional(),
  panel: text(40).nullable().optional(),
  briefing: z.boolean().optional(),
  route: z.object({
    departure: z.string().regex(/^[A-Z0-9]{4}$/).nullable().optional(),
    arrival: z.string().regex(/^[A-Z0-9]{4}$/).nullable().optional(),
    flightRule: text(10).nullable().optional(),
    cruiseAltitudeFt: z.number().int().min(0).max(70000).nullable().optional(),
  }).nullable().optional(),
  layers: z.array(text(40)).max(40).optional(),
  viewport: z.object({ width: z.number().int().min(0).max(20000), height: z.number().int().min(0).max(20000) }).optional(),
  version: text(20).optional(),
}).strict()

const createSchema = z.object({
  kind: z.enum(Object.keys(KIND_LABEL)),
  message: text(2000).min(1),
  imageCount: z.number().int().min(0).max(MAX_IMAGES).default(0),
  context: z.unknown().optional(),
}).strict()

function limiter(windowMs, limit) {
  return rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    validate: { trustProxy: false },
    message: { error: 'too_many_requests' },
  })
}

const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
const parseImages = (value) => {
  try { const list = JSON.parse(value || '[]'); return Array.isArray(list) ? list : [] } catch { return [] }
}

// 보존 기간이 지난 사진은 파일과 목록에서 함께 지운다. 글은 남긴다.
export function pruneExpiredImages(database, root, now = new Date()) {
  const cutoff = new Date(now.getTime() - IMAGE_RETENTION_DAYS * 86_400_000).toISOString()
  const rows = database.prepare("SELECT id, images FROM feedback WHERE created_at < ? AND images <> '[]'").all(cutoff)
  for (const row of rows) {
    removeImages(root, parseImages(row.images))
    database.prepare("UPDATE feedback SET images='[]', image_bytes=0 WHERE id=?").run(row.id)
  }
  return rows.length
}

export function createFeedbackRouter({ db = null, filesPath = null, trustedMutationOrigin = (_req, _res, next) => next(),
  notify = sendTelegram, now = () => new Date() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  const root = () => feedbackFilesRoot(filesPath)
  const createLimiter = [limiter(10 * 60 * 1000, 5), limiter(24 * 60 * 60 * 1000, 20)]
  const imageLimiter = limiter(10 * 60 * 1000, 15)
  const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_UPLOAD_BYTES })

  router.use(trustedMutationOrigin)

  router.post('/', ...createLimiter, express.json({ limit: '64kb' }), (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
    const { kind, message, imageCount } = parsed.data
    // 화면 정보는 참고용이다. 형식이 맞지 않으면 버리고 의견은 그대로 받는다.
    const context = contextSchema.safeParse(parsed.data.context ?? {}).data ?? {}
    const createdAt = now().toISOString()
    const token = imageCount > 0 ? randomBytes(24).toString('hex') : null
    const stored = { ...context, userAgent: String(req.get('user-agent') || '').slice(0, 300) }
    const info = database().prepare(`INSERT INTO feedback
      (kind, message, context, user_id, upload_token_hash, upload_expected, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(kind, message, JSON.stringify(stored), req.session?.userId ?? null, token ? hashToken(token) : null, imageCount, createdAt, createdAt)
    try { pruneExpiredImages(database(), root(), now()) } catch { /* 정리는 다음 기회에 */ }
    // 사진은 따로 올라오므로 알림에는 글만 담는다. 텔레그램은 서식 없이 일반 글로 보낸다.
    Promise.resolve(notify(`새 의견 · ${KIND_LABEL[kind]}${imageCount ? ` · 사진 ${imageCount}장` : ''}\n${message.slice(0, 300)}`))
      .catch(() => {})
    res.status(201).json({ id: Number(info.lastInsertRowid), uploadToken: token })
  })

  router.post('/:id/images', imageLimiter, rawImage, async (req, res) => {
    const id = Number(req.params.id)
    const token = req.get('x-feedback-upload')
    if (!Number.isInteger(id) || id <= 0 || !token) return res.status(404).json({ error: 'not_found' })
    const row = database().prepare('SELECT id, images, upload_token_hash, upload_expected, created_at FROM feedback WHERE id=?').get(id)
    if (!row?.upload_token_hash || row.upload_token_hash !== hashToken(token)) return res.status(404).json({ error: 'not_found' })
    if (now().getTime() - Date.parse(row.created_at) > UPLOAD_WINDOW_MS) return res.status(410).json({ error: 'upload_expired' })
    const images = parseImages(row.images)
    if (images.length >= Math.min(row.upload_expected, MAX_IMAGES)) return res.status(409).json({ error: 'too_many_images' })
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(415).json({ error: 'unsupported_image' })

    const used = database().prepare('SELECT COALESCE(SUM(image_bytes), 0) AS bytes FROM feedback').get().bytes
    if (used >= TOTAL_IMAGE_BUDGET_BYTES) return res.status(507).json({ error: 'storage_full' })
    const encoded = await reencodeImage(req.body)
    if (!encoded) return res.status(415).json({ error: 'unsupported_image' })

    const key = writeImage(root(), encoded)
    const current = parseImages(database().prepare('SELECT images FROM feedback WHERE id=?').get(id)?.images)
    if (current.length >= Math.min(row.upload_expected, MAX_IMAGES)) {
      removeImages(root(), [key])
      return res.status(409).json({ error: 'too_many_images' })
    }
    const next = [...current, key]
    database().prepare(`UPDATE feedback SET images=?, image_bytes=image_bytes+?,
      upload_token_hash=CASE WHEN ? >= upload_expected THEN NULL ELSE upload_token_hash END WHERE id=?`)
      .run(JSON.stringify(next), encoded.length, next.length, id)
    res.status(201).json({ count: next.length })
  })

  return router
}

export function createAdminFeedbackRouter({ db = null, filesPath = null, now = () => new Date() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  const root = () => feedbackFilesRoot(filesPath)
  router.use(requireRole('admin'))

  router.get('/', (req, res) => {
    const filter = ['new', 'all', 'done', 'hidden'].includes(req.query.status) ? req.query.status : 'new'
    try { pruneExpiredImages(database(), root(), now()) } catch { /* 목록은 그대로 보여 준다 */ }
    const where = { new: "f.status='new'", all: "f.status<>'hidden'", done: "f.status='done'", hidden: "f.status='hidden'" }[filter]
    const rows = database().prepare(`SELECT f.id, f.kind, f.message, f.context, f.images, f.status, f.created_at, u.username
      FROM feedback f LEFT JOIN users u ON u.id=f.user_id WHERE ${where} ORDER BY f.created_at DESC, f.id DESC LIMIT 200`).all()
    const counts = database().prepare(`SELECT
      SUM(status='new') AS new, SUM(status<>'hidden') AS "all", SUM(status='done') AS done, SUM(status='hidden') AS hidden
      FROM feedback`).get()
    res.json({
      items: rows.map((row) => {
        let context = {}
        try { context = JSON.parse(row.context) } catch { /* 빈 정보 */ }
        return { id: row.id, kind: row.kind, message: row.message, context, images: parseImages(row.images),
          status: row.status, createdAt: row.created_at, username: row.username ?? null }
      }),
      counts: Object.fromEntries(['new', 'all', 'done', 'hidden'].map((key) => [key, Number(counts?.[key] ?? 0)])),
    })
  })

  router.patch('/:id', express.json({ limit: '4kb' }), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || !STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'invalid_input' })
    const info = database().prepare('UPDATE feedback SET status=?, updated_at=? WHERE id=?').run(req.body.status, now().toISOString(), id)
    if (!info.changes) return res.status(404).json({ error: 'not_found' })
    res.json({ id, status: req.body.status })
  })

  router.get('/:id/images/:key', (req, res) => {
    const row = database().prepare('SELECT images FROM feedback WHERE id=?').get(Number(req.params.id))
    const target = imagePath(root(), req.params.key)
    if (!row || !target || !parseImages(row.images).includes(req.params.key) || !fs.existsSync(target)) {
      return res.status(404).json({ error: 'not_found' })
    }
    res.set({
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    })
    fs.createReadStream(target).pipe(res)
  })

  return router
}
