import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'

const MAX_ROUTES = 100
// 브리핑은 고도까지 확정된 한 번의 비행이라 몇 개면 충분하다. 자동 삭제가 없고(같은 노선을
// 반복 비행하는 사용자가 많다) 수정할 때마다 새 항목이 쌓이므로 낮게 둔다.
export const MAX_BRIEFINGS = 5
const MAX_PAYLOAD = 20000 // snapshot JSON 상한(웨이포인트 폭주 방지)

// kind는 payload 안에만 있다(컬럼을 새로 만들지 않는다). 사용자당 최대 100행이라 훑어 세도
// 부담이 없다. 깨진 payload는 건너뛴다 — 여기서 던지면 저장 자체가 막힌다.
export function countSavedBriefings(db, userId) {
  return db.prepare('SELECT payload FROM routes WHERE user_id = ?').all(userId)
    .filter((row) => { try { return JSON.parse(row.payload).kind === 'briefing' } catch { return false } })
    .length
}

// snapshot = 프론트 저장 스냅샷(routeForm/vfrWaypoints/cruiseAltitudeFt/alternateAirport/etd 등). 유연 통과.
const createSchema = z.object({
  name: z.string().max(200).optional(),
  snapshot: z.record(z.string(), z.unknown()), // 유연 통과(프론트 폼 임의 필드)
})

// DB 행 → 프론트 엔트리({id,name,savedAt,...snapshot}) 복원.
function toEntry(row) {
  let snapshot = {}
  try { snapshot = JSON.parse(row.payload || '{}') } catch { /* 손상 시 빈 스냅샷 */ }
  return { id: row.id, name: row.name, savedAt: Date.parse(row.created_at) || 0, ...snapshot }
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
    if (parsed.data.snapshot?.kind === 'briefing' && countSavedBriefings(db2, req.session.userId) >= MAX_BRIEFINGS) {
      return res.status(400).json({ error: 'too_many_briefings' })
    }

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
