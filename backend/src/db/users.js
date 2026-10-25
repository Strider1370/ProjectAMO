import { randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'

import { normalizeForecasterAirports } from '../auth/forecaster-airports.js'

const BCRYPT_COST = 12
export const ROLES = ['pilot', 'forecaster', 'admin']

function parseAirports(json) {
  try { const a = JSON.parse(json || 'null'); return Array.isArray(a) ? a : null } catch { return null }
}

// 유저 생성 + bcrypt 해시. 스크립트(관리자 생성)와 step2 register가 공유.
// 검증 실패/중복은 코드형 Error(username_taken 등) throw — 호출자가 매핑.
export function createUser(db, { username, password, role = 'pilot', displayName = null, airports = null, status = 'active' }) {
  if (!/^[A-Za-z0-9_]{3,32}$/.test(String(username || ''))) throw new Error('invalid_username')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('invalid_password')
  if (!ROLES.includes(role)) throw new Error('invalid_role')

  // 담당공항은 예보관만 의미. 7개 집합만 저장.
  const airportsJson = role === 'forecaster' ? JSON.stringify(normalizeForecasterAirports(airports) ?? []) : null

  const hash = bcrypt.hashSync(password, BCRYPT_COST)
  const now = new Date().toISOString()
  try {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, role, display_name, airports, status, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(username, hash, role, displayName ?? username, airportsJson, status, now)
    return { id: info.lastInsertRowid, username, role, display_name: displayName ?? username, airports: parseAirports(airportsJson) }
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) throw new Error('username_taken')
    throw err
  }
}

// 더미 해시 — 유저 없을 때도 compare를 돌려 타이밍으로 존재여부가 새지 않게.
const DUMMY_HASH = bcrypt.hashSync('dummy-timing-guard', BCRYPT_COST)

// 로그인 검증. 실패(없는 유저·비번 불일치) 모두 null → 라우터가 동일 401.
export function verifyLogin(db, username, password) {
  const row = db
    .prepare('SELECT id, username, password_hash, role, display_name, airports, status FROM users WHERE username = ?')
    .get(username)
  if (!row) {
    bcrypt.compareSync(String(password ?? ''), DUMMY_HASH) // 타이밍 평준화
    return null
  }
  if (!bcrypt.compareSync(String(password ?? ''), row.password_hash)) return null
  return { id: row.id, username: row.username, role: row.role, display_name: row.display_name, airports: parseAirports(row.airports), status: row.status }
}

// 공개 유저 형태(비번 제외, 담당공항 파싱). /me·예보관 라우터 공용.
export function getUserById(db, id) {
  const row = db.prepare('SELECT id, username, role, display_name, airports FROM users WHERE id = ?').get(id)
  if (!row) return null
  return { id: row.id, username: row.username, role: row.role, display_name: row.display_name, airports: parseAirports(row.airports) }
}

// 관리자 콘솔: 전체 사용자·승인 대기·상태 변경.
export function listUsers(db) {
  return db.prepare('SELECT id, username, role, status, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
}
export function listPending(db) {
  return db.prepare("SELECT id, username, role, created_at FROM users WHERE status='pending' ORDER BY created_at").all()
}
export function setUserStatus(db, id, status) {
  if (!['pending', 'active', 'rejected'].includes(status)) throw new Error('invalid_status')
  return db.prepare('UPDATE users SET status=? WHERE id=?').run(status, id).changes
}

// 회원 탈퇴(관리자). 개인 자료와 로그인 세션을 지우고 계정을 삭제한다.
// 기관에 남긴 기록(작성한 공지·비행 등)은 지울 수 없어서, 그런 계정은 행만 남기고
// 아이디·이름·비밀번호를 지워 다시 로그인하거나 알아볼 수 없게 한다.
export function withdrawUser(db, id) {
  const user = db.prepare('SELECT id, role FROM users WHERE id=? AND deleted_at IS NULL').get(id)
  if (!user) return { ok: false, error: 'user_not_found' }
  if (user.role === 'admin') return { ok: false, error: 'cannot_withdraw_admin' }
  const tableExists = (name) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
  const scrambled = bcrypt.hashSync(randomBytes(32).toString('hex'), 4)
  let mode = 'deleted'
  db.transaction(() => {
    const routeIds = 'SELECT id FROM routes WHERE user_id=?'
    db.prepare(`DELETE FROM triggered_alerts WHERE user_id=? OR route_id IN (${routeIds})`).run(id, id)
    db.prepare(`DELETE FROM requests WHERE pilot_id=? OR route_id IN (${routeIds})`).run(id, id)
    db.prepare('UPDATE requests SET assigned_forecaster=NULL WHERE assigned_forecaster=?').run(id)
    for (const table of ['routes', 'presets', 'push_subscriptions', 'organization_alert_user_states', 'organization_members']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id)
    }
    if (tableExists('sessions')) db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId')=?").run(id)
    try {
      db.transaction(() => db.prepare('DELETE FROM users WHERE id=?').run(id))()
    } catch (err) {
      if (!String(err?.message || '').includes('FOREIGN KEY')) throw err
      mode = 'anonymized'
      // 계정 삭제였다면 연쇄로 지워졌을 개인 자료(알림 감시·내 지도·기상이 설정 등)를 직접 지운다.
      for (const [table, column] of [['route_sigmet_events', 'user_id'], ['route_sigmet_watches', 'user_id'], ['user_alert_deliveries', 'user_id'],
        ['airport_alert_events', 'user_id'], ['airport_alert_watches', 'user_id'], ['user_alert_test_runs', 'user_id'], ['personal_maps', 'owner_id'],
        ['ai_confirmations', 'user_id'], ['ai_credentials', 'user_id'], ['ai_settings', 'user_id'], ['ai_daily_usage', 'user_id'], ['ai_question_requests', 'user_id']]) {
        if (tableExists(table)) db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(id)
      }
      db.prepare(`UPDATE users SET username=?, display_name='탈퇴한 사용자', password_hash=?, status='rejected',
        min_ceiling_ft=NULL, min_visibility_m=NULL, deleted_at=? WHERE id=?`)
        .run(`deleted_${id}`, scrambled, new Date().toISOString(), id)
    }
  })()
  return { ok: true, mode }
}

export default { createUser, withdrawUser, verifyLogin, getUserById, listUsers, listPending, setUserStatus, ROLES }
