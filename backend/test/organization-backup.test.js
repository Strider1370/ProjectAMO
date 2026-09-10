import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { backupDatabase } from '../src/admin/db-backup.js'
import { restoreOrganizationBackup, backupAssetsPath } from '../src/admin/organization-backup-files.js'

function fixture(t) {
  const base = path.resolve('artifacts/organization-lounge/backup-tests')
  fs.mkdirSync(base, { recursive: true })
  const root = fs.mkdtempSync(path.join(base, 'case-'))
  const filesRoot = path.join(root, 'private')
  fs.mkdirSync(filesRoot)
  const db = new Database(':memory:')
  db.exec('CREATE TABLE organization_material_versions (material_id INTEGER, version INTEGER, storage_key TEXT, thumbnail_storage_key TEXT)')
  const keys = ['immutable-v1', 'immutable-v2', 'thumbnail'].map(content => {
    const bytes = Buffer.from(content)
    const key = `${crypto.createHash('sha256').update(bytes).digest('hex')}.pdf`
    fs.writeFileSync(path.join(filesRoot, key), bytes)
    return key
  })
  db.prepare('INSERT INTO organization_material_versions VALUES (1,1,?,?)').run(keys[0], keys[2])
  db.prepare('INSERT INTO organization_material_versions VALUES (1,2,?,?)').run(keys[1], keys[2])
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { db, root, filesRoot, keys }
}

test('SQLite snapshot backs up every immutable material version and restores verified private bytes', t => {
  const { db, root, filesRoot, keys } = fixture(t)
  const backup = backupDatabase(db, root, { filesRoot })
  assert.equal(backup.error, undefined)
  const targetDatabase = path.join(root, 'restored', 'projectamo.db')
  const targetFiles = path.join(root, 'restored-private')
  const result = restoreOrganizationBackup(backup.path, { targetDatabase, targetFiles })
  assert.equal(result.fileCount, 3)
  const restored = new Database(targetDatabase, { readonly: true })
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM organization_material_versions').get().n, 2)
  restored.close()
  for (const key of keys) assert.deepEqual(fs.readFileSync(path.join(targetFiles, key)), fs.readFileSync(path.join(filesRoot, key)))
  assert.throws(() => restoreOrganizationBackup(backup.path, { targetDatabase, targetFiles }), /must not exist/)
})

test('missing original fails the backup, corrupted backup refuses restoration before writing targets', t => {
  const { db, root, filesRoot, keys } = fixture(t)
  const backup = backupDatabase(db, root, { filesRoot })
  fs.writeFileSync(path.join(backupAssetsPath(backup.path), keys[0]), 'corrupted')
  const targetDatabase = path.join(root, 'restored.db'), targetFiles = path.join(root, 'restored-files')
  assert.throws(() => restoreOrganizationBackup(backup.path, { targetDatabase, targetFiles }), /integrity mismatch/)
  assert.equal(fs.existsSync(targetDatabase), false)
  assert.equal(fs.existsSync(targetFiles), false)
  fs.unlinkSync(path.join(filesRoot, keys[0]))
  const failed = backupDatabase(db, root, { filesRoot, now: Date.now() + 60000 })
  assert.match(failed.error, /ENOENT/)
  assert.equal(failed.path, undefined)
})
