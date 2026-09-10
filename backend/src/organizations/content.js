import { OrganizationError, integerId, requireText } from './common.js'
import { isValidOrganizationGeometry } from './geometry.js'

function invalid(field, reason = null) {
  throw new OrganizationError(400, 'invalid_input', { field, ...(reason ? { reason } : {}) })
}

export function parseOrganizationJsonField(value, fallback, field) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { invalid(field, 'invalid_json') }
}

function validateHttpUrl(value, field) {
  let parsed
  try { parsed = new URL(requireText(value, field, 4096)) } catch { invalid(field, 'invalid_url') }
  if (!['http:', 'https:'].includes(parsed.protocol)) invalid(field, 'http_url_required')
  return parsed.href
}

function resolveBlockMaterial(db, organizationId, block, index) {
  const materialId = integerId(block.materialId, `blocks[${index}].materialId`)
  const materialVersion = integerId(block.materialVersion, `blocks[${index}].materialVersion`)
  const row = db.prepare(`SELECT v.mime_type FROM organization_materials m
    JOIN organization_material_versions v ON v.material_id=m.id AND v.version=?
    WHERE m.id=? AND m.organization_id=? AND m.deleted_at IS NULL`).get(materialVersion, materialId, organizationId)
  if (!row) invalid(`blocks[${index}]`, 'material_version_not_found')
  if (block.kind === 'image' && !row.mime_type?.startsWith('image/')) invalid(`blocks[${index}]`, 'image_material_required')
  if (block.kind === 'pdf' && row.mime_type !== 'application/pdf') invalid(`blocks[${index}]`, 'pdf_material_required')
  return { materialId, materialVersion }
}

export function validateOrganizationBlocks(db, organizationId, value, { allowSpeakerNotes = false, maxBlocks = 100 } = {}) {
  if (!Array.isArray(value) || value.length > maxBlocks) invalid('blocks', value?.length > maxBlocks ? 'too_many' : 'array_required')
  let totalText = 0
  return value.map((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) invalid(`blocks[${index}]`, 'object_required')
    const kind = String(block.kind ?? '')
    if (['heading', 'text'].includes(kind)) {
      const max = kind === 'heading' ? 500 : 20_000
      const text = requireText(block.text, `blocks[${index}].text`, max)
      totalText += text.length
      if (totalText > 200_000) invalid('blocks', 'text_too_large')
      return { kind, text }
    }
    if (kind === 'link') {
      const url = validateHttpUrl(block.url, `blocks[${index}].url`)
      const text = requireText(block.text ?? block.title ?? url, `blocks[${index}].text`, 500)
      totalText += text.length
      return { kind, text, url }
    }
    if (['image', 'pdf'].includes(kind)) {
      const reference = resolveBlockMaterial(db, organizationId, block, index)
      const text = block.text == null ? null : requireText(block.text, `blocks[${index}].text`, 2000)
      return { kind, ...reference, ...(text ? { text } : {}) }
    }
    if (allowSpeakerNotes && kind === 'speaker-notes') {
      const body = String(block.body ?? block.text ?? '')
      if (body.length > 20_000) invalid(`blocks[${index}].body`, 'too_large')
      totalText += body.length
      const flightId = block.flightId == null ? null : integerId(block.flightId, `blocks[${index}].flightId`)
      return { kind, ...(flightId ? { flightId } : {}), body }
    }
    invalid(`blocks[${index}].kind`, 'unsupported_block_kind')
  })
}

export function validateOrganizationMaterialContent(db, organizationId, { kind, metadata, blocks }) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) invalid('metadata', 'object_required')
  const normalizedBlocks = validateOrganizationBlocks(db, organizationId, blocks, { maxBlocks: 100 })
  if (kind === 'route') {
    const snapshot = metadata.snapshot
    const geometry = snapshot?.routeGeometry ?? snapshot?.enrouteGeometry ?? snapshot?.profileRequest?.routeGeometry
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.version !== 3) {
      invalid('metadata.snapshot', 'v3_required')
    }
    if (!isValidOrganizationGeometry(geometry, ['LineString'])) invalid('metadata.snapshot.routeGeometry')
  }
  const encoded = JSON.stringify({ metadata, blocks: normalizedBlocks })
  if (Buffer.byteLength(encoded) > 512 * 1024) invalid('content', 'too_large')
  return { metadata, blocks: normalizedBlocks }
}

export default { parseOrganizationJsonField, validateOrganizationBlocks, validateOrganizationMaterialContent }
