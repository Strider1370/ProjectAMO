// 지도형 브리핑 ↔ 지도: 경로 위 위험 색 띠, 막대를 가리키거나 누른 구간 강조, 시작·끝 이름표.
// 좌표는 이미 받은 연직단면도 경로 축(route.samples)을 거리(NM)로 잘라 만든다 — 새 자료를 받지 않는다.
import { rangeCoordinates } from '../lib/legHighlight.js'
import { ROUTE_PREVIEW_LINE } from '../lib/routePreview.js'
import { hazardLineColor } from './mapBriefingModel.js'

export const MB_BAND_SOURCE = 'map-briefing-hazard-bands'
export const MB_BAND_LINE = 'map-briefing-hazard-band-line'
export const MB_FOCUS_SOURCE = 'map-briefing-focus'
export const MB_FOCUS_LINE = 'map-briefing-focus-line'
export const MB_FOCUS_LABEL = 'map-briefing-focus-label'

const EMPTY = { type: 'FeatureCollection', features: [] }
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// 막대 거리(NM) → 지도 좌표. 위험 막대·연직단면도와 같은 경로 축(단면 샘플: SID·STAR 포함, 지점마다 거리·위경도)을
// 따라 자른다. 지도 경로 preview 선은 절차가 빠진 공항↔첫·끝 지점 직선이라 거리가 맞지 않는다(2026-10-21 사용자 발견).
// 단면 샘플이 없을 때만 preview 선을 거리로 자른다.
export function ribbonRangeCoordinates(route, startNm, endNm) {
  if (!Number.isFinite(startNm) || !Number.isFinite(endNm) || endNm <= startNm) return []
  const samples = (route?.samples ?? []).filter((sample) => Number.isFinite(sample?.distanceNm) && Number.isFinite(sample?.lon) && Number.isFinite(sample?.lat))
  if (samples.length < 2) return rangeCoordinates(route?.previewGeojson, startNm, endNm)
  const out = []
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1], b = samples[index]
    const span = b.distanceNm - a.distanceNm
    if (!(span > 0) || b.distanceNm < startNm || a.distanceNm > endNm) continue
    const pa = [a.lon, a.lat], pb = [b.lon, b.lat]
    if (!out.length) out.push(lerp(pa, pb, Math.max(0, (startNm - a.distanceNm) / span)))
    if (b.distanceNm <= endNm) out.push(pb)
    else { out.push(lerp(pa, pb, (endNm - a.distanceNm) / span)); break }
  }
  return out.length > 1 ? out : []
}

// 경로 위 위험 색 띠: 내 고도 모델 구간(난류·착빙·대류) + 태풍 틀. 숨긴 줄은 뺀다.
// SEV가 MOD 위에 오도록 순서를 맞춘다(같은 곳에 둘 다 있으면 센 쪽이 보인다).
export function hazardBandCollection(ribbon, route, { hiddenRows = [] } = {}) {
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
      const coordinates = color ? ribbonRangeCoordinates(route, segment.startNm, segment.endNm) : []
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
export function focusCollection(ribbon, route, focus) {
  const total = ribbon?.totalDistanceNm
  const item = focus?.item
  if (!item || !(total > 0)) return EMPTY
  const coordinates = ribbonRangeCoordinates(route, item.startNm, item.endNm)
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

// 좌표 묶음의 경계 [[서,남],[동,북]] — "지도·고도·시간 맞추기"에서 지도를 맞출 때.
export function coordinatesBounds(coordinates) {
  if (!coordinates?.length) return null
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of coordinates) {
    west = Math.min(west, lon); east = Math.max(east, lon)
    south = Math.min(south, lat); north = Math.max(north, lat)
  }
  return [[west, south], [east, north]]
}
