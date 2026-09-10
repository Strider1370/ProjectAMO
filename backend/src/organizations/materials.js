import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import config from '../config.js'
import { parseOrganizationMapMaterial } from '../lib/organization-kml.js'
import {
  OrganizationError,
  assertVersion,
  integerId,
  json,
  nowIso,
  optionalText,
  requireText,
  sha256,
} from './common.js'
import { mutateFlightAnnotations as mutateFlightAnnotationVersion } from './repository.js'
import { parseOrganizationJsonField, validateOrganizationMaterialContent } from './content.js'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const DEVELOPMENT_FILES_PATH = fileURLToPath(new URL('../../../artifacts/organization-files/', import.meta.url))
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz'])
const rawUpload = express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz', 'application/octet-stream', 'multipart/form-data'], limit: MAX_FILE_BYTES + 512 * 1024 })

function materialRoot(filesPath) {
  const defaultPath = process.env.NODE_ENV === 'production'
    ? '/opt/projectamo/shared/organization-files' : DEVELOPMENT_FILES_PATH
  const root = path.resolve(filesPath || process.env.ORGANIZATION_FILES_PATH || defaultPath)
  const resolveExistingAncestors = (value) => {
    let cursor = path.resolve(value)
    const suffix = []
    while (!fs.existsSync(cursor)) {
      const parent = path.dirname(cursor)
      if (parent === cursor) break
      suffix.unshift(path.basename(cursor))
      cursor = parent
    }
    let real = cursor
    try { real = fs.realpathSync.native(cursor) } catch { /* absolute root is the safe fallback */ }
    return path.join(real, ...suffix)
  }
  const realRoot = resolveExistingAncestors(root)
  for (const publicRoot of [config.storage.base_path, config.storage.active_path].filter(Boolean).map((value) => {
    return resolveExistingAncestors(value)
  })) {
    if (realRoot === publicRoot || realRoot.startsWith(`${publicRoot}${path.sep}`)) {
      throw new Error('ORGANIZATION_FILES_PATH must be outside public weather data roots')
    }
  }
  return realRoot
}

function safePath(root, key) {
  if (!/^[a-f0-9]{64}(?:\.[a-z0-9]+)?$/.test(String(key || ''))) throw new OrganizationError(404, 'file_not_found')
  const resolved = path.resolve(root, key.slice(0, 2), key)
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new OrganizationError(404, 'file_not_found')
  return resolved
}

function parseContentDisposition(value) {
  const name = value.match(/(?:^|;)\s*name="([^"]+)"/i)?.[1]
  const filename = value.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1]
  return { name, filename }
}

function parseMultipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean)
  if (!boundary || boundary.length > 200) throw new OrganizationError(400, 'invalid_multipart')
  const marker = Buffer.from(`--${boundary}`)
  const fields = {}
  let file = null
  let cursor = 0
  while (cursor < buffer.length) {
    const start = buffer.indexOf(marker, cursor)
    if (start < 0) break
    const headerStart = start + marker.length + 2
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd < 0) break
    const next = buffer.indexOf(marker, headerEnd + 4)
    if (next < 0) break
    const headers = buffer.subarray(headerStart, headerEnd).toString('utf8')
    const disposition = parseContentDisposition(headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? '')
    const body = buffer.subarray(headerEnd + 4, Math.max(headerEnd + 4, next - 2))
    const mimeType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase()
    if (disposition.filename != null) file = { buffer: body, originalName: path.basename(disposition.filename), mimeType }
    else if (disposition.name) fields[disposition.name] = body.toString('utf8')
    cursor = next
  }
  return { fields, file }
}

function requestUpload(req) {
  const contentType = String(req.headers['content-type'] || '')
  const type = contentType.toLowerCase()
  if (Buffer.isBuffer(req.body)) {
    if (type.startsWith('multipart/form-data')) return parseMultipart(req.body, contentType)
    return {
      fields: {
        title: decodeUploadHeader(req.headers['x-material-title']), description: decodeUploadHeader(req.headers['x-material-description']),
        sourceLabel: decodeUploadHeader(req.headers['x-material-source']), expectedVersion: req.headers['x-expected-version'],
      },
      file: { buffer: req.body, originalName: path.basename(decodeUploadHeader(req.headers['x-file-name']) || 'file'), mimeType: type.split(';')[0] },
    }
  }
  return { fields: req.body ?? {}, file: null }
}

function decodeUploadHeader(value) {
  if (value == null) return undefined
  try { return decodeURIComponent(String(value)) } catch { throw new OrganizationError(400, 'invalid_upload_header') }
}

