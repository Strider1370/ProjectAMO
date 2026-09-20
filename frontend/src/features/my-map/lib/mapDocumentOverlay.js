import { labelHaloFor } from './kmlPaint.js'
import { geometryCoordinates, scopeId, DEFAULT_MAP_STYLE } from './mapDocument.js'

export const MY_MAP_SOURCE = 'my-map-src'
export const MY_MAP_LABEL_SOURCE = 'my-map-item-labels'
export const MY_MAP_LAYER_IDS = ['my-map-fill', 'my-map-line', 'my-map-line-dashed', 'my-map-line-dotted', 'my-map-circle', 'my-map-icon', 'my-map-label', 'my-map-label-always', 'my-map-selected-fill', 'my-map-selected-line', 'my-map-selected-point']

// line-dasharray는 자료로 지정할 수 없어 선 모양마다 레이어를 나눈다.
// 값은 선 굵기의 배수라 굵기를 바꿔도 모양 비율이 유지된다.
const DASH_PATTERN = { dashed: [2, 1.5], dotted: [0, 2] }
// 아이콘은 글리프로 그린다. 이미지와 달리 배경지도를 바꿔도 다시 등록할 필요가 없고
// 항목마다 색을 따로 줄 수 있다. 'dot'은 기존 circle 레이어가 그대로 그린다.
const ICON_GLYPH = { pin: '\u2691', triangle: '\u25B2', square: '\u25A0', star: '\u2605', cross: '\u271A' }
const cache = new WeakMap()
const synced = new WeakMap()

function parts(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap(parts)
  const base = { MultiPoint: 'Point', MultiLineString: 'LineString', MultiPolygon: 'Polygon' }[geometry.type]
  return base ? geometry.coordinates.map((coordinates) => ({ type: base, coordinates })) : [geometry]
}

export function itemBounds(item) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of geometryCoordinates(item.geometry)) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null
}

function documentFeatures(document) {
  if (cache.has(document)) return cache.get(document)
  const shapes = [], labels = []
  for (const item of document.items) {
    const style = { ...DEFAULT_MAP_STYLE, ...item.style }
    const source = item.source?.properties ?? {}
    const imported = document.kind === 'imported'
    const color = imported ? source.stroke ?? source['icon-color'] ?? style.color : style.color
    const props = {
      __file: document.id, __folder: scopeId(document.id, item.groupId), __item: scopeId(document.id, item.id), itemId: item.id,
      name: item.name, color, fill: imported ? source.fill ?? style.fillColor : style.fillColor,
      width: imported ? source['stroke-width'] ?? style.width : style.width,
      opacity: imported ? source['stroke-opacity'] ?? style.opacity : style.opacity,
      fillOpacity: imported ? source['fill-opacity'] ?? style.fillOpacity : style.fillOpacity,
      pointSize: style.pointSize, dash: style.dash ?? 'solid',
      icon: style.icon ?? 'dot', iconGlyph: ICON_GLYPH[style.icon] ?? '',
      labelVisible: item.label?.visible !== false && (!imported || source['label-opacity'] !== 0 && source['label-scale'] !== 0),
      labelSize: item.label?.size ?? 12, labelAlways: item.label?.always === true,
      labelColor: imported ? source['label-color'] ?? '#242424' : '#242424',
      __labelHalo: labelHaloFor(imported ? source['label-color'] : '#242424'),
    }
    parts(item.geometry).forEach((geometry, i) => shapes.push({ type: 'Feature', id: `${document.id}:${item.id}:${i}`, properties: props, geometry }))
    const bounds = itemBounds(item)
    if (bounds && item.name) {
      const anchor = item.geometry.type === 'Point' ? item.geometry.coordinates : item.definition?.center ?? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
      labels.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: anchor } })
    }
  }
  const result = { shapes, labels }
  cache.set(document, result)
  return result
}

export function buildDocumentOverlay(documents) {
  const parsed = documents.filter((doc) => doc.loaded !== false).map(documentFeatures)
  return { shapes: { type: 'FeatureCollection', features: parsed.flatMap((p) => p.shapes) }, labels: { type: 'FeatureCollection', features: parsed.flatMap((p) => p.labels) } }
}

export function effectiveHiddenGroups(documents, hidden) {
  const output = []
  for (const document of documents) {
    const byId = new Map(document.groups.map((g) => [g.id, g])), memo = new Map()
    const isHidden = (id, seen = new Set()) => {
      if (id == null || seen.has(id)) return false
      if (memo.has(id)) return memo.get(id)
      seen.add(id)
      const result = hidden.has(scopeId(document.id, id)) || isHidden(byId.get(id)?.parentId, seen)
      memo.set(id, result)
      return result
    }
    for (const group of document.groups) if (isHidden(group.id)) output.push(scopeId(document.id, group.id))
  }
  return output
}

const get = (name, fallback) => ['coalesce', ['get', name], fallback]
const kind = (type) => ['==', ['geometry-type'], type]

