import crypto from 'node:crypto'
import session from 'express-session'
import SqliteStoreFactory from 'better-sqlite3-session-store'

import { getDb } from '../db/index.js'

const SqliteStore = SqliteStoreFactory(session)

export const ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000 // 절대 만료 24h (로그인 시각 기준)
export const IDLE_TTL_MS = 60 * 60 * 1000 // 유휴 만료 1h (rolling으로 활동마다 리셋)

function resolveSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production (.env, openssl rand -hex 32)')
  }
  // 개발 편의: 미설정 시 임시 시크릿(재시작하면 세션 무효). .env로 고정 권장.
  console.warn('[auth] SESSION_SECRET 미설정 — 개발용 임시 시크릿 사용(재시작 시 세션 소실).')
  return crypto.randomBytes(32).toString('hex')
}

// express-session 미들웨어. db 주입 가능(테스트용). 세션 테이블은 스토어가 생성·정리.
// 주의: SQLite 스토어의 만료정리 setInterval은 unref 안 됨(라이브러리) → 테스트는 MemoryStore 주입.
export function sessionMiddleware({
  db = getDb(),
  secret = resolveSecret(),
  store = new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 },
  }),
} = {}) {
  return session({
    store,
    name: 'amo.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // 유휴 타임아웃: 요청마다 maxAge 갱신
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // 운영만 Secure(로컬 http 개발 안 깨짐)
      sameSite: 'lax',
      maxAge: IDLE_TTL_MS,
    },
  })
}

export default { sessionMiddleware, ABSOLUTE_TTL_MS, IDLE_TTL_MS }
