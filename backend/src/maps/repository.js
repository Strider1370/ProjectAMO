import { assertMapGrowth } from './storage-budget.js'
import { MAX_ACCOUNT_BYTES, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS, MapSchemaError } from './schema.js'

export class MapRepositoryError extends Error {
  constructor(status, code, details = null) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}

function storedDocument(row) {
  try { return JSON.parse(row.snapshot) } catch { throw new MapRepositoryError(500, 'map_storage_corrupt') }
}

function documentRow(db, id) {
  return db.prepare('SELECT id, owner_id, revision, snapshot, byte_length, item_count, group_count, created_at, updated_at FROM personal_maps WHERE id=?').get(id)
}

function ownedRow(db, ownerId, id) {
  const row = documentRow(db, id)
  if (!row || Number(row.owner_id) !== Number(ownerId)) throw new MapRepositoryError(404, 'not_found')
  return row
}

function withServerFields(document, { revision, createdAt, updatedAt }) {
  return { ...document, revision, createdAt, updatedAt }
}

function serializeDocument(document) {
  const snapshot = JSON.stringify(document)
  const bytes = Buffer.byteLength(snapshot, 'utf8')
  // revision·UTC 시각을 넣은 실제 저장 JSON을 기준으로 문서 한도를 다시 확인한다.
  if (bytes > MAX_DOCUMENT_BYTES) throw new MapSchemaError('map_too_large', { limit: 'document_bytes' }, 413)
  return { snapshot, bytes }
}

export function listMyMaps(db, ownerId) {
  return db.prepare(`SELECT id, name, revision, created_at, updated_at, item_count, group_count
    FROM personal_maps WHERE owner_id=? ORDER BY updated_at DESC, id`).all(ownerId).map((row) => ({
    id: row.id, name: row.name, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    itemCount: row.item_count, groupCount: row.group_count,
  }))
}

export function getMyMap(db, ownerId, id) {
  const row = ownedRow(db, ownerId, id)
  return withServerFields(storedDocument(row), { revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at })
}

function accountUsage(db, ownerId) {
  return db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(byte_length), 0) AS bytes FROM personal_maps WHERE owner_id=?').get(ownerId)
}

function assertQuota(usage, bytes, priorBytes = 0) {
  if (usage.count >= MAX_DOCUMENTS && priorBytes === 0) throw new MapRepositoryError(413, 'map_limit_exceeded', { limit: 'documents' })
  if (Number(usage.bytes) - priorBytes + bytes > MAX_ACCOUNT_BYTES) throw new MapRepositoryError(413, 'map_limit_exceeded', { limit: 'account_bytes' })
}

export function createMyMap(db, ownerId, validated) {
  const create = db.transaction(() => {
    if (documentRow(db, validated.document.id)) throw new MapRepositoryError(409, 'map_exists')
    const now = new Date().toISOString()
    const document = withServerFields(validated.document, { revision: 1, createdAt: now, updatedAt: now })
    const { snapshot, bytes } = serializeDocument(document)
    assertQuota(accountUsage(db, ownerId), bytes)
    assertMapGrowth(db,bytes)
    db.prepare(`INSERT INTO personal_maps (id, owner_id, name, revision, snapshot, byte_length, item_count, group_count, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(document.id, ownerId, document.name, 1, snapshot, bytes, validated.itemCount, validated.groupCount, now, now)
    return document
  })
  return create()
}

export function updateMyMap(db, ownerId, id, expectedRevision, validated) {
  const update = db.transaction(() => {
    const prior = ownedRow(db, ownerId, id)
    if (prior.revision !== expectedRevision) throw new MapRepositoryError(409, 'revision_conflict', { currentRevision: prior.revision })
    const now = new Date().toISOString()
    const revision = prior.revision + 1
    const document = withServerFields(validated.document, { revision, createdAt: prior.created_at, updatedAt: now })
    const { snapshot, bytes } = serializeDocument(document)
    assertQuota(accountUsage(db, ownerId), bytes, prior.byte_length)
    assertMapGrowth(db,bytes-prior.byte_length)
    const result = db.prepare(`UPDATE personal_maps SET name=?, revision=?, snapshot=?, byte_length=?, item_count=?, group_count=?, updated_at=?
      WHERE id=? AND owner_id=? AND revision=?`).run(document.name, revision, snapshot, bytes, validated.itemCount, validated.groupCount, now, id, ownerId, expectedRevision)
    if (!result.changes) {
      const current = ownedRow(db, ownerId, id)
      throw new MapRepositoryError(409, 'revision_conflict', { currentRevision: current.revision })
    }
    return document
  })
  return update()
}

export function deleteMyMap(db, ownerId, id) {
  const result = db.prepare('DELETE FROM personal_maps WHERE id=? AND owner_id=?').run(id, ownerId)
  if (!result.changes) throw new MapRepositoryError(404, 'not_found')
}

export function assertExpectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new MapSchemaError('expected_revision_required')
  return value
}
