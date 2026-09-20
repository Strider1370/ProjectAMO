// 기존 /draw 시험판 자료를 개인 지도로 이전한다.
//
// 원본 키는 지우지 않는다. 이전은 검증 가능한 사본을 만드는 일이고, /draw는
// 통합이 끝날 때까지 그대로 남는다. 같은 도형을 두 번 이전하지 않도록
// 이전 기록만 따로 보관한다.
import { rebuild } from '../../draw-spike/lib/shapeBuilders.js'
import { circleGeometry, createMapDocument, newMapId, DEFAULT_MAP_STYLE, DEFAULT_MAP_LABEL } from './mapDocument.js'

export const DRAW_SPIKE_KEY = 'projectamo.draw-spike.v1'
export const DRAW_MIGRATION_KEY = 'projectamo.my-map.draw-migrated.v1'
const UNFILED = '(폴더 없음)'

// /draw에만 있는 고급 도형. 보존해서 보여주되 꼭짓점 편집 대상으로 삼지 않는다.
const ADVANCED = { arc: '호', sector: '섹터', arrow: '화살표', corridor: '회랑' }

const storage = () => { try { return globalThis.localStorage ?? null } catch { return null } }

export function readDrawSpikeState(store = storage()) {
  if (!store) return null
  try {
    const parsed = JSON.parse(store.getItem(DRAW_SPIKE_KEY) ?? 'null')
    if (!parsed || !Array.isArray(parsed.features)) return null
    return { features: parsed.features, folders: Array.isArray(parsed.folders) ? parsed.folders : [] }
  } catch { return null }
}

export function readMigratedIds(scopeKey, store = storage()) {
  if (!store) return new Set()
  try {
    const parsed = JSON.parse(store.getItem(`${DRAW_MIGRATION_KEY}:${scopeKey}`) ?? 'null')
    return new Set(Array.isArray(parsed?.ids) ? parsed.ids.filter((id) => typeof id === 'string') : [])
  } catch { return new Set() }
}

export function writeMigratedIds(scopeKey, ids, store = storage()) {
  if (!store) return false
  try { store.setItem(`${DRAW_MIGRATION_KEY}:${scopeKey}`, JSON.stringify({ version: 1, ids: [...ids] })); return true }
  catch { return false }
}

// /draw는 고도에 null이 없어 미지정도 0으로 남는다. 둘 다 0이면 입력하지 않은
// 것으로 보고 null과 0을 구분하는 내 지도 계약에 맞춘다.
function altitudeFrom(properties, warn) {
  const floorFt = Number.isFinite(properties?.floorFt) ? properties.floorFt : null
  const ceilingFt = Number.isFinite(properties?.ceilFt) ? properties.ceilFt : null
  if (!floorFt && !ceilingFt) return { floorFt: null, ceilingFt: null, datum: 'MSL' }
  if (floorFt != null && ceilingFt != null && floorFt >= ceilingFt) {
    warn('altitudeRange')
    return { floorFt, ceilingFt: null, datum: 'MSL' }
  }
  return { floorFt, ceilingFt, datum: 'MSL' }
}

function styleFrom(properties) {
  return {
    ...DEFAULT_MAP_STYLE,
    color: typeof properties?.color === 'string' ? properties.color : DEFAULT_MAP_STYLE.color,
    fillColor: typeof properties?.color === 'string' ? properties.color : DEFAULT_MAP_STYLE.fillColor,
    width: Number.isFinite(properties?.width) ? properties.width : DEFAULT_MAP_STYLE.width,
    opacity: Number.isFinite(properties?.opacity) ? properties.opacity : DEFAULT_MAP_STYLE.opacity,
    fillOpacity: Number.isFinite(properties?.fillOpacity) ? properties.fillOpacity : DEFAULT_MAP_STYLE.fillOpacity,
  }
}

function geometryFor(feature) {
  if (feature.geometry) return feature.geometry
  const gen = feature.properties?.gen
  if (!gen) return null
  if (gen.type === 'circle' && Array.isArray(gen.center) && gen.radiusNm > 0) {
    try { return circleGeometry({ center: gen.center, radiusNm: gen.radiusNm }) } catch { return null }
  }
  try { return rebuild(gen) } catch { return null }
}

// 서버 계약은 compound 항목의 기하를 Multi*/GeometryCollection만 받는다(backend/src/maps/schema.js).
// /draw의 고급 도형은 단일 Polygon/LineString/Point로 되살아나므로 한 조각짜리 Multi*로 감싼다.
// parts()가 렌더링에서 다시 펼치므로 화면에 보이는 모양은 같다.
const MULTI = { Point: 'MultiPoint', LineString: 'MultiLineString', Polygon: 'MultiPolygon' }
function compoundGeometry(geometry) {
  const multi = MULTI[geometry?.type]
  return multi ? { type: multi, coordinates: [geometry.coordinates] } : geometry
}

