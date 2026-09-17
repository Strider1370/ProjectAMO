import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createDb } from '../src/db/index.js'
import { backupDatabase, backupDir, hasBackupToday, lastBackup, listBackups } from '../src/admin/db-backup.js'

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

test('같은 분 재시도는 이전 성공본을 보존한 새 완료 세대로 게시한다', () => {
  const dir = base()
  const db = seeded()
  const first = backupDatabase(db, dir, { now: at('03:00') })
  assert.ok(!first.error, first.error)
  const second = backupDatabase(db, dir, { now: at('03:00') })
  assert.ok(!second.error, second.error)
  const backups = listBackups(dir)
  assert.equal(backups.length, 2)
  assert.equal(backups[0].path, second.path)
  assert.match(second.name, /1200-01\.db$/)
  assert.ok(fs.existsSync(first.path), '기존 성공본은 새 게시 전후에도 남는다')
})

test('DB marker 전 강제 종료가 남긴 orphan assets와 오래된 staging은 목록/다음 보관 정리에서 제거한다', () => {
  const dir = base()
  const db = seeded()
  const first = backupDatabase(db, dir, { now: at('01:00') })
  const backupRoot = backupDir(dir)
  const orphanDatabase = path.join(backupRoot, 'projectamo-20260811-1101.db')
  const orphanAssets = `${orphanDatabase}.assets`
  fs.cpSync(`${first.path}.assets`, orphanAssets, { recursive: true })
  const staleStaging = path.join(backupRoot, '.backup-staging-interrupted')
  fs.mkdirSync(staleStaging)
  const old = new Date(Date.now() - 7 * 60 * 60 * 1000)
  fs.utimesSync(staleStaging, old, old)

  assert.deepEqual(listBackups(dir).map((backup) => backup.path), [first.path])
  assert.equal(fs.existsSync(orphanAssets), false)
  assert.equal(fs.existsSync(staleStaging), false)

  const crashedDatabase = path.join(backupRoot, 'projectamo-20260811-1103.db')
  const crashedAssets = `${crashedDatabase}.assets`
  fs.cpSync(`${first.path}.assets`, crashedAssets, { recursive: true })
  const crashedStaging = path.join(backupRoot, '.backup-staging-crashed')
  fs.mkdirSync(crashedStaging)
  fs.writeFileSync(path.join(crashedStaging, 'owner.json'), JSON.stringify({ pid: 999999999 }))
  fs.writeFileSync(path.join(crashedStaging, 'publication.json'), JSON.stringify({ target: path.basename(crashedDatabase) }))
  listBackups(dir)
  assert.equal(fs.existsSync(crashedAssets), false, 'dead publisher is cleaned without waiting for staging age')
  assert.equal(fs.existsSync(crashedStaging), false)

  const laterOrphan = path.join(backupRoot, 'projectamo-20260811-1102.db.assets')
  fs.cpSync(`${first.path}.assets`, laterOrphan, { recursive: true })
  const second = backupDatabase(db, dir, { keep: 2, now: at('02:00') })
  assert.ok(!second.error, second.error)
  assert.equal(fs.existsSync(laterOrphan), false, 'retention before the next publication also cleans orphans')
  assert.deepEqual(listBackups(dir).map((backup) => backup.path), [second.path, first.path])
})

test('concurrent list does not delete assets claimed by a live staging publisher', () => {
  const dir = base()
  const db = seeded()
  let listedDuringPublication = false
  const result = backupDatabase(db, dir, {
    now: at('03:00'),
    onStage(stage, { target }) {
      if (stage !== 'assets-published') return
      listedDuringPublication = true
      assert.equal(fs.existsSync(`${target}.assets`), true)
      assert.deepEqual(listBackups(dir), [], 'DB marker is not published yet')
      assert.equal(fs.existsSync(`${target}.assets`), true, 'live staging claim protects the in-flight assets')
    },
  })
  assert.ok(listedDuringPublication)
  assert.ok(!result.error, result.error)
  assert.deepEqual(listBackups(dir).map((backup) => backup.path), [result.path])
})

test('assets-manifest 이전의 유효 SQLite backup은 계속 목록과 일일 판정에 포함한다', () => {
  const dir = base()
  const legacy = path.join(backupDir(dir), 'projectamo-20260811-1200.db')
  fs.mkdirSync(path.dirname(legacy), { recursive: true })
  const db = seeded()
  db.exec(`VACUUM INTO '${legacy.replace(/'/g, "''")}'`)

  assert.deepEqual(listBackups(dir).map((backup) => backup.path), [legacy])
  assert.equal(lastBackup(dir).path, legacy)
  assert.equal(hasBackupToday(dir, at('03:00')), true)
})

test('실패 단계와 잘못된 manifest는 이전 성공본/latest와 오늘 완료 판정을 보존한다', () => {
  const stages = ['vacuumed', 'assets-written', 'verified', 'before-publish', 'assets-published']
  for (const stage of stages) {
    const dir = base()
    const db = seeded()
    const previous = backupDatabase(db, dir, { now: at('03:00') })
    const failed = backupDatabase(db, dir, {
      now: at('03:00'),
      onStage(current, { stagedDatabase }) {
        if (current === 'assets-written' && stage === current) {
          fs.writeFileSync(`${stagedDatabase}.assets/manifest.json`, '{broken')
          return
        }
        if (current === stage) throw new Error(`forced ${stage}`)
      },
    })
    assert.ok(failed.error, stage)
    assert.deepEqual(listBackups(dir).map(backup => backup.path), [previous.path], stage)
    assert.equal(lastBackup(dir).path, previous.path, stage)
    assert.equal(hasBackupToday(dir, at('03:00')), true, stage)
    const entries = fs.readdirSync(backupDir(dir))
    assert.equal(entries.some(name => name.startsWith('.backup-staging-')), false, stage)
    assert.equal(entries.some(name => name.endsWith('-01.db.assets')), false, stage)
  }
})

test('미완성·손상 backup은 목록·retention에 성공본으로 노출되지 않는다', () => {
  const dir = base()
  const db = seeded()
  const first = backupDatabase(db, dir, { keep: 2, now: at('01:00') })
  const incomplete = path.join(backupDir(dir), 'projectamo-20260811-1101.db')
  fs.copyFileSync(first.path, incomplete)
  fs.mkdirSync(`${incomplete}.assets`)
  fs.writeFileSync(`${incomplete}.assets/manifest.json`, '{not-json')
  backupDatabase(db, dir, { keep: 2, now: at('02:00') })
  backupDatabase(db, dir, { keep: 2, now: at('03:00') })
  const backups = listBackups(dir)
  assert.equal(backups.length, 2)
  assert.equal(backups.some(backup => backup.path === incomplete), false)
  assert.ok(fs.existsSync(incomplete), 'retention은 검증되지 않은 파일을 성공본처럼 삭제하지 않는다')
})

test('실패해도 던지지 않고 error를 돌려준다 — 백업 때문에 서버가 죽으면 안 된다', () => {
  const broken = { exec: () => { throw new Error('disk full') } }
  const result = backupDatabase(broken, base())
  assert.equal(result.error, 'disk full')
  assert.equal(result.path, undefined)
})
