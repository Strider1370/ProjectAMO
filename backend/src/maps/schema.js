export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_ACCOUNT_BYTES = MAX_DOCUMENT_BYTES
export const MAX_DOCUMENTS = 1
export const MAX_ITEMS = 10000
export const MAX_GROUPS = 2000
export const MAX_COORDINATES = 1000000
export const MAX_GEOMETRY_PARTS = 100000
export const MAX_GEOMETRY_DEPTH = 32

const KINDS = new Set(['point', 'line', 'polygon', 'circle', 'compound'])
const GEOMETRIES = new Set(['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'])
const R_NM = 3440.065
const STEP_DEG = 5

export class MapSchemaError extends Error {
  constructor(code = 'invalid_map', details = null, status = 400) {
    super(code)
    this.code = code
    this.details = details
    this.status = status
  }
}

const invalid = (field, reason = null) => { throw new MapSchemaError('invalid_map', { field, ...(reason ? { reason } : {}) }) }
const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

function requiredText(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(field)
  return value
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(field)
  return value
}

function nullableFinite(value, field) {
  if (value == null) return null
  if (!finite(value)) invalid(field)
  return value
}

function cloneJson(value, field) {
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) invalid(field)
    return JSON.parse(encoded)
  } catch {
    invalid(field)
  }
}

function coordinate(value, field, counts) {
  if (!Array.isArray(value) || value.length < 2 || !finite(value[0]) || !finite(value[1])
    || value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90
    || value.slice(2).some((part) => !finite(part))) invalid(field)
  counts.coordinates += 1
  if (counts.coordinates > MAX_COORDINATES) throw new MapSchemaError('map_limit_exceeded', { limit: 'coordinates' }, 413)
  return [...value]
}

function sameCoordinate(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function line(value, field, counts, { ring = false } = {}) {
  if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) invalid(field)
  const result = value.map((point, index) => coordinate(point, `${field}[${index}]`, counts))
  if (ring && !sameCoordinate(result[0], result.at(-1))) invalid(field, 'ring_not_closed')
  return result
}

function countPart(counts) {
  counts.parts += 1
  if (counts.parts > MAX_GEOMETRY_PARTS) throw new MapSchemaError('map_limit_exceeded', { limit: 'geometry_parts' }, 413)
}

function geometry(value, field, counts, depth = 1) {
  if (!isObject(value) || !GEOMETRIES.has(value.type) || depth > MAX_GEOMETRY_DEPTH) invalid(field)
  if (value.type === 'Point') {
    countPart(counts)
    return { type: 'Point', coordinates: coordinate(value.coordinates, `${field}.coordinates`, counts) }
  }
  if (value.type === 'LineString') {
    countPart(counts)
    return { type: 'LineString', coordinates: line(value.coordinates, `${field}.coordinates`, counts) }
  }
  if (value.type === 'Polygon') {
    if (!Array.isArray(value.coordinates) || !value.coordinates.length) invalid(`${field}.coordinates`)
    countPart(counts)
    return { type: 'Polygon', coordinates: value.coordinates.map((ringValue, index) => line(ringValue, `${field}.coordinates[${index}]`, counts, { ring: true })) }
  }
  if (value.type === 'MultiPoint') {
    if (!Array.isArray(value.coordinates) || !value.coordinates.length) invalid(`${field}.coordinates`)
    return { type: 'MultiPoint', coordinates: value.coordinates.map((point, index) => { countPart(counts); return coordinate(point, `${field}.coordinates[${index}]`, counts) }) }
  }
  if (value.type === 'MultiLineString') {
    if (!Array.isArray(value.coordinates) || !value.coordinates.length) invalid(`${field}.coordinates`)
    return { type: 'MultiLineString', coordinates: value.coordinates.map((lineValue, index) => { countPart(counts); return line(lineValue, `${field}.coordinates[${index}]`, counts) }) }
  }
  if (value.type === 'MultiPolygon') {
    if (!Array.isArray(value.coordinates) || !value.coordinates.length) invalid(`${field}.coordinates`)
    return { type: 'MultiPolygon', coordinates: value.coordinates.map((polygon, polygonIndex) => {
      if (!Array.isArray(polygon) || !polygon.length) invalid(`${field}.coordinates[${polygonIndex}]`)
      countPart(counts)
      return polygon.map((ringValue, ringIndex) => line(ringValue, `${field}.coordinates[${polygonIndex}][${ringIndex}]`, counts, { ring: true }))
    }) }
  }
  if (!Array.isArray(value.geometries) || !value.geometries.length) invalid(`${field}.geometries`)
  return { type: 'GeometryCollection', geometries: value.geometries.map((child, index) => geometry(child, `${field}.geometries[${index}]`, counts, depth + 1)) }
}

