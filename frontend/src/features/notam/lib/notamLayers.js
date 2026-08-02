import { TIME_STATE, NOTAM_CATEGORIES } from './notamViewModel.js'
import { escapeHtml } from '../../../shared/ui/escapeHtml.js'

// NOTAM Mapbox 레이어: 색 = 시간상태 3색(카테고리 무관 균일), 형태 = 색맹 대비(채움/반채움/외곽선).
// advisoryLayers.js 패턴을 따름. 줌 분기(마커↔폴리곤)는 이 코드베이스 선례 없음 →
// ponytail: minzoom/maxzoom=9 가설로 두고 브라우저 스모크(Task 10)에서 실검증·조정.
// 색 hex: design-language.md §5 --level-red/amber/gray (flight-category/advisory와 동일 팔레트).
const LEVEL = { red: '#c0291f', amber: '#92400e', gray: '#475569' }
const TIME_COLOR = [
  'match', ['get', 'timeState'],
  'active', LEVEL.red,
  'soon', LEVEL.amber,
  /* upcoming */ LEVEL.gray,
]
const POLYGON_FILTER = ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']]
const NOT_FIR = ['!=', ['get', 'scope'], 'fir']
const IS_FIR = ['==', ['get', 'scope'], 'fir']

export const NOTAM_SOURCE_IDS = ['notam-src']
export const NOTAM_LAYER_IDS = ['notam-fill', 'notam-line', 'notam-fir-line', 'notam-marker', 'notam-obstacle', 'notam-label']
const IS_OBSTACLE = ['==', ['get', 'category'], 'obstacle']
const IS_POINT = ['==', ['geometry-type'], 'Point']
// 구역(폴리곤·닫힌 선) 중심 라벨 대상 — 점(장애물/시설) 제외
const IS_AREA = ['any', POLYGON_FILTER, ['==', ['geometry-type'], 'LineString']]

const CATEGORY_LABEL = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))
export function catLabel(id) {
  return CATEGORY_LABEL[id] || '기타'
}

