import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { countSavedBriefings, MAX_BRIEFINGS } from '../src/me/routes.js'

const now = new Date().toISOString()

const seedUser = (db, username) =>
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run(username, 'x', now).lastInsertRowid

const seedSaved = (db, userId, snapshot) =>
  db.prepare('INSERT INTO routes (user_id, name, payload, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(userId, 'n', JSON.stringify(snapshot), now, now).lastInsertRowid

test('countSavedBriefings: 브리핑만 센다 — 경로와 kind 없는 구형 저장분은 빼고', () => {
  const db = createDb(':memory:')
  try {
    const uid = seedUser(db, 'pilot')
    seedSaved(db, uid, { kind: 'briefing' })
    seedSaved(db, uid, { kind: 'briefing' })
    seedSaved(db, uid, { kind: 'route' })
    seedSaved(db, uid, {}) // 2단계까지 저장된 것들 — 경로로 본다

    assert.equal(countSavedBriefings(db, uid), 2)
  } finally { db.close() }
})

test('countSavedBriefings: 남의 브리핑은 세지 않는다', () => {
  const db = createDb(':memory:')
  try {
    const mine = seedUser(db, 'mine')
    const other = seedUser(db, 'other')
    seedSaved(db, mine, { kind: 'briefing' })
    seedSaved(db, other, { kind: 'briefing' })
    seedSaved(db, other, { kind: 'briefing' })

    assert.equal(countSavedBriefings(db, mine), 1)
  } finally { db.close() }
})

test('countSavedBriefings: 깨진 payload는 건너뛴다 — 상한 검사가 터지면 저장 자체가 막힌다', () => {
  const db = createDb(':memory:')
  try {
    const uid = seedUser(db, 'pilot')
    db.prepare('INSERT INTO routes (user_id, name, payload, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(uid, 'broken', '{not json', now, now)
    seedSaved(db, uid, { kind: 'briefing' })

    assert.equal(countSavedBriefings(db, uid), 1)
  } finally { db.close() }
})

test('상한에 닿으면 더 담지 않는다', () => {
  const db = createDb(':memory:')
  try {
    const uid = seedUser(db, 'pilot')
    for (let i = 0; i < MAX_BRIEFINGS; i += 1) seedSaved(db, uid, { kind: 'briefing' })

    assert.equal(countSavedBriefings(db, uid), MAX_BRIEFINGS)
    assert.ok(countSavedBriefings(db, uid) >= MAX_BRIEFINGS, '6번째 저장은 거부돼야 한다')
  } finally { db.close() }
})
