import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../db/index.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { vapidPublicKey, sendPush } from '../push/send.js'

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

// Web Push(VAPID) 구독 등록/해지 + admin 테스트 발송. push_subscriptions는 schema.sql에 이미 존재(#13 Phase 2).
export function createPushRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)

  router.get('/push/vapid-public-key', (_req, res) => {
    const key = vapidPublicKey()
    if (!key) return res.status(503).json({ error: 'vapid_not_configured' })
    res.json({ key })
  })

  router.post('/push/subscribe', (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
    const { endpoint, keys } = parsed.data
    database().prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth
    `).run(req.session.userId, endpoint, keys.p256dh, keys.auth, new Date().toISOString())
    res.status(201).json({ ok: true })
  })

  router.delete('/push/subscribe', (req, res) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null
    if (!endpoint) return res.status(400).json({ error: 'invalid_input' })
    database().prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(req.session.userId, endpoint)
    res.json({ ok: true })
  })

  // 관리자 전용 테스트 발송 — 자기 자신의 구독 전체로 고정 문구 발송.
  router.post('/push/test', requireRole('admin'), async (req, res) => {
    const subs = database().prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?').all(req.session.userId)
    if (!subs.length) return res.status(400).json({ error: 'no_subscription' })

    const payload = { title: 'ProjectAMO 테스트 알림', body: '푸시 알림이 정상 도착했습니다.' }
    let sent = 0
    const stale = []
    for (const s of subs) {
      try {
        await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent += 1
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) stale.push(s.id)
        else throw e
      }
    }
    if (stale.length) {
      const del = database().prepare('DELETE FROM push_subscriptions WHERE id=?')
      stale.forEach((id) => del.run(id))
    }
    res.json({ ok: true, sent, pruned: stale.length })
  })

  return router
}

export default createPushRouter
