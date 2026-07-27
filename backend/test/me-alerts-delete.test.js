import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'

const now = new Date().toISOString()

// DELETE /api/me/alerts/:id의 실제 로직(하드 삭제 시도 → FK로 막히면 감시만 끄기)을
// 라우터 없이 같은 SQL로 재현해 검증한다. 라우터는 requireAuth(세션) 배선이 있어
// 이 파일의 다른 테스트들처럼 DB 계층만 순수하게 확인한다.
function deleteOrDisable(db, id, userId) {
  try {
    db.prepare('DELETE FROM routes WHERE id=? AND user_id=? AND alert_enabled=1').run(id, userId)
  } catch {
    db.prepare('UPDATE routes SET alert_enabled=0, updated_at=? WHERE id=? AND user_id=?').run(new Date().toISOString(), id, userId)
  }
}

test('감시 취소: 알림 이력이 없으면 실제로 삭제된다', () => {
  const db = createDb(':memory:')
  try {
    const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run('u', 'x', now).lastInsertRowid
    const rid = db.prepare('INSERT INTO routes (user_id, alert_enabled, created_at, updated_at) VALUES (?,1,?,?)').run(uid, now, now).lastInsertRowid

    deleteOrDisable(db, rid, uid)

    assert.equal(db.prepare('SELECT 1 FROM routes WHERE id=?').get(rid), undefined)
  } finally { db.close() }
})

test('감시 취소: 알림 이력이 있으면 삭제 대신 alert_enabled=0으로 감시만 끈다', () => {
  const db = createDb(':memory:')
  try {
    const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)').run('u', 'x', now).lastInsertRowid
    const rid = db.prepare('INSERT INTO routes (user_id, alert_enabled, created_at, updated_at) VALUES (?,1,?,?)').run(uid, now, now).lastInsertRowid
    db.prepare(`INSERT INTO triggered_alerts (user_id, route_id, type, severity, dedup_key, detected_at)
      VALUES (?,?,?,?,?,?)`).run(uid, rid, 'CEIL', 'HIGH', 'CEIL:x', now)

    deleteOrDisable(db, rid, uid)

    const row = db.prepare('SELECT alert_enabled FROM routes WHERE id=?').get(rid)
    assert.ok(row, '행은 남는다')
    assert.equal(row.alert_enabled, 0, '감시는 꺼진다')
    assert.equal(db.prepare('SELECT 1 FROM triggered_alerts WHERE route_id=?').get(rid) != null, true, '알림 기록은 보존된다')
  } finally { db.close() }
})
