import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

import { createDb } from '../src/db/index.js'

test('기존 공항 알림 이력을 보존하면서 TAF 이벤트 저장 제약을 확장한다', (t) => {
  const artifacts = path.resolve('artifacts')
  fs.mkdirSync(artifacts, { recursive: true })
  const dir = fs.mkdtempSync(path.join(artifacts, 'airport-alert-migration-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const dbPath = path.join(dir, 'old.db')
  const initial = createDb(dbPath)
  initial.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .run(1, 'migration-user', 'unused', '2026-10-23T00:00:00Z')
  initial.close()
  const old = new Database(dbPath)
  old.exec('DROP TABLE airport_alert_events')
  old.exec(`CREATE TABLE airport_alert_events (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, icao TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('metar','airport_warning','lightning')),
    source_key TEXT, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    detected_at TEXT NOT NULL, resolved_at TEXT, read_at TEXT, pushed_at TEXT
  )`)
  old.prepare(`INSERT INTO airport_alert_events
    (id,user_id,icao,kind,source_key,payload,detected_at) VALUES (?,?,?,?,?,?,?)`)
    .run(41, 1, 'RKSI', 'metar', 'source', '{"metrics":[]}', '2026-10-23T00:00:00Z')
  old.close()

  const db = createDb(dbPath)
  t.after(() => db.close())
  assert.equal(db.prepare('SELECT kind FROM airport_alert_events WHERE id=41').get().kind, 'metar')
  db.prepare(`INSERT INTO airport_alert_events
    (user_id,icao,kind,source_key,payload,detected_at) VALUES (?,?,?,?,?,?)`)
    .run(1, 'RKSI', 'taf', 'taf-source', '{"text":"TAF RKSI"}', '2026-10-23T01:00:00Z')
  assert.equal(db.prepare("SELECT COUNT(*) n FROM airport_alert_events WHERE kind='taf'").get().n, 1)
  assert.doesNotThrow(() => db.exec('CREATE INDEX IF NOT EXISTS idx_airport_alert_events_user ON airport_alert_events(user_id,detected_at)'))
})
