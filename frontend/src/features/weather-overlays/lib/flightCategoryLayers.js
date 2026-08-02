import mapboxgl from 'mapbox-gl'
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import { toStationFeatures } from './flightCategoryStations.js'
import { formatPointLines, formatStationLines } from './flightCategoryPopup.js'
import { escapeHtml } from '../../../shared/ui/escapeHtml.js'

export const FC_VIS_SOURCE = 'flight-category-vis-source'
export const FC_CEIL_SOURCE = 'flight-category-ceil-source'
export const FC_STATION_SOURCE = 'flight-category-station-source'

export const FC_VIS_LAYER = 'flight-category-vis-fill'
export const FC_CEIL_FILL_LAYER = 'flight-category-ceil-fill'
export const FC_CEIL_LINE_LAYER = 'flight-category-ceil-line'
export const FC_STATION_LAYER = 'flight-category-station'

// addLayer(def, before)는 before 바로 앞에 끼운다. 넷을 같은 before로 넣으면
// 최종 순서는 넣은 순서가 된다 — 아래 배열 순서가 곧 z축 순서다.
export const FC_LAYER_IDS = [FC_VIS_LAYER, FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER, FC_STATION_LAYER]
export const FC_SOURCE_IDS = [FC_VIS_SOURCE, FC_CEIL_SOURCE, FC_STATION_SOURCE]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

// 지점 색은 면과 같은 색판을 쓴다 — 점과 주변 면의 색이 다르면 그 자체가 불일치 신호다.
// 이 값은 backend/src/processors/flight-category-processor.js와
// backend/src/processors/flight-category/ceiling-kim.js의 밴드 색과 같아야 한다.
// 프런트가 값을 따로 들고 있는 이유는 지점 속성이 'color'가 아니라 'fill'이기 때문 —
// 백엔드 색이 바뀌면 여기도 같이 바꿔야 점과 면이 어긋나지 않는다.
// 범례(MapView.jsx의 FLIGHT_CATEGORY_STATION_LEGEND_BANDS)도 이 값을 그대로 가져다 쓴다 —
// 다른 곳에 같은 색을 리터럴로 다시 적지 않는다.
export const STATION_COLORS = { severe: '#dc2626', caution: '#f97316', good: '#16a34a' }
const STATION_FILL = ['match', ['get', 'fill'],
  'severe', STATION_COLORS.severe, 'caution', STATION_COLORS.caution, 'good', STATION_COLORS.good,
  'rgba(0,0,0,0)']
// ['get']을 조건으로 쓸 때는 boolean으로 감싼다 — 속성이 없으면 표현식이 던진다.
const HAS_RING = ['boolean', ['get', 'ring'], false]

function ensure(map, beforeLayerId) {
  const before = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined
  for (const id of FC_SOURCE_IDS) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC })
  }
  const add = (def) => { if (!map.getLayer(def.id)) map.addLayer(def, before) }

  // 시정은 면을 채운다.
  add({ id: FC_VIS_LAYER, type: 'fill', source: FC_VIS_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 } })
  // 운고는 시정과 같은 빨강·주황을 쓴다. 겹쳐 켜면 구분이 안 되므로 색을 바꾸지 않고
  // 그리는 방식을 달리한다 — 안쪽은 아주 옅게, 경계는 굵게.
  add({ id: FC_CEIL_FILL_LAYER, type: 'fill', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } })
  add({ id: FC_CEIL_LINE_LAYER, type: 'line', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } })
  add({ id: FC_STATION_LAYER, type: 'circle', source: FC_STATION_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 6,
      'circle-color': STATION_FILL,
      'circle-stroke-width': ['case', HAS_RING, 3, 1.5],
      // 흰색: severe 밴드 채움이 이미 #dc2626이라 빨간 테두리는 severe 지점에서 안 보인다 —
      // 링 신호가 가장 필요한 곳(spec §3.4 "가장 값진 정보")에서 사라지면 안 되므로 흰색으로 뺀다.
      'circle-stroke-color': ['case', HAS_RING, '#ffffff', '#334155'],
    } })
}

/** 결측 밴드는 시정 도형 안에 들어 있다. 별도 층을 만들지 않고 걸러낸다. */
export function filterMissing(fc, showMissing = false) {
  if (showMissing) return fc
  return { ...fc, features: (fc?.features ?? []).filter((f) => f.properties?.band !== 'missing') }
}

export function syncFlightCategoryLayers(map, {
  visibility, ceiling, stations, showVisibility, showCeiling, showMissing, showStations, beforeLayerId,
}) {
  ensure(map, beforeLayerId)
  map.getSource(FC_VIS_SOURCE)?.setData(filterMissing(visibility || EMPTY_FC, showMissing))
  map.getSource(FC_CEIL_SOURCE)?.setData(ceiling || EMPTY_FC)
  map.getSource(FC_STATION_SOURCE)?.setData(toStationFeatures(stations))

  setMapLayerVisible(map, FC_VIS_LAYER, !!showVisibility)
  setMapLayerVisible(map, FC_CEIL_FILL_LAYER, !!showCeiling)
  setMapLayerVisible(map, FC_CEIL_LINE_LAYER, !!showCeiling)
  // 지점은 견줄 면이 있어야 뜻이 있다.
  setMapLayerVisible(map, FC_STATION_LAYER, !!showStations && (!!showVisibility || !!showCeiling))
}

export function removeFlightCategoryLayers(map) {
  try {
    for (const id of FC_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of FC_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id)
  } catch {}
}

