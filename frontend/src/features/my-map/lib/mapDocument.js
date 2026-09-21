import { circleRing } from '../../draw-spike/lib/shapeBuilders.js'

export const MAP_SCHEMA_VERSION = 1
export const DEFAULT_MAP_STYLE = Object.freeze({ color: '#475569', width: 2, opacity: 1, fillColor: '#475569', fillOpacity: 0.1, pointSize: 5, dash: 'solid', icon: 'dot' })
export const DEFAULT_MAP_LABEL = Object.freeze({ visible: true, size: 12, always: false })
export const scopeId = (documentId, id) => `${documentId}:${id}`
export const newMapId = () => globalThis.crypto?.randomUUID?.() ?? `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
export const copyJson = (value) => JSON.parse(JSON.stringify(value))

export function createMapDocument(name = '새 지도') {
  const now = new Date().toISOString()
  return { schemaVersion: MAP_SCHEMA_VERSION, id: newMapId(), name: String(name).trim() || '새 지도', kind: 'personal', revision: 0, createdAt: now, updatedAt: now, groups: [], items: [], ungroupedOrder: 0, source: null }
}

export function circleGeometry(definition) {
  if (!validCoordinate(definition?.center) || !Number.isFinite(definition?.radiusNm) || definition.radiusNm <= 0) throw new Error('원의 중심과 0보다 큰 반경을 입력하세요.')
  const ring = circleRing(definition.center, definition.radiusNm)
  ring[ring.length - 1] = [...ring[0]]
  return { type: 'Polygon', coordinates: [ring] }
}

export function createMapItem(kind, geometry, overrides = {}) {
  const item = { id: newMapId(), groupId: null, order: 0, kind, name: '', description: '', geometry, definition: null, style: { ...DEFAULT_MAP_STYLE }, label: { ...DEFAULT_MAP_LABEL }, altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' }, source: null, ...overrides }
  if (kind === 'circle') item.geometry = circleGeometry(item.definition)
  const error = validateItem(item)
  if (error) throw new Error(error)
  return item
}

export function validCoordinate(point) {
  return Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite) && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90
}

export function geometryCoordinates(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap(geometryCoordinates)
  const result = []
  const walk = (value) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number') result.push(value)
    else value.forEach(walk)
  }
  walk(geometry.coordinates)
  return result
}

const samePoint = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1]
function ringCrosses(ring) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
  for (let i = 0; i < ring.length - 1; i += 1) {
    for (let j = i + 2; j < ring.length - 1; j += 1) {
      if (i === 0 && j === ring.length - 2) continue
      const [a, b, c, d] = [ring[i], ring[i + 1], ring[j], ring[j + 1]]
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true
      if (on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return true
    }
  }
  return false
}

function ringsIntersect(a, b) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const on = (p, q, r) => Math.abs(cross(p, q, r)) < 1e-12 && r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) && r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1])
  for (let i = 0; i < a.length - 1; i += 1) for (let j = 0; j < b.length - 1; j += 1) {
    const [p, q, r, s] = [a[i], a[i + 1], b[j], b[j + 1]]
    if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true
    if (on(p, q, r) || on(p, q, s) || on(r, s, p) || on(r, s, q)) return true
  }
  return false
}
function insideRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function validateItem(item, { checkIntersections = true } = {}) {
  const geometry = item?.geometry
  const expected = { point: 'Point', line: 'LineString', polygon: 'Polygon', circle: 'Polygon' }[item?.kind]
  if (expected && geometry?.type !== expected) return '도형 종류와 좌표 형식이 맞지 않습니다.'
  const coordinates = geometryCoordinates(geometry)
  if (!coordinates.length || coordinates.some((p) => !validCoordinate(p))) return '유효한 경도·위도 좌표를 입력하세요.'
  if (geometry.type === 'LineString' && (coordinates.length < 2 || coordinates.every((p) => samePoint(p, coordinates[0])))) return '서로 다른 지점 두 개 이상이 필요합니다.'
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      if (ring.length < 4 || !samePoint(ring[0], ring.at(-1))) return '면은 서로 다른 세 지점 이상을 연결해 닫아야 합니다.'
      const area = ring.slice(0, -1).reduce((sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0)
      if (Math.abs(area) < 1e-12) return '면의 넓이가 0입니다. 꼭짓점 위치를 확인하세요.'
      if (checkIntersections && ringCrosses(ring)) return '면의 선이 서로 교차합니다. 꼭짓점 위치를 확인하세요.'
    }
    if (checkIntersections) {
      const [outer, ...holes] = geometry.coordinates
      for (let i = 0; i < holes.length; i += 1) {
        if (!insideRing(holes[i][0], outer) || ringsIntersect(outer, holes[i])) return '면 내부의 빈 영역이 바깥 경계를 벗어납니다.'
        for (let j = 0; j < i; j += 1) if (ringsIntersect(holes[i], holes[j]) || insideRing(holes[i][0], holes[j]) || insideRing(holes[j][0], holes[i])) return '면 내부의 빈 영역들이 겹칩니다.'
      }
    }
  }
  if (item.kind === 'circle' && (!validCoordinate(item.definition?.center) || !Number.isFinite(item.definition?.radiusNm) || !(item.definition?.radiusNm > 0))) return '원의 중심과 반경을 확인하세요.'
  const { floorFt, ceilingFt } = item.altitude ?? {}
  if ([floorFt, ceilingFt].some((v) => v != null && !Number.isFinite(v))) return '고도는 숫자로 입력하세요.'
  if (floorFt != null && ceilingFt != null && floorFt >= ceilingFt) return '바닥 고도는 천장 고도보다 낮아야 합니다.'
  return null
}

export function groupPath(document, id) {
  const byId = new Map(document.groups.map((g) => [g.id, g]))
  const names = [], seen = new Set()
  for (let group = byId.get(id); group && !seen.has(group.id); group = byId.get(group.parentId)) {
    names.unshift(group.name); seen.add(group.id)
  }
  return names
}

export function groupDisplayOrder(document) {
  const groups = document?.groups ?? []
  const byId = new Map(groups.map((g) => [g.id, g]))
  const children = new Map(), roots = []
  for (const g of groups) {
    const parentId = g.parentId != null && byId.has(g.parentId) ? g.parentId : null
    if (parentId == null) roots.push(g)
    else children.set(parentId, [...(children.get(parentId) ?? []), g])
  }
  const byOrder = (a, b) => a.order - b.order
  roots.sort(byOrder)
  for (const list of children.values()) list.sort(byOrder)
  const order = new Map(), rootStart = [], seen = new Set()
  const visit = (group) => {
    if (seen.has(group.id)) return
    seen.add(group.id); order.set(group.id, order.size)
    for (const child of children.get(group.id) ?? []) visit(child)
  }
  for (const root of roots) { rootStart.push(order.size); visit(root) }
  for (const g of groups) if (!seen.has(g.id)) { seen.add(g.id); order.set(g.id, order.size) }
  return { order, rootStart, rootIds: roots.map((g) => g.id) }
}

export function ungroupedRank(document, fallback) {
  if (!Number.isSafeInteger(document?.ungroupedOrder)) return fallback
  const groups = document?.groups ?? [], ids = new Set(groups.map((group) => group.id))
  // order is a sort key shared with the ungrouped block, not a current array index.
  // Deleting a group intentionally leaves gaps in these keys.
  return groups.filter((group) => !ids.has(group.parentId) && group.order < document.ungroupedOrder).length
}

export function copyMapDocument(source, { name = `${source.name} 사본`, flatten = source.kind !== 'personal' } = {}) {
  const result = createMapDocument(name)
  const groupIds = new Map(source.groups.map((g) => [g.id, newMapId()]))
  const display = flatten ? groupDisplayOrder(source) : null
  const rank = ungroupedRank(source, Number.MAX_SAFE_INTEGER)
  result.ungroupedOrder = flatten
    ? (rank >= display.rootStart.length ? source.groups.length : display.rootStart[rank])
    : source.ungroupedOrder ?? source.groups.length
  result.groups = source.groups.map((g, index) => {
    const position = flatten ? display.order.get(g.id) ?? index : g.order
    return { id: groupIds.get(g.id), name: flatten ? groupPath(source, g.id).join(' / ') : g.name, parentId: flatten ? null : groupIds.get(g.parentId) ?? null,
      order: flatten && position >= result.ungroupedOrder ? position + 1 : position, sourceVisibility: g.sourceVisibility ?? null }
  })
  result.items = source.items.map((item) => ({ ...copyJson(item), id: newMapId(), groupId: groupIds.get(item.groupId) ?? null }))
  result.source = source.source ? copyJson(source.source) : null
  return result
}

export function moveMapItems(document, itemIds, targetGroupId, beforeId = null) {
  if (targetGroupId != null && !document.groups.some((g) => g.id === targetGroupId)) throw new Error('이동할 그룹을 찾지 못했습니다.')
  const groupOrder = new Map(document.groups.map((group) => [group.id, group.order]))
  groupOrder.set(null, document.ungroupedOrder ?? document.groups.length)
  const ids = new Set(itemIds), selected = document.items.filter((item) => ids.has(item.id)).sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) || a.order - b.order)
  if (!selected.length || ids.has(beforeId)) return document
  const others = document.items.filter((item) => !ids.has(item.id))
  const target = others.filter((item) => item.groupId === targetGroupId).sort((a, b) => a.order - b.order)
  const position = beforeId == null ? target.length : target.findIndex((item) => item.id === beforeId)
  target.splice(position < 0 ? target.length : position, 0, ...selected.map((item) => ({ ...item, groupId: targetGroupId })))
  const orders = new Map(target.map((item, order) => [item.id, { ...item, order }]))
  return { ...document, items: [...others.filter((item) => item.groupId !== targetGroupId), ...orders.values()] }
}

/** Append an independent flattened copy; existing blocks and the virtual block stay put. */
export function appendMapDocument(document, source) {
  if (document.kind !== 'personal') throw new Error('개인 지도에만 자료를 추가할 수 있습니다.')
  const copy = copyMapDocument(source, { flatten: true })
  const groupOffset = Math.max(document.ungroupedOrder ?? 0, ...document.groups.map((group) => group.order)) + 1
  const groups = [...copy.groups].sort((a, b) => a.order - b.order).map((group, index) => ({ ...group, order: groupOffset + index }))
  const ungroupedOffset = Math.max(-1, ...document.items.filter((item) => item.groupId == null).map((item) => item.order)) + 1
  let ungroupedIndex = 0
  const items = [...copy.items].sort((a, b) => a.order - b.order).map((item) => item.groupId == null ? { ...item, order: ungroupedOffset + ungroupedIndex++ } : item)
  return { ...document, groups: [...document.groups, ...groups], items: [...document.items, ...items],
    source: { ...document.source, imports: [...(document.source?.imports ?? []), { sourceAssetId: source.id, documentName: source.name, source: copy.source }] },
  }
}

export function isGroupHidden(document, groupId, hiddenGroups) {
  const groups = new Map(document.groups.map((g) => [g.id, g])), seen = new Set()
  for (let id = groupId; id != null && !seen.has(id); id = groups.get(id)?.parentId) {
    if (hiddenGroups.has(scopeId(document.id, id))) return true
    seen.add(id)
  }
  return false
}

export function initialMapVisibility(document) {
  return {
    groups: document.groups.filter((g) => g.sourceVisibility === false).map((g) => scopeId(document.id, g.id)),
    items: document.items.filter((item) => item.source?.properties?.visibility === false).map((item) => scopeId(document.id, item.id)),
  }
}

// Immutable commands retain references to unchanged large imported geometries. A history
// entry is a completed document transaction, never every pointermove or render fragment.
export function pushMapHistory(history, previous) { return [...history, previous].slice(-50) }