function sniffMime(buffer, declared, name) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (buffer.subarray(0, 2).toString() === 'PK') return 'application/vnd.google-earth.kmz'
  const text = buffer.subarray(0, 1024).toString('utf8').trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?<kml[\s>]/i.test(text) || /<kml[\s>]/i.test(text)) return 'application/vnd.google-earth.kml+xml'
  if (ALLOWED_MIME.has(declared) && !buffer.length) return declared
  const ext = path.extname(name).toLowerCase()
  if (ext === '.kml') return 'application/vnd.google-earth.kml+xml'
  return null
}

async function validateFile(file) {
  if (!file?.buffer?.length || file.buffer.length > MAX_FILE_BYTES) throw new OrganizationError(413, 'file_too_large')
  const mimeType = sniffMime(file.buffer, file.mimeType, file.originalName)
  if (!ALLOWED_MIME.has(mimeType)) throw new OrganizationError(415, 'unsupported_file_type')
  let imageMetadata = null
  if (mimeType.startsWith('image/')) {
    try { imageMetadata = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata() } catch { throw new OrganizationError(400, 'invalid_image') }
  } else if (mimeType === 'application/pdf') {
    let loadingTask
    try {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      loadingTask = getDocument({ data: new Uint8Array(file.buffer), disableWorker: true, isEvalSupported: false })
      const document = await loadingTask.promise
      const pages = document.numPages
      imageMetadata = { pages }
    } catch { throw new OrganizationError(400, 'invalid_pdf') }
    finally { await loadingTask?.destroy?.() }
  } else {
    try { imageMetadata = parseOrganizationMapMaterial(file.buffer, mimeType) }
    catch (error) {
      const reason = String(error?.message ?? '').replace(/^invalid_map_material:/, '') || 'invalid_map_material'
      throw new OrganizationError(400, 'invalid_map_material', { reason })
    }
  }
  return { ...file, mimeType, metadata: imageMetadata ?? {} }
}

function extension(mime) {
  return ({ 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'application/vnd.google-earth.kml+xml': '.kml', 'application/vnd.google-earth.kmz': '.kmz' })[mime] ?? ''
}

async function persistFile(root, file) {
  const createdPaths = []
  const hash = sha256(file.buffer)
  const key = `${hash}${extension(file.mimeType)}`
  const target = safePath(root, key)
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
    if (!fs.existsSync(target)) { fs.writeFileSync(target, file.buffer, { flag: 'wx', mode: 0o600 }); createdPaths.push(target) }
    let thumbnailKey = null
    if (file.mimeType.startsWith('image/')) {
      const thumbnail = await sharp(file.buffer).rotate().resize({ width: 480, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
      thumbnailKey = `${sha256(thumbnail)}.webp`
      const thumbnailPath = safePath(root, thumbnailKey)
      fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true, mode: 0o700 })
      if (!fs.existsSync(thumbnailPath)) { fs.writeFileSync(thumbnailPath, thumbnail, { flag: 'wx', mode: 0o600 }); createdPaths.push(thumbnailPath) }
    }
    return { storageKey: key, thumbnailKey, contentHash: hash, createdPaths }
  } catch (error) {
    cleanupCreatedFiles(createdPaths)
    throw error
  }
}

function cleanupCreatedFiles(paths) {
  for (const filePath of paths ?? []) { try { fs.unlinkSync(filePath) } catch { /* best effort for failed upload */ } }
}