const rad = (value) => value * Math.PI / 180
const deg = (value) => value * 180 / Math.PI

function destination(center, bearing, radiusNm) {
  const distance = radiusNm / R_NM
  const angle = rad(bearing), lat = rad(center[1]), lng = rad(center[0])
  const outLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(angle))
  const outLng = lng + Math.atan2(Math.sin(angle) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(outLat))
  return [((deg(outLng) + 540) % 360) - 180, deg(outLat)]
}

// 프론트 작성기의 5도 대권 원과 독립 구현을 비교한다. 서버는 기하를 고쳐 쓰지 않고,
// 정의와 맞지 않는 요청을 거부해 다음 편집에서 도형이 점프하는 상태를 만들지 않는다.
export function circleRing(center, radiusNm) {
  return Array.from({ length: 360 / STEP_DEG + 1 }, (_, index) => destination(center, index * STEP_DEG, radiusNm))
}

function circleDefinition(value, field, counts) {
  if (!isObject(value)) invalid(field)
  const center = coordinate(value.center, `${field}.center`, counts)
  if (!finite(value.radiusNm) || value.radiusNm <= 0) invalid(`${field}.radiusNm`)
  return { center, radiusNm: value.radiusNm }
}

function sameCircleGeometry(actual, definition) {
  if (actual?.type !== 'Polygon' || actual.coordinates?.length !== 1) return false
  const expected = circleRing(definition.center, definition.radiusNm)
  const ring = actual.coordinates[0]
  return ring.length === expected.length && ring.every((point, index) => point.length >= 2
    && Math.abs(point[0] - expected[index][0]) <= 1e-9 && Math.abs(point[1] - expected[index][1]) <= 1e-9)
}

function style(value, field) {
  if (!isObject(value) || typeof value.color !== 'string' || typeof value.fillColor !== 'string'
    || !finite(value.width) || !finite(value.opacity) || !finite(value.fillOpacity) || !finite(value.pointSize)
    || !/^#[0-9a-fA-F]{6}$/.test(value.color) || !/^#[0-9a-fA-F]{6}$/.test(value.fillColor)
    || value.width < 0 || value.width > 30 || value.opacity < 0 || value.opacity > 1
    || value.fillOpacity < 0 || value.fillOpacity > 1 || value.pointSize < 1 || value.pointSize > 50
    || !['solid', 'dashed', 'dotted'].includes(value.dash)
    || !['dot', 'pin', 'triangle', 'square', 'star', 'cross'].includes(value.icon)) invalid(field)
  return { color: value.color, width: value.width, opacity: value.opacity, fillColor: value.fillColor,
    fillOpacity: value.fillOpacity, pointSize: value.pointSize, dash: value.dash, icon: value.icon }
}

function label(value, field) {
  if (!isObject(value) || typeof value.visible !== 'boolean' || !finite(value.size) || value.size < 8 || value.size > 32 || typeof value.always !== 'boolean') invalid(field)
  return { visible: value.visible, size: value.size, always: value.always }
}

function altitude(value, field) {
  if (!isObject(value)) invalid(field)
  const floorFt = nullableFinite(value.floorFt, `${field}.floorFt`)
  const ceilingFt = nullableFinite(value.ceilingFt, `${field}.ceilingFt`)
  if (![floorFt, ceilingFt].every((part) => part == null || (part >= -2000 && part <= 100000))
    || !['MSL', 'AGL', 'FL', 'unknown'].includes(value.datum)) invalid(field)
  // 원본 고도는 item.source에 남고 여기의 편집 고도만 비교한다. 0과 null은 구분한다.
  if (floorFt != null && ceilingFt != null && floorFt >= ceilingFt) invalid(field, 'floor_must_be_less_than_ceiling')
  return { floorFt, ceilingFt, datum: value.datum }
}

