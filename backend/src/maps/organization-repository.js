import { assertMapGrowth } from './storage-budget.js'
import { OrganizationError, integerId, nowIso, optionalText, requireText } from '../organizations/common.js'

// 기관 quota는 공유 중단된 지도의 불변 버전까지 포함한다. 삭제 뒤 곧바로 같은
// 용량을 다시 발표해 history 저장소를 우회하지 못하게 하며, 13.45MiB 원본도 약 19개
// 버전(초기 포함)은 보관할 수 있다.
// 개인 계정 제한과 별도로 유지한다. 기존 기관 자료의 버전 정책은 변경하지 않는다.
export const MAX_ORGANIZATION_VERSION_BYTES = 256 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024

function mapId(value) {
  return integerId(value, 'mapId')
}

function personalMapId(value) {
  if (typeof value !== 'string' || !value || value.length > 200) throw new OrganizationError(400, 'invalid_input', { field: 'personalMapId' })
  return value
}

function expectedPersonalRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new OrganizationError(400, 'expected_personal_revision_required')
  return value
}

function expectedSharedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new OrganizationError(400, 'expected_shared_version_required')
  return value
}

function parseSnapshot(row) {
  try { return JSON.parse(row.snapshot) } catch { throw new OrganizationError(500, 'map_storage_corrupt') }
}

function personalRow(db, ownerId, id) {
  const row = db.prepare('SELECT id, revision, snapshot, byte_length, item_count, group_count FROM personal_maps WHERE id=? AND owner_id=?').get(id, ownerId)
  if (!row) throw new OrganizationError(404, 'personal_map_not_found')
  return row
}

function assertPersonalRevision(row, expected) {
  if (Number(row.revision) !== expected) throw new OrganizationError(409, 'personal_revision_conflict', { currentRevision: Number(row.revision) })
}

