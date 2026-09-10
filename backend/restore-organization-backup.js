import { restoreOrganizationBackup } from './src/admin/organization-backup-files.js'
const [sourceDatabase, targetDatabase, targetFiles] = process.argv.slice(2)
if (!sourceDatabase || !targetDatabase || !targetFiles) {
  console.error('Usage: node backend/restore-organization-backup.js BACKUP.db NEW_DATABASE.db NEW_PRIVATE_FILES_DIR')
  process.exitCode = 1
} else {
  try { console.log(JSON.stringify(restoreOrganizationBackup(sourceDatabase, { targetDatabase, targetFiles }), null, 2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
