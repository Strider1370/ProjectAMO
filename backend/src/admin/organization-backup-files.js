import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'

export const organizationFilesRoot = () => path.resolve(process.env.ORGANIZATION_FILES_PATH || (process.env.NODE_ENV === 'production'
  ? '/opt/projectamo/shared/organization-files'
  : fileURLToPath(new URL('../../../artifacts/organization-files/', import.meta.url))))
export const backupAssetsPath = (databasePath) => `${databasePath}.assets`
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
function safeFile(root, key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(key)) throw new Error('Invalid organization storage key')
  return path.join(root, key)
}

// Read references from the SQLite snapshot, so concurrent uploads cannot make the
// backup database refer to a file omitted by a preceding live-directory scan.
export function backupOrganizationFiles(databasePath, filesRoot = organizationFilesRoot()) {
  const snapshot = new Database(databasePath, { readonly: true })
  let keys
  try {
    const exists = snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='organization_material_versions'").get()
    keys = exists ? snapshot.prepare('SELECT storage_key AS key FROM organization_material_versions WHERE storage_key IS NOT NULL UNION SELECT thumbnail_storage_key AS key FROM organization_material_versions WHERE thumbnail_storage_key IS NOT NULL').all().map(row => row.key) : []
  } finally { snapshot.close() }
  const target = backupAssetsPath(databasePath)
  fs.mkdirSync(target, { recursive: true, mode: 0o700 })
  const files = keys.map(key => {
    const bytes = fs.readFileSync(safeFile(filesRoot, key))
    if (hash(bytes) !== key.split('.')[0]) throw new Error(`Organization file content mismatch: ${key}`)
    fs.writeFileSync(safeFile(target, key), bytes, { mode: 0o600 })
    return { key, bytes: bytes.length, sha256: hash(bytes) }
  })
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ version: 1, databaseSha256: hash(fs.readFileSync(databasePath)), files }, null, 2), { mode: 0o600 })
  return files.length
}

// Restore into new destinations only; production switching remains an explicit
// deployment operation after inspecting this restored copy.
export function restoreOrganizationBackup(databasePath, { targetDatabase, targetFiles }) {
  if (!targetDatabase || !targetFiles) throw new Error('Both restore destinations are required')
  if (fs.existsSync(targetDatabase) || fs.existsSync(targetFiles)) throw new Error('Restore destinations must not exist')
  const assets = backupAssetsPath(databasePath)
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8'))
  const database = fs.readFileSync(databasePath)
  if (manifest.version !== 1 || hash(database) !== manifest.databaseSha256) throw new Error('Backup database integrity mismatch')
  const validated = manifest.files.map(file => {
    const bytes = fs.readFileSync(safeFile(assets, file.key))
    if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Backup file integrity mismatch: ${file.key}`)
    return { key: file.key, bytes }
  })
  fs.mkdirSync(path.dirname(targetDatabase), { recursive: true })
  fs.mkdirSync(targetFiles, { recursive: true, mode: 0o700 })
  try {
    for (const file of validated) fs.writeFileSync(safeFile(targetFiles, file.key), file.bytes, { flag: 'wx', mode: 0o600 })
    fs.writeFileSync(targetDatabase, database, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    fs.rmSync(targetFiles, { recursive: true, force: true })
    throw error
  }
  return { database: targetDatabase, files: targetFiles, fileCount: validated.length }
}