function item(value, index, groupIds, orders, counts) {
  const field = `items[${index}]`
  if (!isObject(value) || !KINDS.has(value.kind)) invalid(field)
  const id = requiredText(value.id, `${field}.id`)
  const groupId = value.groupId == null ? null : requiredText(value.groupId, `${field}.groupId`)
  if (groupId != null && !groupIds.has(groupId)) invalid(`${field}.groupId`, 'unknown_group')
  const order = nonNegativeInteger(value.order, `${field}.order`)
  const orderKey = `${groupId ?? ''}\u0000${order}`
  if (orders.has(orderKey)) invalid(`${field}.order`, 'duplicate_order')
  orders.add(orderKey)
  const source = value.source == null ? null : (isObject(value.source) ? cloneJson(value.source, `${field}.source`) : invalid(`${field}.source`))
  const rawGeometry = value.geometry
  if (rawGeometry == null && !(value.kind === 'compound' && source)) invalid(`${field}.geometry`)
  const checkedGeometry = rawGeometry == null ? null : geometry(rawGeometry, `${field}.geometry`, counts)
  if (value.kind === 'point' && checkedGeometry?.type !== 'Point') invalid(`${field}.geometry`, 'kind_mismatch')
  if (value.kind === 'line' && checkedGeometry?.type !== 'LineString') invalid(`${field}.geometry`, 'kind_mismatch')
  if (value.kind === 'polygon' && checkedGeometry?.type !== 'Polygon') invalid(`${field}.geometry`, 'kind_mismatch')
  if (value.kind === 'compound' && checkedGeometry && !['MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'].includes(checkedGeometry.type)) invalid(`${field}.geometry`, 'kind_mismatch')
  const definition = value.definition == null ? null : cloneJson(value.definition, `${field}.definition`)
  if (value.kind === 'circle') {
    const checkedDefinition = circleDefinition(value.definition, `${field}.definition`, counts)
    if (!sameCircleGeometry(checkedGeometry, checkedDefinition)) invalid(`${field}.geometry`, 'circle_definition_mismatch')
    return { id, groupId, order, kind: value.kind, name: requiredText(value.name, `${field}.name`), description: typeof value.description === 'string' ? value.description : invalid(`${field}.description`), geometry: checkedGeometry, definition: checkedDefinition, style: style(value.style, `${field}.style`), label: label(value.label, `${field}.label`), altitude: altitude(value.altitude, `${field}.altitude`), source }
  }
  if (definition != null) invalid(`${field}.definition`)
  return { id, groupId, order, kind: value.kind, name: requiredText(value.name, `${field}.name`), description: typeof value.description === 'string' ? value.description : invalid(`${field}.description`), geometry: checkedGeometry, definition: null, style: style(value.style, `${field}.style`), label: label(value.label, `${field}.label`), altitude: altitude(value.altitude, `${field}.altitude`), source }
}

export function validateMapDocument(snapshot) {
  if (!isObject(snapshot) || snapshot.schemaVersion !== 1 || snapshot.kind !== 'personal') invalid('snapshot')
  const id = requiredText(snapshot.id, 'snapshot.id')
  const groups = Array.isArray(snapshot.groups) ? snapshot.groups : invalid('snapshot.groups')
  const items = Array.isArray(snapshot.items) ? snapshot.items : invalid('snapshot.items')
  if (groups.length > MAX_GROUPS) throw new MapSchemaError('map_limit_exceeded', { limit: 'groups' }, 413)
  if (items.length > MAX_ITEMS) throw new MapSchemaError('map_limit_exceeded', { limit: 'items' }, 413)
  const groupIds = new Set(), groupOrders = new Set()
  const normalizedGroups = groups.map((group, index) => {
    const field = `groups[${index}]`
    if (!isObject(group) || group.parentId !== null || (group.sourceVisibility !== null && typeof group.sourceVisibility !== 'boolean')) invalid(field)
    const groupId = requiredText(group.id, `${field}.id`)
    if (groupIds.has(groupId)) invalid(`${field}.id`, 'duplicate_id')
    groupIds.add(groupId)
    const order = nonNegativeInteger(group.order, `${field}.order`)
    if (groupOrders.has(order)) invalid(`${field}.order`, 'duplicate_order')
    groupOrders.add(order)
    return { id: groupId, name: requiredText(group.name, `${field}.name`), parentId: null, order, sourceVisibility: group.sourceVisibility }
  })
  const counts = { coordinates: 0, parts: 0 }
  const itemIds = new Set(), orders = new Set()
  const normalizedItems = items.map((entry, index) => {
    const result = item(entry, index, groupIds, orders, counts)
    if (itemIds.has(result.id)) invalid(`items[${index}].id`, 'duplicate_id')
    itemIds.add(result.id)
    return result
  })
  const source = snapshot.source == null ? null : (isObject(snapshot.source) ? cloneJson(snapshot.source, 'snapshot.source') : invalid('snapshot.source'))
  const document = {
    schemaVersion: 1, id, name: requiredText(snapshot.name, 'snapshot.name'), kind: 'personal', revision: 0,
    createdAt: '', updatedAt: '', ungroupedOrder: nonNegativeInteger(snapshot.ungroupedOrder ?? 0, 'snapshot.ungroupedOrder'),
    groups: normalizedGroups, items: normalizedItems, source,
  }
  const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8')
  if (bytes > MAX_DOCUMENT_BYTES) throw new MapSchemaError('map_too_large', { limit: 'document_bytes' }, 413)
  return { document, bytes, itemCount: normalizedItems.length, groupCount: normalizedGroups.length, coordinates: counts.coordinates, geometryParts: counts.parts }
}
