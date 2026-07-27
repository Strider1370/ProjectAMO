import { Router } from 'express'
import rateLimit from 'express-rate-limit'

import { getDb } from '../db/index.js'
import { createUser, verifyLogin, getUserById } from '../db/users.js'
import { registerSchema, loginSchema } from './validation.js'
import { requireAuth } from './middleware.js'
import { ABSOLUTE_TTL_MS } from './session.js'

// 무차별 대입·계정 남발 방지. IP당 제한(nginx trust proxy). 라우터 인스턴스별 인메모리 스토어.
function makeLimiter(windowMs, limit) {
  return rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    validate: { trustProxy: false }, // nginx가 신뢰 프록시 — 경고 억제
    message: { error: 'too_many_requests' },
  })
}

// db 주입 가능(테스트). 기본은 앱 공용 싱글턴.
export function createAuthRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  const loginLimiter = makeLimiter(15 * 60 * 1000, 10) // 로그인 15분에 10회
  const registerLimiter = makeLimiter(60 * 60 * 1000, 5) // 가입 1시간에 5회

  // 회원가입: 조종사만 공개 등록. 예보관은 관리자가 create-user CLI로만 생성.
  router.post('/register', registerLimiter, (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
    if (parsed.data.role === 'forecaster') {
      return res.status(400).json({ error: 'forecaster_approval_required' })
    }
    try {
      createUser(database(), { username: parsed.data.username, password: parsed.data.password, role: 'pilot', status: 'pending' })
    } catch (err) {
      // 계정 열거 방지: 중복 아이디도 동일 성공응답(내부만 무시). 그 외 검증오류는 400.
      if (err.message !== 'username_taken') return res.status(400).json({ error: 'invalid_input' })
    }
    return res.status(201).json({ ok: true })
  })

  // 로그인: 성공 시 세션·쿠키. 실패는 존재여부 안 흘리고 동일 401.
  router.post('/login', loginLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return res.status(401).json({ error: 'invalid_credentials' })
    const user = verifyLogin(database(), parsed.data.username, parsed.data.password)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })
    if (user.status !== 'active') {
      return res.status(403).json({ error: user.status === 'rejected' ? 'account_rejected' : 'pending_approval' })
    }
    req.session.userId = user.id
    req.session.role = user.role
    req.session.absoluteExpiry = Date.now() + ABSOLUTE_TTL_MS
    database().prepare('UPDATE users SET last_active_at=? WHERE id=?').run(new Date().toISOString(), user.id)
    return res.json({ id: user.id, username: user.username, role: user.role, display_name: user.display_name })
  })

  router.post('/logout', requireAuth, (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('amo.sid')
      res.json({ ok: true })
    })
  })

  router.get('/me', requireAuth, (req, res) => {
    const u = getUserById(database(), req.session.userId)
    if (!u) return res.status(401).json({ error: 'unauthenticated' })
    return res.json(u)
  })

  return router
}

export default createAuthRouter
