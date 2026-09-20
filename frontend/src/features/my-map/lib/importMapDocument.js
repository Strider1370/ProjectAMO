import { kmlWithFolders } from '@tmcw/togeojson'
import { readKmlFromBuffer } from './kmzUnzip.js'
import { readExtendedDataEntries, sourceMetadata } from './mapMetadata.js'
import { decodeProjectamoKml, restoreReservedGeometries } from './mapKmlCodec.js'

const KNOWN_NAMESPACES = {
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  atom: 'http://www.w3.org/2005/Atom',
  gx: 'http://www.google.com/kml/ext/2.2',
  kml: 'http://www.opengis.net/kml/2.2',
}

const DEFAULT_STYLE = {
  color: '#475569', width: 2, opacity: 1, fillColor: '#475569', fillOpacity: 0.1,
  pointSize: 5, dash: 'solid', icon: 'dot',
}

function fail(stage, message) {
  const error = new Error(message)
  error.stage = stage
  return error
}

function repairKnownKmlNamespaces(text) {
  const missing = Object.entries(KNOWN_NAMESPACES)
    .filter(([prefix]) => new RegExp(`\\b${prefix}:`).test(text) && !new RegExp(`\\bxmlns:${prefix}\\s*=`).test(text))
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
  return missing.length === 0 ? text : text.replace(/<kml\b([^>]*)>/i, `<kml$1 ${missing.join(' ')}>`)
}

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? '').toLowerCase()
}

function children(node, name) {
  return Array.from(node?.childNodes ?? []).filter((child) => child.nodeType === 1 && localName(child) === name.toLowerCase())
}

function childText(node, name) {
  return children(node, name)[0]?.textContent?.trim() ?? ''
}

function visibility(value) {
  if (String(value).trim() === '0') return false
  if (String(value).trim() === '1') return true
  return null
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `import-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function mapKind(geometry) {
  if (geometry?.type === 'Point') return 'point'
  if (geometry?.type === 'LineString') return 'line'
  if (geometry?.type === 'Polygon') return 'polygon'
  return 'compound'
}

function styleNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

function normalizedStyle(properties) {
  const color = typeof properties.stroke === 'string'
    ? properties.stroke
    : typeof properties['icon-color'] === 'string'
      ? properties['icon-color']
      : typeof properties.fill === 'string' ? properties.fill : DEFAULT_STYLE.color
  return {
    ...DEFAULT_STYLE,
    color,
    width: styleNumber(properties['stroke-width'], DEFAULT_STYLE.width),
    opacity: styleNumber(properties['stroke-opacity'], DEFAULT_STYLE.opacity),
    fillColor: typeof properties.fill === 'string' ? properties.fill : DEFAULT_STYLE.fillColor,
    fillOpacity: styleNumber(properties['fill-opacity'], DEFAULT_STYLE.fillOpacity),
    pointSize: styleNumber(properties['icon-scale'], 1) * DEFAULT_STYLE.pointSize,
  }
}

function documentName(doc, fileName) {
  const document = Array.from(doc.getElementsByTagName('Document'))[0]
  return childText(document, 'name') || String(fileName).replace(/\.(?:kml|kmz)$/i, '') || '가져온 지도'
}

function flattenKmlTree(tree) {
  const groups = []
  const features = []
  const paths = new Map()
  let unsupported = 0
  let groupSerial = 0
  let unnamed = 0

  const visit = (node, parentId = null) => {
    for (const child of node.children ?? []) {
      if (child.type === 'folder') {
        const rawName = String(child.meta?.name ?? '').trim()
        const id = `group-${groupSerial++}`
        groups.push({
          id,
          name: rawName || `(이름 없는 폴더 ${++unnamed})`,
          parentId,
          order: groups.filter((group) => group.parentId === parentId).length,
          sourceVisibility: visibility(child.meta?.visibility),
        })
        paths.set(id, [...(paths.get(parentId) ?? []), rawName || `(이름 없는 폴더 ${unnamed})`])
        visit(child, id)
      } else if (child.type === 'Feature') {
        // GroundOverlay/NetworkLink는 Placemark가 아니며 이번 읽기 문서 항목에 넣지 않는다.
        if (!child.properties?.['@geometry-type']) features.push({ feature: child, groupId: parentId })
        else unsupported += 1
      }
    }
  }
  visit(tree)
  return { groups, features, paths, unsupported }
}

function sourceItemId(placemark, ordinal, used) {
  const raw = placemark.getAttribute('id')?.trim()
  const base = raw || `placemark-${ordinal + 1}`
  const seen = used.get(base) ?? 0
  used.set(base, seen + 1)
  return seen === 0 ? base : `${base}#${seen + 1}`
}

function addConversionReferences(placemarks) {
  const prefix = '__projectamo_import_ref_'
  const restore = placemarks.map((placemark, index) => {
    const original = placemark.getAttribute('id')
    placemark.setAttribute('id', `${prefix}${index}`)
    return () => {
      if (original == null) placemark.removeAttribute('id')
      else placemark.setAttribute('id', original)
    }
  })
  return { prefix, restore: () => restore.forEach((fn) => fn()) }
}

