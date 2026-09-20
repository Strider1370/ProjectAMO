import { circleGeometry, copyMapDocument, ungroupedRank } from './mapDocument.js'

const KML_NAMESPACE = 'http://www.opengis.net/kml/2.2'
const PROJECTAMO_NAMESPACE = 'https://projectamo.example/kml/1'
const VERSION = 1
const RESERVED = {
  document: 'projectamo:map-document',
  folder: 'projectamo:folder',
  item: 'projectamo:item',
}

const plainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value)
const finiteOrder = (value) => Number.isSafeInteger(value) && value >= 0
const localName = (node) => String(node?.localName ?? node?.tagName ?? '').toLowerCase()
const children = (node, name) => Array.from(node?.childNodes ?? []).filter((child) => child.nodeType === 1 && localName(child) === name.toLowerCase())
const childText = (node, name) => children(node, name)[0]?.textContent ?? ''
const cloneJson = (value) => JSON.parse(JSON.stringify(value))

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function kmlColor(color, opacity = 1) {
  const hex = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : '475569'
  const alpha = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1))
  return `${Math.round(alpha * 255).toString(16).padStart(2, '0')}${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`
}

function coordinate(point) {
  return point.map((value) => Number(value)).join(',')
}

function coordinates(points) {
  return points.map(coordinate).join(' ')
}

function geometryKml(geometry) {
  if (!geometry) return ''
  if (geometry.type === 'Point') return `<Point><coordinates>${escapeXml(coordinate(geometry.coordinates))}</coordinates></Point>`
  if (geometry.type === 'LineString') return `<LineString><coordinates>${escapeXml(coordinates(geometry.coordinates))}</coordinates></LineString>`
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    const ring = (name, points) => `<${name}><LinearRing><coordinates>${escapeXml(coordinates(points))}</coordinates></LinearRing></${name}>`
    return `<Polygon>${ring('outerBoundaryIs', outer)}${holes.map((points) => ring('innerBoundaryIs', points)).join('')}</Polygon>`
  }
  if (geometry.type === 'MultiPoint') return `<MultiGeometry>${geometry.coordinates.map((point) => geometryKml({ type: 'Point', coordinates: point })).join('')}</MultiGeometry>`
  if (geometry.type === 'MultiLineString') return `<MultiGeometry>${geometry.coordinates.map((line) => geometryKml({ type: 'LineString', coordinates: line })).join('')}</MultiGeometry>`
  if (geometry.type === 'MultiPolygon') return `<MultiGeometry>${geometry.coordinates.map((polygon) => geometryKml({ type: 'Polygon', coordinates: polygon })).join('')}</MultiGeometry>`
  if (geometry.type === 'GeometryCollection') return `<MultiGeometry>${(geometry.geometries ?? []).map(geometryKml).join('')}</MultiGeometry>`
  return ''
}

function geometryLayout(geometry) {
  if (!geometry) return null
  if (geometry.type === 'GeometryCollection') return { type: 'GeometryCollection', geometries: (geometry.geometries ?? []).map(geometryLayout) }
  if (geometry.type === 'MultiPoint') return { type: 'MultiPoint', geometries: geometry.coordinates.map(() => ({ type: 'Point' })) }
  if (geometry.type === 'MultiLineString') return { type: 'MultiLineString', geometries: geometry.coordinates.map(() => ({ type: 'LineString' })) }
  if (geometry.type === 'MultiPolygon') return { type: 'MultiPolygon', geometries: geometry.coordinates.map(() => ({ type: 'Polygon' })) }
  return { type: geometry.type }
}

function geometryLeaves(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap(geometryLeaves)
  if (geometry.type === 'MultiPoint') return geometry.coordinates.map((coordinates) => ({ type: 'Point', coordinates }))
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }))
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
  return [geometry]
}

