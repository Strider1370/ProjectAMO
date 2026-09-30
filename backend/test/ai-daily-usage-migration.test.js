import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

import { createDb } from '../src/db/index.js'

// 운영 DB에는 "0~5" 제약이 남은 표가 있다. 한도를 10으로 올려도 6번째 질문이 막히지 않아야 하고, 기록은 보존돼야 한다.
test('old ai_daily_usage capped at 5 is rebuilt without the cap and keeps its rows', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-ai-usage-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'old.db')
  const old = new Database(file)
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users(id) VALUES (1);
    CREATE TABLE ai_daily_usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 5),
      PRIMARY KEY (user_id, day)
    );
    INSERT INTO ai_daily_usage VALUES (1, '2026-09-30', 5);`)
  old.close()

  const db = createDb(file)
  t.after(() => db.close())
  assert.equal(db.prepare("SELECT used FROM ai_daily_usage WHERE user_id=1 AND day='2026-09-30'").get().used, 5)
  db.prepare("UPDATE ai_daily_usage SET used=used+1 WHERE user_id=1 AND day='2026-09-30'").run()
  assert.equal(db.prepare("SELECT used FROM ai_daily_usage WHERE user_id=1").get().used, 6)
  assert.throws(() => db.prepare("UPDATE ai_daily_usage SET used=-1").run(), /CHECK constraint/)
  // 두 번째 시작에서는 다시 옮기지 않는다.
  assert.doesNotThrow(() => createDb(file).close())
})
