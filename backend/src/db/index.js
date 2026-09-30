import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import config from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

// 기존 DB의 누락 컬럼 추가(마이그레이션). idempotent.
// schema.exec '전에' 돌아야 함 — schema.sql의 인덱스가 이 컬럼들을 참조하므로, 기존 테이블에 없으면
// exec가 "no such column"으로 크래시한다. 신규 DB(테이블 아직 없음)에선 스킵하고 exec가 통째로 만든다.
function ensureColumns(database) {
  const tableExists = (t) => database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)

  if (tableExists('routes')) {
    const routeCols = database.prepare('PRAGMA table_info(routes)').all().map((c) => c.name)
    if (!routeCols.includes('payload')) database.exec('ALTER TABLE routes ADD COLUMN payload TEXT')
    // #13 알림 컬럼(예정비행만 의미). 기존 행은 기본값으로 안전.
    if (!routeCols.includes('eta')) database.exec('ALTER TABLE routes ADD COLUMN eta TEXT')
    if (!routeCols.includes('alert_enabled')) database.exec('ALTER TABLE routes ADD COLUMN alert_enabled INTEGER NOT NULL DEFAULT 0')
    if (!routeCols.includes('alert_start_min_before_etd')) database.exec('ALTER TABLE routes ADD COLUMN alert_start_min_before_etd INTEGER NOT NULL DEFAULT 120')
    if (!routeCols.includes('altitude_filter_ft')) database.exec('ALTER TABLE routes ADD COLUMN altitude_filter_ft INTEGER NOT NULL DEFAULT 4000')
    if (!routeCols.includes('send_no_change_confirm')) database.exec('ALTER TABLE routes ADD COLUMN send_no_change_confirm INTEGER NOT NULL DEFAULT 0')
    if (!routeCols.includes('confirm_min_before_etd')) database.exec('ALTER TABLE routes ADD COLUMN confirm_min_before_etd INTEGER NOT NULL DEFAULT 60')
    if (!routeCols.includes('last_briefing_snapshot_id')) database.exec('ALTER TABLE routes ADD COLUMN last_briefing_snapshot_id TEXT')
    if (!routeCols.includes('expires_at')) database.exec('ALTER TABLE routes ADD COLUMN expires_at TEXT')
  }

  if (tableExists('users')) {
    const userCols = database.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
    if (!userCols.includes('airports')) database.exec('ALTER TABLE users ADD COLUMN airports TEXT') // 예보관 담당공항(JSON 배열), #6
    if (!userCols.includes('status')) database.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'") // 가입 승인(기존=active)
    if (!userCols.includes('min_ceiling_ft')) database.exec('ALTER TABLE users ADD COLUMN min_ceiling_ft INTEGER') // #13 개인 미니마(단일값)
    if (!userCols.includes('min_visibility_m')) database.exec('ALTER TABLE users ADD COLUMN min_visibility_m INTEGER')
    if (!userCols.includes('last_active_at')) database.exec('ALTER TABLE users ADD COLUMN last_active_at TEXT') // 관리자 콘솔 "활성 사용자" — 로그인 시각 기준
  }

  if (tableExists('organization_briefing_runs')) {
    const runCols = database.prepare('PRAGMA table_info(organization_briefing_runs)').all().map((c) => c.name)
    if (!runCols.includes('active_flight_id')) database.exec('ALTER TABLE organization_briefing_runs ADD COLUMN active_flight_id INTEGER')
  }

  if (tableExists('organization_alerts')) {
    const alertCols = database.prepare('PRAGMA table_info(organization_alerts)').all().map((c) => c.name)
    if (!alertCols.includes('acknowledged_version')) database.exec('ALTER TABLE organization_alerts ADD COLUMN acknowledged_version INTEGER')
  }
}

// 기상이 하루 질문 수 표는 처음에 "0~5"로 묶여 있었다. SQLite는 CHECK를 고칠 수 없어서
// 옛 제약이 남은 표만 새 표로 옮겨 만든다(기록 보존). 이미 옮긴 DB나 새 DB에서는 아무 일도 하지 않는다.
function relaxAiDailyUsageCap(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_daily_usage'").get()
  if (!table?.sql?.includes('BETWEEN 0 AND 5')) return
  database.transaction(() => {
    database.exec(`CREATE TABLE ai_daily_usage_new (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
      PRIMARY KEY (user_id, day)
    )`)
    database.exec('INSERT INTO ai_daily_usage_new(user_id, day, used) SELECT user_id, day, used FROM ai_daily_usage')
    database.exec('DROP TABLE ai_daily_usage')
    database.exec('ALTER TABLE ai_daily_usage_new RENAME TO ai_daily_usage')
  })()
}

// 스키마 적용된 연결 생성. dbPath=':memory:'면 테스트용 인메모리.
export function createDb(dbPath) {
  const database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON') // REFERENCES 강제(better-sqlite3 기본 off)
  ensureColumns(database) // 기존 DB 누락 컬럼 먼저 채움(아래 schema 인덱스가 참조) — 신규 DB에선 no-op
  relaxAiDailyUsageCap(database)
  database.exec(schema)
  return database
}

let db = null

// 앱 공용 싱글턴. backend/data/projectamo.db (data/는 gitignore).
export function getDb() {
  if (db) return db
  fs.mkdirSync(config.storage.base_path, { recursive: true })
  db = createDb(path.join(config.storage.base_path, 'projectamo.db'))
  return db
}

export default { createDb, getDb }