export function addNotamLayers(map, featureData) {
  if (!map.getSource('notam-src')) {
    map.addSource('notam-src', { type: 'geojson', data: featureData })
  }
  // 구역 내부 옅은 면색(살짝). 줌 8+에서만(국가 뷰 덮지 않게), 색=시간상태.
  if (!map.getLayer('notam-fill')) {
    map.addLayer({
      id: 'notam-fill', type: 'fill', source: 'notam-src', slot: 'top', minzoom: 8,
      filter: POLYGON_FILTER,
      paint: { 'fill-color': TIME_COLOR, 'fill-opacity': 0.1 },
    })
  }
  if (!map.getLayer('notam-line')) {
    map.addLayer({
      id: 'notam-line', type: 'line', source: 'notam-src', slot: 'top',
      paint: { 'line-color': TIME_COLOR, 'line-width': 1.8, 'line-opacity': 0.95, 'line-dasharray': [3, 2] },
      filter: NOT_FIR,
    })
  }
  // FIR(전국) 공지는 fill 없이 점선 외곽선만, 모든 줌에서 — 화면을 덮지 않으면서 존재를 보여줌.
  // (내부 클릭은 point-in-polygon으로 판정 — notamsAtPoint. 투명 fill은 클릭이 잘 안 잡혀 안 씀.)
  if (!map.getLayer('notam-fir-line')) {
    map.addLayer({
      id: 'notam-fir-line', type: 'line', source: 'notam-src', slot: 'top',
      paint: { 'line-color': TIME_COLOR, 'line-width': 1.2, 'line-opacity': 0.55, 'line-dasharray': [3, 2] },
      filter: IS_FIR,
    })
  }
  // 장애물: 종류별 아이콘 + 위에 높이 라벨(EFB식). 색은 시간상태(아이콘·라벨 모두).
  if (!map.getLayer('notam-obstacle')) {
    map.addLayer({
      id: 'notam-obstacle', type: 'symbol', source: 'notam-src', slot: 'top',
      filter: ['all', IS_POINT, IS_OBSTACLE],
      layout: {
        'icon-image': ['concat', 'notam-obst-', ['get', 'obstacleType'], '-', ['get', 'timeState']],
        'icon-size': 0.95,
        'icon-allow-overlap': true,
        'icon-anchor': 'bottom',
        // 높이 라벨은 확대(줌 9+)에서만 — 낮은 줌에서 장애물 다수 겹칠 때 라벨 도배 방지
        'text-field': ['step', ['zoom'], '', 9, ['get', 'heightLabel']],
        'text-size': 11,
        'text-offset': [0, 0.4],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': TIME_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    })
  }
  if (!map.getLayer('notam-marker')) {
    // 형태 단서(색맹 대비): 발효중=채운 원 / 곧발효=반채움(진한 테두리+옅은 채움) / 예정=외곽선만.
    // 시설 등 점(장애물 제외 — 장애물은 위 심볼 레이어). 모든 줌 표시.
    map.addLayer({
      id: 'notam-marker', type: 'circle', source: 'notam-src', slot: 'top',
      filter: ['all', IS_POINT, ['!', IS_OBSTACLE]],
      paint: {
        'circle-color': ['match', ['get', 'timeState'], 'upcoming', 'rgba(0,0,0,0)', TIME_COLOR],
        'circle-opacity': ['match', ['get', 'timeState'], 'soon', 0.4, 'active', 0.85, 0],
        'circle-stroke-color': TIME_COLOR,
        'circle-stroke-width': 2,
        'circle-radius': 6,
      },
    })
  }
  // 구역 중심 라벨: 카테고리명 + 차트식 고도밴드(상한/수평선/하한). 일련번호·원문은 클릭 팝업.
  // 줌 확대(7+)에서만·겹치면 자동 생략(디클러터).
  if (!map.getLayer('notam-label')) {
    map.addLayer({
      id: 'notam-label', type: 'symbol', source: 'notam-src', slot: 'top', minzoom: 7,
      filter: IS_AREA,
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'mapLabel'],
        'text-size': 11,
        'text-line-height': 0.8, // 밴드(상한/수평선/하한)를 분수처럼 바짝 붙임(제목-밴드 간격은 빈 줄로 확보)
        'text-anchor': 'center',
        'text-justify': 'center',
        'text-allow-overlap': false,
        'text-optional': true,
        'text-padding': 6,
      },
      paint: { 'text-color': TIME_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    })
  }
  for (const id of ['notam-marker', 'notam-obstacle', 'notam-label']) if (map.getLayer(id) && typeof map.moveLayer === 'function') map.moveLayer(id)
}

export function updateNotamLayerData(map, featureData) {
  addNotamLayers(map, featureData)
  map.getSource('notam-src')?.setData(featureData)
}

export function setNotamVisibility(map, isVisible) {
  const v = isVisible ? 'visible' : 'none'
  for (const id of NOTAM_LAYER_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
}

// 카테고리 + 위치 + (선택)id 필터를 지도 레이어에 적용. locationFilter가 'all'이 아니면 해당 공항/공역만.
// idFilter가 배열이면 해당 NOTAM id만(브리핑 "경로에 걸린 NOTAM만" 모드). null이면 전체.
export function setNotamCategoryFilter(map, activeCategoryIds, locationFilter = 'all', idFilter = null) {
  const catFilter = ['in', ['get', 'category'], ['literal', activeCategoryIds]]
  const locFilter = (locationFilter && locationFilter !== 'all') ? ['==', ['get', 'location'], locationFilter] : true
  const idExpr = Array.isArray(idFilter) ? ['in', ['get', 'id'], ['literal', idFilter]] : true
  const F = (...conds) => ['all', catFilter, locFilter, idExpr, ...conds]
  if (map.getLayer('notam-fill')) map.setFilter('notam-fill', F(POLYGON_FILTER))
  if (map.getLayer('notam-line')) map.setFilter('notam-line', F(NOT_FIR))
  if (map.getLayer('notam-fir-line')) map.setFilter('notam-fir-line', F(IS_FIR))
  if (map.getLayer('notam-obstacle')) map.setFilter('notam-obstacle', F(IS_POINT, IS_OBSTACLE))
  if (map.getLayer('notam-marker')) map.setFilter('notam-marker', F(IS_POINT, ['!', IS_OBSTACLE]))
  if (map.getLayer('notam-label')) map.setFilter('notam-label', F(IS_AREA))
}

// 겹침 팝업 HTML(목업 surface D): 1건 상세 / 2~3건 미니리스트 / 4건+ 상위3 + "전체 목록에서 보기".
// 클릭 지점이 폴리곤 내부인지 직접 판정(ray casting) — 렌더/줌/투명도와 무관하게 클릭 인식.
function ringContains(ring, lng, lat) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    const hit = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    if (hit) inside = !inside
  }
  return inside
}
function isClosedRing(coords) {
  if (!Array.isArray(coords) || coords.length < 4) return false
  const a = coords[0], b = coords[coords.length - 1]
  return a[0] === b[0] && a[1] === b[1]
}
function geometryContains(geometry, lng, lat) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') return ringContains(geometry.coordinates[0] || [], lng, lat)
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).some((poly) => ringContains(poly[0] || [], lng, lat))
  // 닫힌 LineString(첫점==끝점)은 KOCA가 면(제한/위험구역)을 선으로 인코딩한 것 — 내부 판정.
  if (geometry.type === 'LineString' && isClosedRing(geometry.coordinates)) return ringContains(geometry.coordinates, lng, lat)
  return false
}

// 클릭 좌표를 포함하는 폴리곤 NOTAM들(카테고리 필터 반영). 점/선은 queryRenderedFeatures가 담당.
export function notamsAtPoint(features, lng, lat, activeCategoryIds) {
  return (features || []).filter((f) =>
    activeCategoryIds.includes(f.properties?.category) && geometryContains(f.geometry, lng, lat))
}