export function syncDocumentOverlay(map, { data, visibleIds, hiddenGroups, hiddenItems, selectedKey = null }) {
  if (!map) return
  const prev = synced.get(map)
  for (const [id, key] of [[MY_MAP_SOURCE, 'shapes'], [MY_MAP_LABEL_SOURCE, 'labels']]) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: data[key] })
    else if (prev?.data !== data) map.getSource(id).setData(data[key])
  }
  const visible = ['all', ['in', ['get', '__file'], ['literal', [...visibleIds]]], ['!', ['in', ['get', '__folder'], ['literal', hiddenGroups]]], ['!', ['in', ['get', '__item'], ['literal', [...hiddenItems]]]]]
  const picked = ['all', visible, ['==', ['get', '__item'], selectedKey ?? '']]
  const stroked = ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]]
  const dashIs = (value) => ['==', get('dash', 'solid'), value]
  const isSelected = ['==', ['get', '__item'], selectedKey ?? '']
  // 이름표는 겹침 정리를 하는 기본 레이어와, 자리를 양보하지 않는 '항상 표시' 레이어로 나눈다.
  // 한 항목이 두 레이어에 겹쳐 그려지지 않도록 기본 쪽에서 제외한다.
  const labelOn = ['==', ['get', 'labelVisible'], true]
  const labelAlways = ['any', isSelected, ['all', labelOn, ['==', ['get', 'labelAlways'], true]]]
  const lineLayer = (id, dash) => ({
    id, type: 'line', filter: ['all', visible, stroked, dashIs(dash)],
    layout: { 'line-join': 'round', ...(dash === 'solid' ? {} : { 'line-cap': dash === 'dotted' ? 'round' : 'butt' }) },
    paint: { 'line-color': get('color', '#475569'), 'line-width': get('width', 2), 'line-opacity': get('opacity', 1), ...(dash === 'solid' ? {} : { 'line-dasharray': DASH_PATTERN[dash] }) },
  })
  // allow-overlap은 이 이름표가 무슨 일이 있어도 그려지게 하고, ignore-placement를 끄면
  // 자리를 계속 차지해 다른 이름표가 이 자리를 피해 간다. 둘 다 켜면 글자가 뭉친다.
  // Mapbox는 겹침 판정을 위에 있는 레이어부터 하므로 '항상 표시'가 일반 이름표보다
  // 나중에(=위에) 놓여야 자리를 먼저 잡는다.
  const labelLayer = (id, filter, always) => ({
    id, type: 'symbol', source: MY_MAP_LABEL_SOURCE, filter: ['all', visible, filter],
    layout: { 'text-field': ['get', 'name'], 'text-size': get('labelSize', 12), 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': always, 'text-ignore-placement': false },
    paint: { 'text-color': get('labelColor', '#242424'), 'text-halo-color': get('__labelHalo', '#ffffff'), 'text-halo-width': 1.3 },
  })
  const layers = [
    { id: 'my-map-fill', type: 'fill', filter: ['all', visible, kind('Polygon')], paint: { 'fill-color': get('fill', '#475569'), 'fill-opacity': get('fillOpacity', 0.1) } },
    lineLayer('my-map-line', 'solid'),
    lineLayer('my-map-line-dashed', 'dashed'),
    lineLayer('my-map-line-dotted', 'dotted'),
    { id: 'my-map-circle', type: 'circle', filter: ['all', visible, kind('Point'), ['==', get('icon', 'dot'), 'dot']], paint: { 'circle-color': get('color', '#475569'), 'circle-radius': get('pointSize', 5), 'circle-opacity': get('opacity', 1), 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1, 'circle-stroke-opacity': get('opacity', 1) } },
    { id: 'my-map-icon', type: 'symbol', filter: ['all', visible, kind('Point'), ['!=', get('icon', 'dot'), 'dot']], layout: { 'text-field': get('iconGlyph', ''), 'text-size': ['*', get('pointSize', 5), 2.4], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': get('color', '#475569'), 'text-opacity': get('opacity', 1), 'text-halo-color': '#ffffff', 'text-halo-width': 1 } },
    labelLayer('my-map-label', ['all', labelOn, ['!', labelAlways]], false),
    labelLayer('my-map-label-always', labelAlways, true),
    { id: 'my-map-selected-fill', type: 'fill', filter: ['all', picked, kind('Polygon')], paint: { 'fill-color': '#334155', 'fill-opacity': 0.1 } },
    { id: 'my-map-selected-line', type: 'line', filter: ['all', picked, ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]]], paint: { 'line-color': '#334155', 'line-width': ['+', get('width', 2), 2] } },
    { id: 'my-map-selected-point', type: 'circle', filter: ['all', picked, kind('Point')], paint: { 'circle-radius': ['+', get('pointSize', 5), 4], 'circle-color': '#334155', 'circle-opacity': 0.15, 'circle-stroke-color': '#334155', 'circle-stroke-width': 2 } },
  ]
  for (const layer of layers) {
    if (map.getLayer(layer.id)) map.setFilter(layer.id, layer.filter)
    else map.addLayer({ source: MY_MAP_SOURCE, slot: 'middle', ...layer })
  }
  restackDocumentOverlay(map)
  synced.set(map, { data })
}

export function restackDocumentOverlay(map) {
  if (map.getLayer('terrain-hazard-shade') && map.getLayer('my-map-fill')) {
    const order = map.getStyle()?.layers?.map((layer) => layer.id) ?? []
    if (order.indexOf('terrain-hazard-shade') > order.indexOf('my-map-fill')) map.moveLayer('terrain-hazard-shade', 'my-map-fill')
  }
}

export function removeDocumentOverlay(map) {
  for (const id of [...MY_MAP_LAYER_IDS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of [MY_MAP_SOURCE, MY_MAP_LABEL_SOURCE]) if (map.getSource(id)) map.removeSource(id)
  synced.delete(map)
}
