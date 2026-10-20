// 지도형 브리핑 ↔ 지도: 경로 위 위험 색 띠, 막대를 가리키거나 누른 구간 강조, 시작·끝 이름표.
// 좌표는 이미 지도에 올라간 경로 preview geojson을 거리(NM)로 잘라 만든다 — 새 자료를 받지 않는다.
import { rangeCoordinates } from '../lib/legHighlight.js'
import { ROUTE_PREVIEW_LINE } from '../lib/routePreview.js'
import { hazardLineColor } from './mapBriefingModel.js'

export const MB_BAND_SOURCE = 'map-briefing-hazard-bands'
export const MB_BAND_LINE = 'map-briefing-hazard-band-line'
export const MB_FOCUS_SOURCE = 'map-briefing-focus'
export const MB_FOCUS_LINE = 'map-briefing-focus-line'
export const MB_FOCUS_LABEL = 'map-briefing-focus-label'

const EMPTY = { type: 'FeatureCollection', features: [] }
const EARTH_RADIUS_NM = 3440.065

function routeLine(previewGeojson) {
  const coordinates = (previewGeojson?.features ?? []).find((feature) => feature.properties?.role === 'route-preview-line')?.geometry?.coordinates
  return Array.isArray(coordinates) && coordinates.length > 1 ? coordinates : null
}

function lineLengthNm(coordinates) {
  const rad = Math.PI / 180
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const [a, b] = [coordinates[index - 1], coordinates[index]]
    const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2
    total += 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
  }
  return total
}

// 막대 거리(NM, SID·STAR 포함 총 거리 기준) → 지도 경로선 위 좌표. 지도 선 길이가 브리핑 총 거리와
// 조금 다르면(절차 병합·반올림) 비율로 맞춰 끝 지점이 공항에 닿게 한다.
export function ribbonRangeCoordinates(previewGeojson, totalNm, startNm, endNm) {
  const line = routeLine(previewGeojson)
  if (!line) return []
  const length = lineLengthNm(line)
  const scale = totalNm > 0 && length > 0 ? length / totalNm : 1
  return rangeCoordinates(previewGeojson, startNm * scale, endNm * scale)
}

// 경로 위 위험 색 띠: 내 고도 모델 구간(난류·착빙·대류) + 태풍 틀. 숨긴 줄은 뺀다.
// SEV가 MOD 위에 오도록 순서를 맞춘다(같은 곳에 둘 다 있으면 센 쪽이 보인다).
export function hazardBandCollection(ribbon, previewGeojson, { hiddenRows = [] } = {}) {
  const total = ribbon?.totalDistanceNm
  if (!ribbon?.rows?.length || !(total > 0)) return EMPTY
  const features = []
  for (const row of ribbon.rows) {
    if (hiddenRows.includes(row.key)) continue
    const items = [
      ...row.model.map((segment) => ({ segment, level: segment.level })),
      ...(row.key === 'typhoon' ? row.frames.map((frame) => ({ segment: frame, level: 'TC' })) : []),
    ]
    for (const { segment, level } of items) {
      const color = hazardLineColor(row.key, level)
      const coordinates = color ? ribbonRangeCoordinates(previewGeojson, total, segment.startNm, segment.endNm) : []
      if (coordinates.length < 2) continue
      features.push({
        type: 'Feature',
        properties: { row: row.key, level, color, rank: level === 'MOD' ? 1 : 2 },
        geometry: { type: 'LineString', coordinates },
      })
    }
  }
  features.sort((a, b) => a.properties.rank - b.properties.rank)
  return { type: 'FeatureCollection', features }
}