function restoreGeometry(layout, leaves, cursor) {
  if (layout == null) return leaves.length === 0 ? null : undefined
  if (!plainObject(layout) || typeof layout.type !== 'string') return undefined
  if (layout.type === 'GeometryCollection') {
    if (!Array.isArray(layout.geometries)) return undefined
    const geometries = layout.geometries.map((child) => restoreGeometry(child, leaves, cursor))
    return geometries.some((geometry) => geometry === undefined) ? undefined : { type: 'GeometryCollection', geometries }
  }
  if (['MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(layout.type)) {
    if (!Array.isArray(layout.geometries)) return undefined
    const expected = { MultiPoint: 'Point', MultiLineString: 'LineString', MultiPolygon: 'Polygon' }[layout.type]
    const parts = layout.geometries.map((child) => restoreGeometry(child, leaves, cursor))
    if (parts.some((part) => part?.type !== expected)) return undefined
    return { type: layout.type, coordinates: parts.map((part) => part.coordinates) }
  }
  if (Object.keys(layout).length !== 1) return undefined
  const leaf = leaves[cursor.value]
  if (!leaf || leaf.type !== layout.type) return undefined
  cursor.value += 1
  return leaf
}

function sameCircleGeometry(geometry, definition) {
  let expected
  try { expected = circleGeometry(definition) } catch { return false }
  const actualRing = geometry?.type === 'Polygon' && geometry.coordinates?.length === 1 ? geometry.coordinates[0] : null
  const expectedRing = expected.coordinates[0]
  return Array.isArray(actualRing) && actualRing.length === expectedRing.length
    && actualRing.every((point, index) => point.length >= 2 && Math.abs(point[0] - expectedRing[index][0]) <= 1e-9 && Math.abs(point[1] - expectedRing[index][1]) <= 1e-9)
}

function styleKml(item, index) {
  const style = item.style ?? {}
  const label = item.label ?? {}
  return `<Style id="projectamo-style-${index}"><IconStyle><color>${kmlColor(style.color, style.opacity)}</color><scale>${escapeXml((Number(style.pointSize) || 5) / 5)}</scale></IconStyle><LabelStyle><color>${kmlColor(style.color, style.opacity)}</color><scale>${escapeXml((Number(label.size) || 12) / 12)}</scale></LabelStyle><LineStyle><color>${kmlColor(style.color, style.opacity)}</color><width>${escapeXml(style.width ?? 2)}</width></LineStyle><PolyStyle><color>${kmlColor(style.fillColor, style.fillOpacity)}</color></PolyStyle></Style>`
}

function descriptionFor(item) {
  const raw = item.source?.descriptionRaw
  if (typeof raw === 'string') return raw
  if (raw?.['@type'] === 'html' && typeof raw.value === 'string') return raw.value
  return item.description ?? ''
}

function extendedData(entries, marker, markerValue) {
  const rawEntries = Array.isArray(entries) ? entries : []
  const values = rawEntries.filter((entry) => !String(entry?.key ?? '').startsWith('projectamo:'))
    .map((entry) => `<Data name="${escapeXml(entry?.key ?? '')}"><value>${escapeXml(entry?.value ?? '')}</value></Data>`)
  const protectedValues = rawEntries.filter((entry) => String(entry?.key ?? '').startsWith('projectamo:'))
    .map((entry) => `<SimpleData name="${escapeXml(entry?.key ?? '')}">${escapeXml(entry?.value ?? '')}</SimpleData>`)
  if (protectedValues.length) values.push(`<SchemaData>${protectedValues.join('')}</SchemaData>`)
  values.push(`<Data name="${marker}"><value>${escapeXml(JSON.stringify(markerValue))}</value></Data>`)
  return `<ExtendedData>${values.join('')}</ExtendedData>`
}

function itemMarker(item, groupId) {
  return {
    version: VERSION,
    id: item.id,
    groupId,
    order: item.order,
    kind: item.kind,
    name: item.name,
    description: item.description ?? '',
    style: item.style ?? null,
    label: item.label ?? null,
    altitude: item.altitude ?? null,
    definition: item.definition ?? null,
    source: item.source ?? null,
    geometryLayout: geometryLayout(item.geometry),
  }
}

function placemarkKml(item, index, groupId) {
  const marker = itemMarker(item, groupId)
  return `<Placemark id="${escapeXml(item.id)}"><name>${escapeXml(item.name)}</name><description>${escapeXml(descriptionFor(item))}</description><styleUrl>#projectamo-style-${index}</styleUrl>${extendedData(item.source?.metadataEntries, RESERVED.item, marker)}${geometryKml(item.geometry)}</Placemark>`
}

function selectedScope(document, { groupId, itemIds } = {}) {
  const groups = Array.isArray(document?.groups) ? document.groups : []
  const items = Array.isArray(document?.items) ? document.items : []
  const groupById = new Map(groups.map((group) => [group.id, group]))
  if (groupId != null && !groupById.has(groupId)) throw new Error('내보낼 그룹을 찾지 못했습니다.')
  const descendants = new Set()
  if (groupId != null) {
    const pending = [groupId]
    while (pending.length) {
      const current = pending.pop()
      if (descendants.has(current)) continue
      descendants.add(current)
      groups.filter((group) => group.parentId === current).forEach((group) => pending.push(group.id))
    }
  }
  const requestedItems = itemIds == null ? null : new Set(itemIds)
  const includedItems = items.filter((item) => (groupId == null || descendants.has(item.groupId)) && (requestedItems == null || requestedItems.has(item.id)))
  const includedGroups = new Set(groupId == null && requestedItems == null ? groups.map((group) => group.id) : includedItems.map((item) => item.groupId).filter(Boolean))
  if (groupId != null && requestedItems == null) descendants.forEach((id) => includedGroups.add(id))
  for (const id of [...includedGroups]) {
    for (let group = groupById.get(id); group?.parentId != null; group = groupById.get(group.parentId)) includedGroups.add(group.parentId)
  }
  return { groups: groups.filter((group) => includedGroups.has(group.id)), items: includedItems }
}

function folderKml(group, allGroups, items, indexByItem, emittedIds) {
  const emittedParentId = emittedIds.has(group.parentId) ? group.parentId : null
  const marker = { version: VERSION, id: group.id, parentId: emittedParentId, order: group.order, sourceVisibility: group.sourceVisibility ?? null, name: group.name }
  const descendants = allGroups.filter((candidate) => candidate.parentId === group.id).sort((a, b) => a.order - b.order)
  const ownItems = items.filter((item) => item.groupId === group.id).sort((a, b) => a.order - b.order)
  return `<Folder id="${escapeXml(group.id)}"><name>${escapeXml(group.name)}</name>${extendedData([], RESERVED.folder, marker)}${descendants.map((child) => folderKml(child, allGroups, items, indexByItem, emittedIds)).join('')}${ownItems.map((item) => placemarkKml(item, indexByItem.get(item.id), group.id)).join('')}</Folder>`
}

export function exportMapKml(document, options = {}) {
  const scope = selectedScope(document, options)
  const indexByItem = new Map(scope.items.map((item, index) => [item.id, index]))
  const emittedIds = new Set(scope.groups.map((group) => group.id))
  const roots = scope.groups.filter((group) => !emittedIds.has(group.parentId)).sort((a, b) => a.order - b.order)
  const ungrouped = scope.items.filter((item) => item.groupId == null).sort((a, b) => a.order - b.order)
  const docGroups = Array.isArray(document?.groups) ? document.groups : []
  const docIds = new Set(docGroups.map((group) => group.id))
  const docRoots = docGroups.filter((group) => group.parentId == null || !docIds.has(group.parentId)).sort((a, b) => a.order - b.order)
  const rootRank = new Map(docRoots.map((group, index) => [group.id, index]))
  const rank = ungroupedRank(document, docRoots.length)
  const ungroupedAt = roots.filter((group) => (rootRank.get(group.id) ?? docRoots.length) < rank).length
  const marker = {
    version: VERSION,
    name: document?.name ?? '내 지도',
    ungroupedOrder: ungroupedAt,
    source: document?.source ?? null,
    folderCount: scope.groups.length,
    itemCount: scope.items.length,
  }
  const styles = scope.items.map(styleKml).join('')
  const rootContent = [
    ...roots.slice(0, ungroupedAt).map((group) => folderKml(group, scope.groups, scope.items, indexByItem, emittedIds)),
    ...ungrouped.map((item) => placemarkKml(item, indexByItem.get(item.id), null)),
    ...roots.slice(ungroupedAt).map((group) => folderKml(group, scope.groups, scope.items, indexByItem, emittedIds)),
  ].join('')
  const content = `${extendedData([], RESERVED.document, marker)}${styles}${rootContent}`
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="${KML_NAMESPACE}" xmlns:projectamo="${PROJECTAMO_NAMESPACE}"><Document><name>${escapeXml(document?.name ?? '내 지도')}</name>${content}</Document></kml>`
}

function groupPath(document, groupId) {
  const byId = new Map((document?.groups ?? []).map((group) => [group.id, group]))
  const result = []
  for (let group = byId.get(groupId), seen = new Set(); group && !seen.has(group.id); group = byId.get(group.parentId)) {
    result.unshift(group.name)
    seen.add(group.id)
  }
  return result
}

const COMPOUND_GEOMETRIES = new Set(['GeometryCollection', 'MultiPoint', 'MultiLineString', 'MultiPolygon'])

const ISSUE_TEXT = {
  unsupported: (count) => `${count}개 항목은 지원하지 않는 도형이라 제외됩니다.`,
  circle: (count) => `원 ${count}개는 외부 KML 프로그램에서 다각형으로 표시됩니다. 중심·반경은 우리 앱에서만 복원됩니다.`,
  compound: (count) => `복합 도형 ${count}개는 원본을 보존하지만 꼭짓점 편집은 할 수 없습니다.`,
  externalIcon: (count) => `${count}개 항목의 외부 아이콘 이미지는 내보내지지 않습니다.`,
  altitudeDatum: (count) => `${count}개 항목의 고도 기준이 MSL이 아닙니다. 원본 값·단위·기준을 그대로 보존하며 MSL로 변환하지 않습니다.`,
  htmlDescription: (count) => `${count}개 항목의 원문 HTML 설명은 보존되지만 화면에는 안전한 글·표로만 표시됩니다.`,
}

export function previewMapConversion(document) {
  const items = document?.items ?? []
  const issues = new Map()
  const flag = (code, item) => {
    if (!issues.has(code)) issues.set(code, { code, count: 0, samples: [] })
    const issue = issues.get(code)
    issue.count += 1
    if (issue.samples.length < 3) issue.samples.push(item.name || item.id)
  }
  let included = 0, converted = 0, excluded = 0
  for (const item of items) {
    const icon = item.source?.properties?.icon
    if (typeof icon === 'string' && /^(?:https?:)?\/\//i.test(icon)) flag('externalIcon', item)
    if (item.altitude?.datum != null && item.altitude.datum !== 'MSL') flag('altitudeDatum', item)
    if (item.source?.descriptionRaw?.['@type'] === 'html') flag('htmlDescription', item)

    if (!geometryKml(item.geometry)) { excluded += 1; flag('unsupported', item); continue }
    if (item.kind === 'circle') { converted += 1; flag('circle', item); continue }
    if (COMPOUND_GEOMETRIES.has(item.geometry?.type)) { converted += 1; flag('compound', item); continue }
    included += 1
  }
  const list = [...issues.values()]
  return {
    itemCount: items.length,
    groupCount: document?.groups?.length ?? 0,
    includedCount: included,
    convertedCount: converted,
    excludedCount: excluded,
    groups: (document?.groups ?? []).map((group) => ({ id: group.id, path: groupPath(document, group.id) })),
    issues: list,
    warnings: list.map((issue) => ISSUE_TEXT[issue.code](issue.count)),
  }
}

export function convertImportedMap(document, { name } = {}) {
  const copy = copyMapDocument(document, { name: name ?? `${document?.name ?? '가져온 지도'} 편집본`, flatten: true })
  copy.kind = 'personal'
  copy.revision = 0
  return copy
}

function markerValues(node, name) {
  const values = []
  for (const extended of children(node, 'ExtendedData')) for (const data of children(extended, 'Data')) {
    if (data.getAttribute('name') === name) values.push(childText(data, 'value'))
  }
  return values
}

function parseMarker(node, name) {
  const values = markerValues(node, name)
  if (values.length !== 1) return { error: values.length === 0 ? '누락' : '중복' }
  try {
    const value = JSON.parse(values[0])
    return plainObject(value) && value.version === VERSION ? { value } : { error: '버전 또는 형식' }
  } catch { return { error: 'JSON' } }
}

function parentFolder(node) {
  for (let parent = node?.parentNode; parent; parent = parent.parentNode) if (parent.nodeType === 1 && localName(parent) === 'folder') return parent
  return null
}

function validItemPayload(value) {
  return plainObject(value) && typeof value.id === 'string' && value.id && (value.groupId == null || typeof value.groupId === 'string')
    && finiteOrder(value.order) && ['point', 'line', 'polygon', 'circle', 'compound'].includes(value.kind)
    && typeof value.name === 'string' && typeof value.description === 'string' && validStyle(value.style)
    && validLabel(value.label) && validAltitude(value.altitude) && validDefinition(value.kind, value.definition) && validSource(value.source)
    && (value.geometryLayout === null || plainObject(value.geometryLayout))
}

function validStyle(value) {
  return plainObject(value) && /^#[0-9a-f]{6}$/i.test(value.color) && /^#[0-9a-f]{6}$/i.test(value.fillColor)
    && [value.width, value.opacity, value.fillOpacity, value.pointSize].every(Number.isFinite)
    && value.width >= 0 && value.width <= 30 && value.opacity >= 0 && value.opacity <= 1 && value.fillOpacity >= 0 && value.fillOpacity <= 1 && value.pointSize >= 1 && value.pointSize <= 50
    && ['solid', 'dashed', 'dotted'].includes(value.dash) && ['dot', 'pin', 'triangle', 'square', 'star', 'cross'].includes(value.icon)
}

function validLabel(value) {
  return plainObject(value) && typeof value.visible === 'boolean' && typeof value.always === 'boolean' && Number.isFinite(value.size) && value.size >= 8 && value.size <= 32
}

function validAltitude(value) {
  const finiteOrNull = (part) => part == null || (Number.isFinite(part) && part >= -2000 && part <= 100000)
  return plainObject(value) && finiteOrNull(value.floorFt) && finiteOrNull(value.ceilingFt) && ['MSL', 'AGL', 'FL', 'unknown'].includes(value.datum)
    && !(value.floorFt != null && value.ceilingFt != null && value.floorFt >= value.ceilingFt)
}

function validDefinition(kind, value) {
  if (kind !== 'circle') return value === null
  return plainObject(value) && Array.isArray(value.center) && value.center.length >= 2 && value.center.every(Number.isFinite)
    && value.center[0] >= -180 && value.center[0] <= 180 && value.center[1] >= -90 && value.center[1] <= 90 && Number.isFinite(value.radiusNm) && value.radiusNm > 0
}

function validSource(value) {
  if (value === null) return true
  if (!plainObject(value) || typeof value.sourceAssetId !== 'string' || typeof value.itemId !== 'string' || !Array.isArray(value.folderPath)
    || value.folderPath.some((part) => typeof part !== 'string') || !plainObject(value.properties) || !Array.isArray(value.metadataEntries)
    || value.metadataEntries.some((entry) => !plainObject(entry) || typeof entry.key !== 'string') || typeof value.descriptionText !== 'string'
    || !Array.isArray(value.summary) || !Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== 'string')) return false
  return value.descriptionRaw == null || typeof value.descriptionRaw === 'string'
    || (plainObject(value.descriptionRaw) && value.descriptionRaw['@type'] === 'html' && typeof value.descriptionRaw.value === 'string')
}

function invalidReservation(reason) {
  return { valid: false, warning: `ProjectAMO 예약 메타데이터를 ${reason} 때문에 무시하고 일반 KML로 읽었습니다.` }
}

// 예약 자료는 Document/Folder/Placemark 전체가 하나의 일관된 집합일 때만 신뢰한다.
// 일부만 맞는 경우에는 원문 Data를 일반 메타데이터로 남긴다.
export function decodeProjectamoKml(doc) {
  const documentNode = Array.from(doc?.getElementsByTagName?.('Document') ?? [])[0]
  if (!documentNode) return { valid: false, warning: null }
  const folders = Array.from(documentNode.getElementsByTagName('Folder'))
  const placemarks = Array.from(documentNode.getElementsByTagName('Placemark'))
  // 원본 ExtendedData의 임의 key가 projectamo:item일 수 있다. 문서 표식이 있을 때만
  // 이 형식을 예약 transport로 판단한다.
  if (markerValues(documentNode, RESERVED.document).length === 0) return { valid: false, warning: null }
  const documentMarker = parseMarker(documentNode, RESERVED.document)
  if (documentMarker.error) return invalidReservation(`문서 표식 ${documentMarker.error}`)
  const folderMarkers = folders.map((node) => ({ node, ...parseMarker(node, RESERVED.folder) }))
  const itemMarkers = placemarks.map((node) => ({ node, ...parseMarker(node, RESERVED.item) }))
  if (folderMarkers.some((entry) => entry.error) || itemMarkers.some((entry) => entry.error)) return invalidReservation('폴더 또는 항목 표식 누락/중복')
  const root = documentMarker.value
  if (typeof root.name !== 'string' || root.name !== childText(documentNode, 'name') || !finiteOrder(root.ungroupedOrder) || !Number.isSafeInteger(root.folderCount) || !Number.isSafeInteger(root.itemCount)
    || root.folderCount !== folders.length || root.itemCount !== placemarks.length || (root.source != null && !plainObject(root.source))) return invalidReservation('문서 구조')
  const ids = new Set()
  for (const entry of folderMarkers) {
    const value = entry.value
    if (!plainObject(value) || typeof value.id !== 'string' || !value.id || ids.has(value.id) || !finiteOrder(value.order)
      || (value.parentId != null && typeof value.parentId !== 'string') || ![true, false, null].includes(value.sourceVisibility)
      || typeof value.name !== 'string' || value.name !== childText(entry.node, 'name')) return invalidReservation('폴더 구조')
    ids.add(value.id)
  }
  const folderByNode = new Map(folderMarkers.map((entry) => [entry.node, entry.value]))
  for (const entry of folderMarkers) {
    const expectedParentId = folderByNode.get(parentFolder(entry.node))?.id ?? null
    if (entry.value.parentId !== expectedParentId) return invalidReservation('폴더 계층')
  }
  const itemIds = new Set()
  for (const entry of itemMarkers) {
    if (!validItemPayload(entry.value) || itemIds.has(entry.value.id)) return invalidReservation('항목 구조')
    const expectedGroupId = folderByNode.get(parentFolder(entry.node))?.id ?? null
    if (entry.value.groupId !== expectedGroupId || entry.value.name !== childText(entry.node, 'name')) return invalidReservation('항목 그룹')
    itemIds.add(entry.value.id)
  }
  return { valid: true, document: root, groups: folderMarkers, items: itemMarkers }
}

export function reservationMatchesGeometry(reservation, geometries) {
  return restoreReservedGeometries(reservation, geometries) != null
}

export function restoreReservedGeometries(reservation, geometries) {
  if (!reservation?.valid || reservation.items.length !== geometries.length) return null
  const restored = []
  for (let index = 0; index < reservation.items.length; index += 1) {
    const raw = geometries[index]
    const leaves = geometryLeaves(raw)
    const cursor = { value: 0 }
    const geometry = restoreGeometry(reservation.items[index].value.geometryLayout, leaves, cursor)
    if (geometry === undefined || cursor.value !== leaves.length) return null
    const expectedType = { point: 'Point', line: 'LineString', polygon: 'Polygon', circle: 'Polygon' }[reservation.items[index].value.kind]
    if (expectedType && geometry?.type !== expectedType) return null
    if (reservation.items[index].value.kind === 'circle' && !sameCircleGeometry(geometry, reservation.items[index].value.definition)) return null
    restored.push(geometry)
  }
  return restored
}