// 지오메트리 경계 [[minLon,minLat],[maxLon,maxLat]] — 목록→지도 줌인(fitBounds)용.
export function geometryBounds(geometry) {
  if (!geometry) return null
  const pts = []
  if (geometry.type === 'Point') pts.push(geometry.coordinates)
  else if (geometry.type === 'LineString') pts.push(...geometry.coordinates)
  else if (geometry.type === 'Polygon') pts.push(...(geometry.coordinates[0] || []))
  else if (geometry.type === 'MultiPolygon') for (const poly of geometry.coordinates) pts.push(...(poly[0] || []))
  const valid = pts.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (valid.length === 0) return null
  const lons = valid.map((p) => p[0]); const lats = valid.map((p) => p[1])
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}

export const NOTAM_HIGHLIGHT_LAYER_IDS = ['notam-hl-fill', 'notam-hl-line', 'notam-hl-point']
const HL_COLOR = '#0ea5e9' // 시간상태색(red/amber/gray)과 구분되는 '선택' 강조색
const EMPTY_FC = { type: 'FeatureCollection', features: [] }

export function addNotamHighlight(map) {
  if (!map.getSource('notam-hl-src')) map.addSource('notam-hl-src', { type: 'geojson', data: EMPTY_FC })
  if (!map.getLayer('notam-hl-fill')) {
    map.addLayer({ id: 'notam-hl-fill', type: 'fill', source: 'notam-hl-src', slot: 'top',
      paint: { 'fill-color': HL_COLOR, 'fill-opacity': 0.18 }, filter: POLYGON_FILTER })
  }
  if (!map.getLayer('notam-hl-line')) {
    map.addLayer({ id: 'notam-hl-line', type: 'line', source: 'notam-hl-src', slot: 'top',
      paint: { 'line-color': HL_COLOR, 'line-width': 3.5, 'line-opacity': 1 } })
  }
  if (!map.getLayer('notam-hl-point')) {
    map.addLayer({ id: 'notam-hl-point', type: 'circle', source: 'notam-hl-src', slot: 'top',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 12, 'circle-color': HL_COLOR, 'circle-opacity': 0.25, 'circle-stroke-color': HL_COLOR, 'circle-stroke-width': 3 } })
  }
  for (const id of NOTAM_HIGHLIGHT_LAYER_IDS) if (map.getLayer(id) && typeof map.moveLayer === 'function') map.moveLayer(id)
}

export function setNotamHighlight(map, feature) {
  const src = map.getSource('notam-hl-src')
  if (src) src.setData(feature ? { type: 'FeatureCollection', features: [feature] } : EMPTY_FC)
}

// 팝업 카테고리 아이콘(표·공항탭과 동일 lucide 아이콘의 인라인 SVG — HTML 팝업이라 React 못 씀).
// 아이콘 매핑은 NotamPanel/NotamTab CAT_ICON과 동일: 금지=Ban, 사격=Crosshair, 위험=TriangleAlert 등.
const CAT_SVG = {
  prohibited: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  firing: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  danger: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  restricted: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 22V2"/>',
  obstacle: '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
  facility: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
  other: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
}
function catIconSvg(category) {
  return `<svg class="notam-pop-cat-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_SVG[category] || CAT_SVG.other}</svg>`
}

export function notamPopupHtml(features) {
  const shown = features.slice(0, features.length <= 3 ? features.length : 3)
  const rows = shown.map((f) => {
    const p = f.properties
    const ts = TIME_STATE[p.timeState] || TIME_STATE.upcoming
    const alt = p.altitude ? ` · ${p.altitude}` : ''
    const raw = p.rawText
      ? `<details class="notam-pop-rawwrap"><summary>원문 보기</summary><pre class="notam-pop-raw">${escapeHtml(p.rawText)}</pre></details>`
      : ''
    return `<div class="notam-pop-row">`
      + `<span class="notam-pop-cat">${catIconSvg(p.category)}${catLabel(p.category)}</span>`
      + `<span class="notam-pop-id">${p.id}</span>`
      + `<span class="notam-pop-ts ts-${ts.key}">${ts.glyph} ${ts.label}</span>`
      + `<div class="notam-pop-sum">${escapeHtml(p.summary)}${alt}</div>`
      + (p.validPeriod ? `<div class="notam-pop-valid"><span class="notam-pop-valid-lbl">유효</span>${escapeHtml(p.validPeriod)}</div>` : '')
      + `${raw}</div>`
  }).join('')
  const header = features.length === 1 ? '' : `<div class="notam-pop-head">이 지점에 ${features.length}건</div>`
  const more = features.length > 3
    ? `<button type="button" class="notam-pop-more" data-loc="${features[0].properties.location || ''}">전체 목록에서 보기 →</button>`
    : ''
  return `<div class="notam-pop">${header}${rows}${more}</div>`
}

export default {
  NOTAM_SOURCE_IDS, NOTAM_LAYER_IDS, NOTAM_HIGHLIGHT_LAYER_IDS, catLabel,
  addNotamLayers, updateNotamLayerData, setNotamVisibility, setNotamCategoryFilter, notamPopupHtml,
  geometryBounds, addNotamHighlight, setNotamHighlight, notamsAtPoint,
}
