import fs from 'node:fs'
import path from 'node:path'

export const MAX_ALL_MAP_BYTES = 500 * 1024 * 1024
export const MAX_MATERIAL_ORG_BYTES = 100 * 1024 * 1024
export const MIN_FREE_BYTES = 3 * 1024 ** 3
const pending = new WeakMap()
export class MapStorageError extends Error {
  constructor(code, status = 413) { super(code); this.code = code; this.status = status }
}
const materialBytes = "COALESCE(size_bytes,0) + length(CAST(metadata AS BLOB)) + length(CAST(blocks AS BLOB)) + 65536 + CASE WHEN thumbnail_storage_key IS NULL THEN 0 ELSE 1048576 END"
export function storageUsage(db, orgId = null) {
  if (orgId != null) return db.prepare(`SELECT COALESCE(SUM(${materialBytes}),0) AS bytes FROM organization_material_versions v JOIN organization_materials m ON m.id=v.material_id WHERE m.organization_id=?`).get(orgId).bytes
  return db.prepare(`SELECT
    (SELECT COALESCE(SUM(byte_length),0) FROM personal_maps) +
    (SELECT COALESCE(SUM(byte_length),0) FROM organization_map_versions) +
    (SELECT COALESCE(SUM(${materialBytes}),0) FROM organization_material_versions) AS bytes`).get().bytes
}
export function assertDiskSpace(location, growth, statfs = fs.statfsSync) {
  if (growth <= 0 || !location || location === ':memory:') return
  let target = path.resolve(location)
  while (!fs.existsSync(target) && path.dirname(target) !== target) target = path.dirname(target)
  const stat = statfs(target)
  if (Number(stat.bavail) * Number(stat.bsize) - growth < MIN_FREE_BYTES) throw new MapStorageError('map_storage_low_disk', 507)
}
export function assertMapGrowth(db, growth, { orgId = null, location = db.name } = {}) {
  if (growth <= 0) return
  const reservations = pending.get(db) ?? new Map()
  const reserved = [...reservations.values()].reduce((a,b) => a+b,0)
  if (Number(storageUsage(db)) + reserved + growth > MAX_ALL_MAP_BYTES) throw new MapStorageError('map_storage_full')
  if (orgId != null && Number(storageUsage(db,orgId)) + (reservations.get(orgId) ?? 0) + growth > MAX_MATERIAL_ORG_BYTES) throw new MapStorageError('organization_material_storage_full')
  assertDiskSpace(location, growth + reserved)
}
export function reserveMaterialBytes(db, orgId, bytes, location) {
  assertMapGrowth(db,bytes,{orgId,location})
  let reservations=pending.get(db)
  if (!reservations) { reservations=new Map(); pending.set(db,reservations) }
  reservations.set(orgId,(reservations.get(orgId)??0)+bytes)
  let active=true
  return () => { if(active) { active=false; const remaining=reservations.get(orgId)-bytes; if(remaining) reservations.set(orgId,remaining); else reservations.delete(orgId) } }
}
export function materialWriteBytes(file, content, prior = null) {
  return (file?.buffer.length ?? prior?.size_bytes ?? 0) + Buffer.byteLength(JSON.stringify(content.metadata)) + Buffer.byteLength(JSON.stringify(content.blocks)) + 65536 + ((file?.mimeType?.startsWith('image/') || (!file && prior?.thumbnail_storage_key)) ? 1048576 : 0)
}