function rowToMaterial(row) {
  return row && {
    id: row.id, orgId: row.organization_id, ownerUserId: row.owner_user_id, version: row.version,
    kind: row.kind, title: row.title, description: row.description, sourceLabel: row.source_label,
    mimeType: row.mime_type, originalName: row.original_name, sizeBytes: row.size_bytes,
    contentHash: row.content_hash, metadata: json(row.metadata, {}), blocks: json(row.blocks, []),
    thumbnailAvailable: Boolean(row.thumbnail_storage_key), createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function materialRow(db, organizationId, materialId, version = null, { includeDeleted = true } = {}) {
  const row = db.prepare(`SELECT m.*,v.version,v.kind,v.title,v.description,v.source_label,v.mime_type,v.original_name,
    v.storage_key,v.thumbnail_storage_key,v.size_bytes,v.content_hash,v.metadata,v.blocks
    FROM organization_materials m JOIN organization_material_versions v
      ON v.material_id=m.id AND v.version=COALESCE(?,m.current_version)
    WHERE m.id=? AND m.organization_id=? ${includeDeleted ? '' : 'AND m.deleted_at IS NULL'}`)
    .get(version, integerId(materialId, 'materialId'), organizationId)
  if (!row) throw new OrganizationError(404, 'not_found')
  return row
}

function kindFor(mimeType, fields) {
  if (fields.kind === 'document') return 'document'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.includes('google-earth')) return 'map'
  if (fields.kind === 'route') return 'route'
  return 'document'
}

function canEdit(req, row) {
  return ['admin', 'planner'].includes(req.organizationMember.role) || Number(row.owner_user_id) === Number(req.session.userId)
}

function parseRange(range, size) {
  if (!range) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) throw new OrganizationError(416, 'invalid_range')
  let start = match[1] ? Number(match[1]) : null
  let end = match[2] ? Number(match[2]) : null
  if (start == null) { start = Math.max(0, size - end); end = size - 1 }
  else end = end == null ? size - 1 : Math.min(end, size - 1)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new OrganizationError(416, 'invalid_range')
  return { start, end }
}

