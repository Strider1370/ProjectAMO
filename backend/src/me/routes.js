import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'

const MAX_ROUTES = 100
const MAX_PAYLOAD = 20000 // snapshot JSON 상한(웨이포인트 폭주 방지)

const jsonObject = z.record(z.string(), z.unknown())
const procedureIdsSchema = z.object({
  sid: z.string().nullable(),
  star: z.string().nullable(),
  iapKey: z.string().nullable(),
}).strict()
const persistedDesignSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  kind: z.enum(['base', 'alternative']).optional(),
  routeForm: jsonObject,
  procedureIds: procedureIdsSchema,
  enroute: jsonObject,
  routeString: z.string(),
}).strict()

// 새 서버 저장은 프런트 normalizeRouteSnapshot()이 만드는 v3만 허용한다.
const createSchema = z.object({
  name: z.string().max(200).optional(),
  snapshot: z.object({
    version: z.literal(3),
    base: persistedDesignSchema,
    alternatives: z.array(persistedDesignSchema),
    selectedAlternativeId: z.string().nullable(),
    cruiseAltitudeFt: z.number().finite().optional(),
    etd: z.string().optional(),
    tasKt: z.number().finite().optional(),
    etaPolicy: jsonObject.optional(),
  }).strict(),
})

// DB 행 → 프론트 엔트리({id,name,savedAt,...snapshot}) 복원.
function toEntry(row) {
  const entry = { id: row.id, name: row.name, savedAt: Date.parse(row.created_at) || 0 }
  let snapshot
  try { snapshot = JSON.parse(row.payload) } catch { return { ...entry, invalidPayload: true } }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ...entry, invalidPayload: true }
  return { ...entry, ...snapshot }
}

// 내 저장 경로 CRUD. 모든 쿼리 session.userId로만 필터(클라 id 불신). requireAuth 필수.
export function createRoutesRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()

  router.use(requireAuth)

  router.get('/routes', (req, res) => {
    const rows = database()
      .prepare('SELECT id, name, created_at, payload FROM routes WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.session.userId)
    res.json({ routes: rows.map(toEntry) })
  })

  router.post('/routes', (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const snapshotJson = JSON.stringify(parsed.data.snapshot)
    if (snapshotJson.length > MAX_PAYLOAD) return res.status(400).json({ error: 'payload_too_large' })

    const db2 = database()
    const { n } = db2.prepare('SELECT COUNT(*) n FROM routes WHERE user_id = ?').get(req.session.userId)
    if (n >= MAX_ROUTES) return res.status(400).json({ error: 'too_many_routes' })

    const now = new Date().toISOString()
    const name = parsed.data.name || '이름 없는 경로'
    const etd = typeof parsed.data.snapshot.etd === 'string' ? parsed.data.snapshot.etd : null
    const info = db2
      .prepare('INSERT INTO routes (user_id, name, etd, payload, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(req.session.userId, name, etd, snapshotJson, now, now)
    const row = db2.prepare('SELECT id, name, created_at, payload FROM routes WHERE id = ?').get(info.lastInsertRowid)
    res.status(201).json(toEntry(row))
  })

  router.delete('/routes/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_input' })
    database().prepare('DELETE FROM routes WHERE id = ? AND user_id = ?').run(id, req.session.userId)
    res.json({ ok: true })
  })

  return router
}

export default createRoutesRouter