function rowsHtml(lines) {
  return lines.map((l) => `
      <div style="display:flex;gap:8px;font-size:12px;line-height:1.7;${l.alert ? 'color:#dc2626;font-weight:700' : 'color:#1e293b'}">
        <span style="width:34px;color:#64748b;font-weight:600">${escapeHtml(l.label)}</span>
        <span>${escapeHtml(l.value)}</span>
        ${/* 강조된 줄에서는 주석도 줄 색을 따라간다 — 회색을 강제하면 값만 빨갛고
             관측소 이름·거리는 회색으로 남아 "그 줄을 눈에 띄게 한다"는 스펙 §4.2가
             반만 지켜진다. */ ''}
        ${l.note ? `<span${l.alert ? '' : ' style="color:#64748b"'}>${escapeHtml(l.note)}</span>` : ''}
      </div>`).join('')
}

/**
 * 관측지점 말풍선은 공항 마커 툴팁과 같은 모양을 쓴다(사용자 요청).
 * AirportTooltip.css의 클래스를 그대로 재사용한다 — 글꼴·크기·여백·구분선을
 * 여기서 다시 정의하면 한쪽만 바뀌었을 때 둘이 어긋난다.
 * 테두리 색은 그 지점의 점 색을 따른다(공항 툴팁이 비행범주 색을 쓰는 것과 같은 뜻).
 */
function stationPopupHtml(props) {
  // 주석(모델값·차이)은 값 옆에 붙이지 않고 아래 줄로 내린다 — 폭이 152px라
  // 옆에 붙이면 "약 800 ft 모델 / 구름 없음"처럼 엉뚱한 자리에서 줄바꿈된다.
  const row = (label, value, alert, small) => `
      <div class="airport-tooltip-row">
        <span class="airport-tooltip-label">${escapeHtml(label)}</span>
        <span class="airport-tooltip-value${small ? ' airport-tooltip-time' : ''}"${alert ? ' style="color:#dc2626"' : ''}>${escapeHtml(value)}</span>
      </div>`
  const rows = formatStationLines(props).filter((l) => l.label).map((l) =>
    row(l.label, l.value, l.alert, l.label === '관측')
    + (l.note ? row('', l.note, l.alert, true) : '')).join('')
  return `<div class="fc-station-popup">
      <div class="airport-tooltip-header"><span class="airport-tooltip-icao">${escapeHtml(props?.name ?? '')}</span></div>
      <div class="airport-tooltip-name">${escapeHtml(props?.source ?? '')}</div>
      <div class="airport-tooltip-divider"></div>
      <div class="airport-tooltip-rows">${rows}</div>
    </div>`
}

export function bindFlightCategoryClick(map, popupRef) {
  let cancelled = false
  let seq = 0 // 클릭마다 증가 — 늦게 도착한 응답이 최신 클릭의 팝업을 덮어쓰지 않게 한다.

  function renderPopup(lngLat, html, className) {
    popupRef.current?.remove()
    popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 8, maxWidth: '260px', className })
      .setLngLat(lngLat).setHTML(html)
      .addTo(map)
  }

  const areaHtml = (rows) => `<div style="font-family:'Noto Sans KR',sans-serif;padding:2px 0">${rows}</div>`

  async function handleAreaClick(e) {
    // 점이 면 위에 얹혀 있어 점을 눌러도 면 click이 같이 잡힌다. 점 층에 실제로 뭐가
    // 있으면 여기서 넘기고 점 핸들러가 그리게 한다 — 등록 순서에 기대지 않고 매번 확인한다.
    if (map.queryRenderedFeatures(e.point, { layers: [FC_STATION_LAYER] }).length) return

    const mySeq = ++seq
    const { lat, lng } = e.lngLat
    let point = null
    try {
      const res = await fetch(`/api/weather/flight-category-overlay/point?lat=${lat}&lon=${lng}`)
      if (res.ok) point = await res.json()
    } catch { /* 일시적 오류 — 아래에서 자료 없음으로 그린다 */ }
    // 언바인드됐거나(지도가 사라짐) 그 사이 다른 클릭이 들어왔으면(응답 역전) 그리지 않는다.
    if (cancelled || mySeq !== seq) return

    renderPopup(e.lngLat, areaHtml(rowsHtml(formatPointLines(point))))
  }

  function handleStationClick(e) {
    const feature = e.features?.[0]
    if (!feature) return
    // 진행 중인 면 클릭의 fetch가 이 클릭보다 늦게 돌아와도 지금 그리는 점 팝업을
    // 덮어쓰지 못하게 한다 — 네트워크가 없는 점 팝업 자체는 늦을 일이 없다.
    ++seq
    const fill = feature.properties?.fill
    renderPopup(e.lngLat, stationPopupHtml(feature.properties),
      `fc-station-popup-wrap fc-station-popup-wrap--${fill === 'severe' || fill === 'caution' ? fill : 'good'}`)
  }

  const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
  const onLeave = () => { map.getCanvas().style.cursor = '' }
  map.on('click', FC_VIS_LAYER, handleAreaClick)
  map.on('click', FC_STATION_LAYER, handleStationClick)
  map.on('mouseenter', FC_VIS_LAYER, onEnter)
  map.on('mouseleave', FC_VIS_LAYER, onLeave)
  map.on('mouseenter', FC_STATION_LAYER, onEnter)
  map.on('mouseleave', FC_STATION_LAYER, onLeave)
  return () => {
    cancelled = true
    map.off('click', FC_VIS_LAYER, handleAreaClick)
    map.off('click', FC_STATION_LAYER, handleStationClick)
    map.off('mouseenter', FC_VIS_LAYER, onEnter)
    map.off('mouseleave', FC_VIS_LAYER, onLeave)
    map.off('mouseenter', FC_STATION_LAYER, onEnter)
    map.off('mouseleave', FC_STATION_LAYER, onLeave)
    popupRef.current?.remove()
  }
}