function currentRow(db, organizationId, id, { includeDeleted = false } = {}) {
  const row = db.prepare(`SELECT m.id,m.organization_id,m.publisher_user_id,m.current_version,m.deleted_at,m.created_at,m.updated_at,
      v.version,v.source_personal_map_id,v.source_personal_revision,v.name,v.note,v.snapshot,v.byte_length,v.item_count,v.group_count,v.created_by,v.created_at AS version_created_at
    FROM organization_maps m JOIN organization_map_versions v ON v.map_id=m.id AND v.version=m.current_version
    WHERE m.id=? AND m.organization_id=? ${includeDeleted ? '' : 'AND m.deleted_at IS NULL'}`).get(id, organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

function versionRow(db, organizationId, id, version) {
  const row = db.prepare(`SELECT m.id,m.organization_id,m.publisher_user_id,m.current_version,m.deleted_at,m.created_at,m.updated_at,
      v.version,v.source_personal_map_id,v.source_personal_revision,v.name,v.note,v.snapshot,v.byte_length,v.item_count,v.group_count,v.created_by,v.created_at AS version_created_at
    FROM organization_maps m JOIN organization_map_versions v ON v.map_id=m.id
    WHERE m.id=? AND m.organization_id=? AND m.deleted_at IS NULL AND v.version=?`).get(id, organizationId, version)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

function versionSummary(row) {
  return {
    id: Number(row.id), organizationId: Number(row.organization_id), publisherUserId: Number(row.publisher_user_id),
    version: Number(row.version), name: row.name, note: row.note,
    sourcePersonalMapId: row.source_personal_map_id ?? null,
    sourcePersonalRevision: row.source_personal_revision == null ? null : Number(row.source_personal_revision),
    itemCount: Number(row.item_count), groupCount: Number(row.group_count),
    createdAt: row.version_created_at, updatedAt: row.updated_at,
  }
}

function versionDetail(row) {
  return { ...versionSummary(row), snapshot: parseSnapshot(row) }
}

function organizationUsage(db, organizationId) {
  return db.prepare(`SELECT COALESCE(SUM(v.byte_length),0) AS bytes
    FROM organization_map_versions v JOIN organization_maps m ON m.id=v.map_id WHERE m.organization_id=?`).get(organizationId)
}

function assertOrganizationQuota(db, organizationId, addedBytes) {
  assertMapGrowth(db,Number(addedBytes))
  if (Number(addedBytes) > MAX_DOCUMENT_BYTES) throw new OrganizationError(413, 'map_too_large', { limit: 'document_bytes' })
  if (Number(organizationUsage(db, organizationId).bytes) + Number(addedBytes) > MAX_ORGANIZATION_VERSION_BYTES) {
    throw new OrganizationError(413, 'organization_map_limit_exceeded', { limit: 'organization_version_bytes' })
  }
}

function sourceVersion(db, ownerId, input) {
  const id = personalMapId(input?.personalMapId)
  const expected = expectedPersonalRevision(input?.expectedPersonalRevision)
  const row = personalRow(db, ownerId, id)
  assertPersonalRevision(row, expected)
  if (Number(row.byte_length) > MAX_DOCUMENT_BYTES) throw new OrganizationError(413, 'map_too_large', { limit: 'document_bytes' })
  return { id: row.id, revision: Number(row.revision), snapshot: row.snapshot, bytes: Number(row.byte_length), itemCount: Number(row.item_count), groupCount: Number(row.group_count) }
}

export function listOrganizationMaps(db, organizationId) {
  return db.prepare(`SELECT m.id,m.organization_id,m.publisher_user_id,m.current_version,m.deleted_at,m.created_at,m.updated_at,
      v.version,v.source_personal_map_id,v.source_personal_revision,v.name,v.note,v.item_count,v.group_count,v.created_at AS version_created_at
    FROM organization_maps m JOIN organization_map_versions v ON v.map_id=m.id AND v.version=m.current_version
    WHERE m.organization_id=? AND m.deleted_at IS NULL ORDER BY m.updated_at DESC,m.id DESC`).all(organizationId).map(versionSummary)
}

export function getOrganizationMap(db, organizationId, id, version = null) {
  const row = version == null ? currentRow(db, organizationId, mapId(id)) : versionRow(db, organizationId, mapId(id), expectedSharedVersion(version))
  return versionDetail(row)
}

export function createOrganizationMap(db, organizationId, publisherUserId, input) {
  const create = db.transaction(() => {
    const source = sourceVersion(db, publisherUserId, input)
    const note = optionalText(input?.note, 'note', 2000)
    const name = requireText(input?.name ?? parseSnapshot({ snapshot: source.snapshot }).name, 'name', 200)
    assertOrganizationQuota(db, organizationId, source.bytes)
    const now = nowIso()
    const info = db.prepare(`INSERT INTO organization_maps (organization_id,publisher_user_id,current_version,created_at,updated_at)
      VALUES (?,?,?,?,?)`).run(organizationId, publisherUserId, 1, now, now)
    db.prepare(`INSERT INTO organization_map_versions
      (map_id,version,source_personal_map_id,source_personal_revision,name,note,snapshot,byte_length,item_count,group_count,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(info.lastInsertRowid, 1, source.id, source.revision,
      name, note, source.snapshot, source.bytes, source.itemCount, source.groupCount, publisherUserId, now)
    return versionDetail(currentRow(db, organizationId, info.lastInsertRowid))
  })
  return create()
}

export function createOrganizationMapVersion(db, organizationId, mapIdValue, actorUserId, role, input) {
  const update = db.transaction(() => {
    const id = mapId(mapIdValue)
    const current = currentRow(db, organizationId, id)
    if (Number(current.publisher_user_id) !== Number(actorUserId) && role !== 'admin') throw new OrganizationError(403, 'organization_forbidden')
    const expected = expectedSharedVersion(input?.expectedSharedVersion)
    if (Number(current.current_version) !== expected) throw new OrganizationError(409, 'shared_version_conflict', { currentVersion: Number(current.current_version) })
    const source = sourceVersion(db, actorUserId, input)
    const note = optionalText(input?.note, 'note', 2000)
    const name = requireText(input?.name ?? parseSnapshot({ snapshot: source.snapshot }).name, 'name', 200)
    assertOrganizationQuota(db, organizationId, source.bytes)
    const version = Number(current.current_version) + 1
    const now = nowIso()
    db.prepare(`INSERT INTO organization_map_versions
      (map_id,version,source_personal_map_id,source_personal_revision,name,note,snapshot,byte_length,item_count,group_count,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, version, source.id, source.revision,
      name, note, source.snapshot, source.bytes, source.itemCount, source.groupCount, actorUserId, now)
    const changed = db.prepare(`UPDATE organization_maps SET current_version=?,updated_at=?
      WHERE id=? AND organization_id=? AND current_version=? AND deleted_at IS NULL`).run(version, now, id, organizationId, expected)
    if (!changed.changes) {
      const latest = currentRow(db, organizationId, id)
      throw new OrganizationError(409, 'shared_version_conflict', { currentVersion: Number(latest.current_version) })
    }
    return versionDetail(currentRow(db, organizationId, id))
  })
  return update()
}

export function deleteOrganizationMap(db, organizationId, idValue, actorUserId, role) {
  const remove = db.transaction(() => {
    const id = mapId(idValue)
    const current = currentRow(db, organizationId, id)
    if (Number(current.publisher_user_id) !== Number(actorUserId) && role !== 'admin') throw new OrganizationError(403, 'organization_forbidden')
    const changed = db.prepare('UPDATE organization_maps SET deleted_at=?,updated_at=? WHERE id=? AND organization_id=? AND deleted_at IS NULL')
      .run(nowIso(), nowIso(), id, organizationId)
    if (!changed.changes) throw new OrganizationError(404, 'not_found')
  })
  remove()
}
