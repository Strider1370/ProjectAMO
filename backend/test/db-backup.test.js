import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createDb } from '../src/db/index.js'
import { backupDatabase, lastBackup, listBackups } from '../src/admin/db-backup.js'

const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'))

// 파일에 붙는 시각이 분 단위라, 여러 개를 만드는 테스트는 시각을 주입해 분을 벌린다.
const at = (hhmm) => Date.parse(`2026-08-11T${hhmm}:00Z`)

function seeded() {
  const db = createDb(':memory:')
  db.prepare('INSERT INTO visits (visitor_id, first_seen, last_seen) VALUES (?,?,?)')
    .run('v1', '2026-08-11T00:00:00Z', '2026-08-11T00:00:00Z')
  return db
}

test('백업 파일이 만들어지고 실제로 열리는 DB다', () => {
  const dir = base()
  const result = backupDatabase(seeded(), dir)
  assert.ok(!result.error, result.error)
  assert.ok(result.bytes > 0)
  assert.ok(fs.existsSync(result.path))

  // 사본을 다시 열어 내용이 살아 있는지 본다 — 파일만 생기고 못 여는 백업은 백업이 아니다.
  const restored = createDb(result.path)
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM visits').get().n, 1)
})

test('lastBackup은 가장 최근 것을 준다', () => {
  const dir = base()
  const db = seeded()
  backupDatabase(db, dir, { now: at('01:00') })
  backupDatabase(db, dir, { now: at('02:00') })
  assert.match(lastBackup(dir).name, /1100\.db$/, 'KST 11시 = UTC 02시')
})

test('백업이 하나도 없으면 null이다', () => {
  assert.equal(lastBackup(base()), null)
})

test('keep개만 남기고 오래된 것부터 지운다', () => {
  const dir = base()
  const db = seeded()
  for (const hh of ['01', '02', '03', '04', '05']) backupDatabase(db, dir, { keep: 3, now: at(`${hh}:00`) })
  const kept = listBackups(dir)
  assert.equal(kept.length, 3)
  assert.match(kept[0].name, /1400\.db$/, '가장 최근(KST 14시)이 남아야 한다')
  assert.ok(!kept.some((b) => b.name.includes('1000')), '가장 오래된 것은 지워져야 한다')
})

test('같은 분에 두 번 불러도 실패하지 않는다', () => {
  const dir = base()
  const db = seeded()
  assert.ok(!backupDatabase(db, dir, { now: at('03:00') }).error)
  const second = backupDatabase(db, dir, { now: at('03:00') })
  assert.ok(!second.error, second.error)
  assert.equal(listBackups(dir).length, 1, '같은 이름이면 덮어쓴다')
})

test('실패해도 던지지 않고 error를 돌려준다 — 백업 때문에 서버가 죽으면 안 된다', () => {
  const broken = { exec: () => { throw new Error('disk full') } }
  const result = backupDatabase(broken, base())
  assert.equal(result.error, 'disk full')
  assert.equal(result.path, undefined)
})