export async function importMapDocument(arrayBuffer, fileName = '', { id } = {}) {
  let sourceText
  try {
    sourceText = await readKmlFromBuffer(arrayBuffer, fileName)
  } catch (error) {
    throw fail('압축 해제', error?.message ?? '압축 파일을 열 수 없습니다.')
  }

  let doc
  try {
    doc = new DOMParser().parseFromString(repairKnownKmlNamespaces(sourceText), 'text/xml')
  } catch {
    doc = null
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0 || doc.getElementsByTagName('kml').length === 0) {
    throw fail('지도 내용 해석', '지도 내용을 해석하지 못했습니다. 파일이 손상되었을 수 있습니다.')
  }

  const placemarks = Array.from(doc.getElementsByTagName('Placemark'))
  const reservation = decodeProjectamoKml(doc)
  let groups
  let converted
  let groupPaths
  let unsupported
  try {
    // GeometryCollection을 여기서 펼치지 않는다. 변환기에는 임시 원본 참조 ID를
    // 부여해 결과 순서가 달라져도 Placemark와 feature를 직접 연결한다.
    const references = addConversionReferences(placemarks)
    try {
      ({ groups, features: converted, paths: groupPaths, unsupported } = flattenKmlTree(kmlWithFolders(doc)))
      converted = new Map(converted.map((entry) => [entry.feature.id, entry]))
    } finally {
      references.restore()
    }
  } catch (error) {
    throw fail('도형 변환', error?.message ?? '도형을 변환하지 못했습니다.')
  }

  const warnings = reservation.warning ? [reservation.warning] : []
  if (converted.size !== placemarks.length) {
    warnings.push(`Placemark ${placemarks.length}개 중 변환 결과 ${converted.size}개를 연결했습니다.`)
  }
  if (unsupported) warnings.push(`Placemark가 아닌 KML 객체 ${unsupported}개는 읽기 항목에서 제외했습니다.`)

  const convertedGeometries = placemarks.map((_placemark, index) => converted.get(`__projectamo_import_ref_${index}`)?.feature?.geometry ?? null)
  const reservedGeometries = reservation.valid ? restoreReservedGeometries(reservation, convertedGeometries) : null
  const reserved = reservedGeometries ? reservation : null
  if (reservation.valid && !reserved) warnings.push('ProjectAMO 예약 메타데이터의 도형 구조가 KML과 달라 일반 KML로 읽었습니다.')

  const documentId = id ?? createId()
  const sourceAssetId = id ?? documentId
  const usedSourceIds = new Map()
  const items = placemarks.map((placemark, index) => {
    const convertedItem = converted.get(`__projectamo_import_ref_${index}`)
    const feature = convertedItem?.feature
    const properties = { ...(feature?.properties ?? {}) }
    const marker = reserved?.items[index]?.value ?? null
    const metadata = marker ? null : sourceMetadata({
      properties,
      description: properties.description ?? childText(placemark, 'description'),
      extendedEntries: readExtendedDataEntries(placemark),
    })
    const itemWarnings = metadata ? [...metadata.warnings] : []
    if (!marker && !feature) itemWarnings.push('이 Placemark의 도형을 변환하지 못했습니다.')
    if (!marker && !feature?.geometry) itemWarnings.push('표시할 도형이 없습니다.')
    if (!marker && feature?.geometry && !['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(feature.geometry.type)) {
      itemWarnings.push(`지원하지 않는 도형 형식입니다 (${feature.geometry.type}).`)
    }
    const name = marker?.name ?? (String(properties.name ?? childText(placemark, 'name') ?? '').trim() || `(이름 없는 항목 ${index + 1})`)
    return {
      id: marker?.id ?? `item-${index}`, // 파일 순서에만 의존하므로 이름 변경·중복과 무관하게 안정적이다.
      groupId: marker?.groupId ?? convertedItem?.groupId ?? null,
      order: marker?.order ?? index,
      kind: marker?.kind ?? mapKind(feature?.geometry),
      name,
      description: marker?.description ?? metadata.descriptionText,
      geometry: reserved ? reservedGeometries[index] : feature?.geometry ?? null,
      definition: marker?.definition ?? null,
      style: marker?.style ?? normalizedStyle(properties),
      label: marker?.label ?? { visible: true, size: 12, always: false },
      altitude: marker?.altitude ?? { floorFt: null, ceilingFt: null, datum: 'MSL' },
      source: marker ? marker.source : {
        sourceAssetId,
        itemId: sourceItemId(placemark, index, usedSourceIds),
        folderPath: groupPaths.get(convertedItem?.groupId) ?? [],
        properties,
        metadataEntries: metadata?.metadataEntries ?? [],
        descriptionRaw: metadata?.descriptionRaw ?? null,
        descriptionText: metadata?.descriptionText ?? '',
        descriptionNarrativeText: metadata?.descriptionNarrativeText ?? '',
        summary: metadata?.summary ?? [],
        warnings: itemWarnings,
      },
    }
  })

  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: documentId,
    name: documentName(doc, fileName),
    kind: 'imported',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    groups: reserved ? reserved.groups.map((entry) => ({
      id: entry.value.id,
      name: entry.value.name,
      parentId: entry.value.parentId,
      order: entry.value.order,
      sourceVisibility: entry.value.sourceVisibility,
    })) : groups,
    items,
    ungroupedOrder: reserved?.document.ungroupedOrder ?? groups.length,
    source: reserved?.document.source ?? { fileName: String(fileName), documentName: documentName(doc, fileName), warnings },
  }
}