function kindFor(feature, geometry, warn) {
  const gen = feature.properties?.gen
  if (feature.properties?.textOnly) { warn('textOnly'); return 'compound' }
  if (gen?.type === 'circle' && geometry) return 'circle'
  if (gen && ADVANCED[gen.type]) { warn(`advanced:${gen.type}`); return 'compound' }
  if (geometry?.type === 'Point') return 'point'
  if (geometry?.type === 'LineString') return 'line'
  if (geometry?.type === 'Polygon') return 'polygon'
  return 'compound'
}

/**
 * /draw 상태 → 개인 MapDocument. 원본 properties·gen을 item.source에 그대로 보관한다.
 * skipIds에 든 도형은 이미 이전한 것으로 보고 건너뛴다.
 */
export function convertDrawSpike(state, { name = '이전한 그리기 자료', skipIds = new Set() } = {}) {
  const document = createMapDocument(name)
  const issues = new Map()
  const flag = (code, label) => {
    if (!issues.has(code)) issues.set(code, { code, count: 0, samples: [] })
    const issue = issues.get(code)
    issue.count += 1
    if (issue.samples.length < 3) issue.samples.push(label)
  }

  const pending = (state?.features ?? []).filter((feature) => feature?.id != null && !skipIds.has(String(feature.id)))
  const folderNames = [...new Set(pending.map((feature) => feature.properties?.folder ?? UNFILED))]
    .filter((folder) => folder && folder !== UNFILED)
    .sort((a, b) => a.localeCompare(b, 'ko'))
  const groupIdByName = new Map(folderNames.map((folder) => [folder, newMapId()]))
  document.groups = folderNames.map((folder, order) => ({ id: groupIdByName.get(folder), name: folder, parentId: null, order, sourceVisibility: null }))
  document.ungroupedOrder = document.groups.length

  const migratedIds = []
  let excluded = 0
  document.items = pending.map((feature, order) => {
    const properties = feature.properties ?? {}
    const label = properties.name || String(feature.id)
    const warn = (code) => flag(code, label)
    const geometry = geometryFor(feature)
    if (!geometry) { flag('unbuildable', label); excluded += 1; return null }
    const kind = kindFor(feature, geometry, warn)
    if (properties.icon) flag('icon', label)
    migratedIds.push(String(feature.id))
    return {
      id: newMapId(),
      groupId: groupIdByName.get(properties.folder) ?? null,
      order,
      kind,
      name: label,
      description: typeof properties.description === 'string' ? properties.description : '',
      geometry: kind === 'compound' ? compoundGeometry(geometry) : geometry,
      definition: kind === 'circle' ? { center: properties.gen.center, radiusNm: properties.gen.radiusNm } : null,
      style: styleFrom(properties),
      label: { ...DEFAULT_MAP_LABEL },
      altitude: altitudeFrom(properties, warn),
      source: {
        sourceAssetId: 'draw-spike', itemId: String(feature.id),
        folderPath: properties.folder && properties.folder !== UNFILED ? [properties.folder] : [],
        properties: { ...properties }, metadataEntries: [],
        descriptionRaw: typeof properties.description === 'string' ? properties.description : null,
        descriptionText: typeof properties.description === 'string' ? properties.description : '',
        summary: null, warnings: [],
      },
    }
  }).filter(Boolean).map((item, order) => ({ ...item, order }))

  return {
    document,
    migratedIds,
    counts: { total: pending.length, converted: document.items.length, excluded },
    issues: [...issues.values()],
    warnings: [...issues.values()].map((issue) => describe(issue)),
  }
}

function describe(issue) {
  if (issue.code === 'textOnly') return `글자 도형 ${issue.count}개는 원본 내용을 보존하지만 새 편집 도구로는 수정할 수 없습니다.`
  if (issue.code === 'unbuildable') return `${issue.count}개 도형은 형태를 다시 만들지 못해 이전하지 않았습니다. /draw의 원본은 그대로 남습니다.`
  if (issue.code === 'icon') return `${issue.count}개 점의 /draw 아이콘 선택은 원본 속성으로 보존하지만 내 지도에서는 기본 기호로 표시됩니다.`
  if (issue.code === 'altitudeRange') return `${issue.count}개 도형의 바닥 고도가 천장보다 높아 천장을 비웠습니다. 원본 값은 속성에 남습니다.`
  const kind = ADVANCED[issue.code.slice('advanced:'.length)] ?? '고급 도형'
  return `${kind} ${issue.count}개는 모양을 그대로 보존하지만 꼭짓점 편집은 할 수 없습니다.`
}
