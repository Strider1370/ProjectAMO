import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { recordVisit, trafficStats } from '../src/admin/visits.js'

test('recordVisit upserts; trafficStats counts online(5m) and total', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'vis-1'); recordVisit(db, 'vis-1'); recordVisit(db, 'vis-2')
  const s = trafficStats(db)
  assert.equal(s.total, 2)
  assert.equal(s.online, 2) // 방금 기록 → 5분 내
})

test('trafficStats.activeUsers: 로그인 계정의 last_active_at 기준, 방문 쿠키와는 별개 집계', () => {
  const db = createDb(':memory:')
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 40 * 86400e3).toISOString()
  db.prepare("INSERT INTO users (username, password_hash, created_at, last_active_at) VALUES (?,?,?,?)").run('recent', 'x', now, now)
  db.prepare("INSERT INTO users (username, password_hash, created_at, last_active_at) VALUES (?,?,?,?)").run('stale', 'x', now, old)
  db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)").run('never', 'x', now)

  const s = trafficStats(db)
  assert.equal(s.activeUsers.last7d, 1)
  assert.equal(s.activeUsers.last30d, 1)
})