function sendPrivateFile(req, res, root, key, mimeType, originalName) {
  const filePath = safePath(root, key)
  let stat
  try { stat = fs.statSync(filePath) } catch { throw new OrganizationError(404, 'file_not_found') }
  const range = parseRange(req.headers.range, stat.size)
  res.set({
    'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'Content-Type': mimeType,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(originalName || 'file')}`,
  })
  if (range) {
    res.status(206).set({ 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`, 'Content-Length': range.end - range.start + 1 })
    return fs.createReadStream(filePath, range).pipe(res)
  }
  res.set('Content-Length', stat.size)
  return fs.createReadStream(filePath).pipe(res)
}

export function createMaterialsHandlers({ database, filesPath } = {}) {
  const root = materialRoot(filesPath)
  return {
    readUpload: rawUpload,
    list(req, res) {
      const rows = database().prepare(`SELECT m.*,v.version,v.kind,v.title,v.description,v.source_label,v.mime_type,
        v.original_name,v.storage_key,v.thumbnail_storage_key,v.size_bytes,v.content_hash,v.metadata,v.blocks
        FROM organization_materials m JOIN organization_material_versions v ON v.material_id=m.id AND v.version=m.current_version
        WHERE m.organization_id=? AND m.deleted_at IS NULL ORDER BY m.updated_at DESC,m.id DESC`).all(req.organization.id)
      res.json({ materials: rows.map(rowToMaterial) })
    },
    async create(req, res) {
      const { fields, file: rawFile } = requestUpload(req)
      const file = rawFile ? await validateFile(rawFile) : null
      if (!file && !['document', 'route'].includes(fields.kind)) throw new OrganizationError(400, 'file_required')
      const db = database()
      const kind = kindFor(file?.mimeType, fields)
      const metadata = { ...(file?.metadata ?? {}), ...(parseOrganizationJsonField(fields.metadata, {}, 'metadata') ?? {}) }
      const content = validateOrganizationMaterialContent(db, req.organization.id, {
        kind, metadata, blocks: parseOrganizationJsonField(fields.blocks, [], 'blocks'),
      })
      const saved = file ? await persistFile(root, file) : {}
      const now = nowIso()
      let material
      try { material = db.transaction(() => {
        const info = db.prepare(`INSERT INTO organization_materials
          (organization_id,owner_user_id,created_at,updated_at) VALUES (?,?,?,?)`)
          .run(req.organization.id, req.session.userId, now, now)
        db.prepare(`INSERT INTO organization_material_versions
          (material_id,version,kind,title,description,source_label,mime_type,original_name,storage_key,
           thumbnail_storage_key,size_bytes,content_hash,metadata,blocks,created_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(info.lastInsertRowid, 1, kind,
          requireText(fields.title, 'title'), optionalText(fields.description, 'description', 10000),
          fields.sourceLabel ? optionalText(fields.sourceLabel, 'sourceLabel', 500) : null,
          file?.mimeType ?? null, file?.originalName ?? null, saved.storageKey ?? null, saved.thumbnailKey ?? null,
          file?.buffer.length ?? null, saved.contentHash ?? null,
          JSON.stringify(content.metadata), JSON.stringify(content.blocks), req.session.userId, now)
        return rowToMaterial(materialRow(db, req.organization.id, info.lastInsertRowid))
      })() } catch (error) { cleanupCreatedFiles(saved.createdPaths); throw error }
      res.status(201).json({ material })
    },
    get(req, res) {
      res.json({ material: rowToMaterial(materialRow(database(), req.organization.id, req.params.materialId, req.query.version)) })
    },
    async update(req, res) {
      const db = database()
      const currentRow = materialRow(db, req.organization.id, req.params.materialId, null, { includeDeleted: false })
      if (!canEdit(req, currentRow)) throw new OrganizationError(403, 'organization_forbidden')
      const { fields, file: rawFile } = requestUpload(req)
      assertVersion(currentRow.version, fields.expectedVersion)
      const file = rawFile ? await validateFile(rawFile) : null
      const kind = file ? kindFor(file.mimeType, fields) : fields.kind ?? currentRow.kind
      const metadata = {
        ...json(currentRow.metadata, {}), ...(file?.metadata ?? {}),
        ...(fields.metadata === undefined ? {} : parseOrganizationJsonField(fields.metadata, {}, 'metadata')),
      }
      const blocks = fields.blocks === undefined
        ? json(currentRow.blocks, []) : parseOrganizationJsonField(fields.blocks, [], 'blocks')
      const content = validateOrganizationMaterialContent(db, req.organization.id, { kind, metadata, blocks })
      const saved = file ? await persistFile(root, file) : {
        storageKey: currentRow.storage_key, thumbnailKey: currentRow.thumbnail_storage_key, contentHash: currentRow.content_hash,
      }
      const next = currentRow.version + 1
      const now = nowIso()
      let material
      try { material = db.transaction(() => {
        db.prepare(`INSERT INTO organization_material_versions
          (material_id,version,kind,title,description,source_label,mime_type,original_name,storage_key,
           thumbnail_storage_key,size_bytes,content_hash,metadata,blocks,created_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(currentRow.id, next,
          kind, requireText(fields.title ?? currentRow.title, 'title'),
          optionalText(fields.description ?? currentRow.description, 'description', 10000),
          fields.sourceLabel === undefined ? currentRow.source_label : optionalText(fields.sourceLabel, 'sourceLabel', 500),
          file?.mimeType ?? currentRow.mime_type, file?.originalName ?? currentRow.original_name,
          saved.storageKey, saved.thumbnailKey, file?.buffer.length ?? currentRow.size_bytes, saved.contentHash,
          JSON.stringify(content.metadata), JSON.stringify(content.blocks), req.session.userId, now)
        const changed = db.prepare(`UPDATE organization_materials SET current_version=?,updated_at=?
          WHERE id=? AND organization_id=? AND current_version=? AND deleted_at IS NULL`)
          .run(next, now, currentRow.id, req.organization.id, currentRow.version)
        if (changed.changes !== 1) throw new OrganizationError(409, 'version_conflict')
        return rowToMaterial(materialRow(db, req.organization.id, currentRow.id))
      })() } catch (error) { cleanupCreatedFiles(saved.createdPaths); throw error }
      res.json({ material })
    },
    remove(req, res) {
      const db = database()
      const row = materialRow(db, req.organization.id, req.params.materialId, null, { includeDeleted: false })
      if (!canEdit(req, row)) throw new OrganizationError(403, 'organization_forbidden')
      assertVersion(row.version, req.body?.expectedVersion)
      db.prepare(`UPDATE organization_materials SET deleted_at=?,updated_at=? WHERE id=? AND organization_id=? AND current_version=?`)
        .run(nowIso(), nowIso(), row.id, req.organization.id, row.version)
      res.json({ ok: true })
    },
    original(req, res) {
      const row = materialRow(database(), req.organization.id, req.params.materialId, integerId(req.params.version, 'version'))
      if (!row.storage_key) throw new OrganizationError(404, 'file_not_found')
      return sendPrivateFile(req, res, root, row.storage_key, row.mime_type, row.original_name)
    },
    thumbnail(req, res) {
      const row = materialRow(database(), req.organization.id, req.params.materialId, integerId(req.params.version, 'version'))
      if (!row.thumbnail_storage_key) throw new OrganizationError(404, 'thumbnail_not_available')
      return sendPrivateFile(req, res, root, row.thumbnail_storage_key, 'image/webp', `${row.original_name || 'thumbnail'}.webp`)
    },
    mutateAnnotation(req, _flight, operation) {
      return mutateFlightAnnotationVersion(database(), req.organization.id, req.params.flightId, req.body ?? {},
        req.session.userId, operation === 'create' ? null : req.params.annotationId, operation === 'delete')
    },
  }
}

export default { createMaterialsHandlers }