// 가리킨(미리보기)·누른(고정) 구간 → 강조선 + (누른 경우) 시작·끝 이름표.
export function focusCollection(ribbon, previewGeojson, focus) {
  const total = ribbon?.totalDistanceNm
  const item = focus?.item
  if (!item || !(total > 0)) return EMPTY
  const coordinates = ribbonRangeCoordinates(previewGeojson, total, item.startNm, item.endNm)
  if (coordinates.length < 2) return EMPTY
  const pinned = Boolean(focus.pinned)
  const features = [{ type: 'Feature', properties: { kind: 'line', pinned }, geometry: { type: 'LineString', coordinates } }]
  if (pinned) {
    features.push(
      { type: 'Feature', properties: { kind: 'label', text: `시작 ${item.from ?? `${item.startNm}NM`}` }, geometry: { type: 'Point', coordinates: coordinates[0] } },
      { type: 'Feature', properties: { kind: 'label', text: `끝 ${item.to ?? `${item.endNm}NM`}` }, geometry: { type: 'Point', coordinates: coordinates.at(-1) } },
    )
  }
  return { type: 'FeatureCollection', features }
}

function addLayers(map) {
  if (!map.getSource(MB_BAND_SOURCE)) map.addSource(MB_BAND_SOURCE, { type: 'geojson', data: EMPTY })
  if (!map.getSource(MB_FOCUS_SOURCE)) map.addSource(MB_FOCUS_SOURCE, { type: 'geojson', data: EMPTY })
  // 색 띠는 경로선 아래(경로선이 띠 가운데를 지나가게) — 시안처럼 넓고 반투명.
  const beforeRoute = map.getLayer(ROUTE_PREVIEW_LINE) ? ROUTE_PREVIEW_LINE : undefined
  if (!map.getLayer(MB_BAND_LINE)) {
    map.addLayer({
      id: MB_BAND_LINE, type: 'line', source: MB_BAND_SOURCE, slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
      paint: { 'line-color': ['get', 'color'], 'line-width': 11, 'line-opacity': 0.6 },
    }, beforeRoute)
  }
  // 강조선은 NAVLOG 구간 강조(legHighlight)와 같은 표현: 누른 것은 진하게, 가리킨 것은 옅게.
  if (!map.getLayer(MB_FOCUS_LINE)) {
    map.addLayer({
      id: MB_FOCUS_LINE, type: 'line', source: MB_FOCUS_SOURCE, slot: 'top',
      filter: ['==', ['get', 'kind'], 'line'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1d4ed8', 'line-width': 8, 'line-opacity': ['case', ['==', ['get', 'pinned'], true], 0.85, 0.45] },
    })
  }
  if (!map.getLayer(MB_FOCUS_LABEL)) {
    map.addLayer({
      id: MB_FOCUS_LABEL, type: 'symbol', source: MB_FOCUS_SOURCE, slot: 'top',
      filter: ['==', ['get', 'kind'], 'label'],
      layout: {
        'text-field': ['get', 'text'], 'text-font': ['Noto Sans CJK JP Bold'], 'text-size': 13,
        'text-anchor': 'left', 'text-offset': [1, 0], 'text-allow-overlap': true, 'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#1d4ed8', 'text-halo-width': 3 },
    })
  }
}

export function syncBriefingMapLayers(map, { bands = EMPTY, focus = EMPTY } = {}) {
  addLayers(map)
  map.getSource(MB_BAND_SOURCE)?.setData(bands)
  map.getSource(MB_FOCUS_SOURCE)?.setData(focus)
}

export function clearBriefingMapLayers(map) {
  for (const id of [MB_FOCUS_LABEL, MB_FOCUS_LINE, MB_BAND_LINE]) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of [MB_FOCUS_SOURCE, MB_BAND_SOURCE]) if (map.getSource(id)) map.removeSource(id)
}

// 좌표 묶음의 경계 [[서,남],[동,북]] — "지도·슬라이더를 이 구간으로"에서 지도를 맞출 때.
export function coordinatesBounds(coordinates) {
  if (!coordinates?.length) return null
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of coordinates) {
    west = Math.min(west, lon); east = Math.max(east, lon)
    south = Math.min(south, lat); north = Math.max(north, lat)
  }
  return [[west, south], [east, north]]
}
