// 태풍 지도 레이어. 확률 영역은 백엔드 도형을 그대로 쓰고,
// 강풍/폭풍은 화면에서만 방향별 예외를 생략한 지리적 원으로 단순 표시한다.
// 과거(채운 점), 현재(이중 원+이름), 예상(빈 원+강도)을 같은 지리 앵커에 그린다.
import circle from '@turf/circle'
import { assignTyphoonColors } from './typhoonColors.js'
import { intensityOf } from './typhoonListModel.js'
import { color as themeColor } from '../../../shared/theme/tokens.js'

// JSON 왕복 후에는 참조 비교가 무의미하다. 값으로 현재 행을 가린다.
function isSameRow(a, b) {
  return Boolean(a && b) && a.validAt === b.validAt && a.seq === b.seq && Boolean(a.forecast) === Boolean(b.forecast)
}

export const TYPHOON_SOURCE_IDS = [
  'typhoon-cone', 'typhoon-gale', 'typhoon-storm', 'typhoon-track', 'typhoon-forecast-track', 'typhoon-points',
]

export const TYPHOON_LAYER_IDS = [
  'typhoon-cone-fill',
  'typhoon-cone-outline',
  'typhoon-gale-fill',
  'typhoon-gale-outline',
  'typhoon-storm-fill',
  'typhoon-storm-outline',
  'typhoon-track-line',
  'typhoon-forecast-track-line',
  'typhoon-current-ring',
  'typhoon-points-circle',
  'typhoon-points-strength',
  'typhoon-point-labels',
]

const empty = () => ({ type: 'FeatureCollection', features: [] })

// selected = { number, validAt } 이면 그 태풍의 강풍/폭풍 영역을 그 시점 것으로 바꾼다.
// 나머지 태풍은 현재 시점 그대로 둔다.
function ringsFor(typhoon, selected) {
  const row = (selected?.number === typhoon.number
    ? (typhoon.rows ?? []).find((r) => r.validAt === selected.validAt)
    : null) ?? typhoon.current
  const windCircle = (ring) => {
    if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lon)
      || !Number.isFinite(ring?.radiusKm) || ring.radiusKm <= 0) return null
    return circle([row.lon, row.lat], ring.radiusKm, { steps: 72, units: 'kilometers' }).geometry
  }
  return { cone: typhoon.geometry?.cone, gale: windCircle(row?.gale), storm: windCircle(row?.storm) }
}

export function buildTyphoonGeoJson(typhoons = [], selected = null, hiddenKeys = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  const result = {
    track: empty(), forecastTrack: empty(), points: empty(), cone: empty(), gale: empty(), storm: empty(),
  }

  for (const typhoon of typhoons) {
    if (hiddenKeys.includes(`${typhoon.year}-${typhoon.number}`)) continue
    const color = colors[typhoon.number]
    const props = { number: typhoon.number, color, label: `${typhoon.number}호` }
    const rows = typhoon.rows ?? []
    const analysis = rows.filter((row) => !row.forecast)
    const forecast = rows.filter((row) => row.forecast)
    const coord = (row) => [row.lon, row.lat]

    if (analysis.length >= 2) {
      result.track.features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: analysis.map(coord) } })
    }
    // 예보선은 분석 마지막 점에서 이어 붙여야 선이 끊기지 않는다.
    const forecastCoords = [...analysis.slice(-1), ...forecast].map(coord)
    if (forecastCoords.length >= 2) {
      result.forecastTrack.features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: forecastCoords } })
    }

    for (const row of rows) {
      const isCurrent = isSameRow(row, typhoon.current)
      const majorForecast = row.forecast && Number.isFinite(row.leadHours) && row.leadHours > 0 && row.leadHours % 24 === 0
      result.points.features.push({
        type: 'Feature',
        properties: {
          ...props,
          forecast: Boolean(row.forecast),
          // leadHours로 현재 위치를 고를 수 없다 — 모든 분석 행이 0이다(힌남노 39행 중 32행).
          isCurrent,
          pointLabel: isCurrent
            ? `${typhoon.number}호${typhoon.name ? ` ${typhoon.name}` : ''} · 현재`
            : majorForecast ? `+${row.leadHours}h` : '',
          leadHours: row.leadHours,
          pressureHpa: row.pressureHpa,
          maxWindMs: row.maxWindMs,
          strength: intensityOf(row.maxWindMs) ?? 'TD',
          validAt: row.validAt,
          isSelected: Boolean(selected) && selected.number === typhoon.number && selected.validAt === row.validAt,
        },
        geometry: { type: 'Point', coordinates: coord(row) },
      })
    }

    const rings = ringsFor(typhoon, selected)
    for (const [key, geometry] of [['cone', rings.cone], ['gale', rings.gale], ['storm', rings.storm]]) {
      if (!geometry) continue
      result[key].features.push({ type: 'Feature', properties: props, geometry })
    }
  }
  return result
}

const SOURCE_BY_KEY = {
  cone: 'typhoon-cone', gale: 'typhoon-gale', storm: 'typhoon-storm',
  track: 'typhoon-track', forecastTrack: 'typhoon-forecast-track', points: 'typhoon-points',
}

export function addTyphoonLayers(map) {
  if (!map) return
  for (const id of TYPHOON_SOURCE_IDS) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() })
  }
  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer) }

  add({ id: 'typhoon-cone-fill', type: 'fill', source: 'typhoon-cone', paint: { 'fill-color': themeColor.level.amberBg, 'fill-opacity': 0.65 } })
  add({ id: 'typhoon-cone-outline', type: 'line', source: 'typhoon-cone', paint: { 'line-color': themeColor.level.amber, 'line-width': 1.75, 'line-dasharray': [2, 2] } })
  add({ id: 'typhoon-gale-fill', type: 'fill', source: 'typhoon-gale', paint: { 'fill-color': themeColor.icing[2], 'fill-opacity': 0.25 } })
  add({ id: 'typhoon-gale-outline', type: 'line', source: 'typhoon-gale', paint: { 'line-color': themeColor.icing[3], 'line-width': 1.5 } })
  add({ id: 'typhoon-storm-fill', type: 'fill', source: 'typhoon-storm', paint: { 'fill-color': themeColor.icing[3], 'fill-opacity': 0.35 } })
  add({ id: 'typhoon-storm-outline', type: 'line', source: 'typhoon-storm', paint: { 'line-color': themeColor.icing[3], 'line-width': 2.5 } })
  add({ id: 'typhoon-track-line', type: 'line', source: 'typhoon-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } })
  add({ id: 'typhoon-forecast-track-line', type: 'line', source: 'typhoon-forecast-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [5, 3] } })
  // 두 원과 강도 숫자는 모두 같은 소스 좌표에 고정한다(화면 오프셋 없음).
  add({
    id: 'typhoon-current-ring', type: 'circle', source: 'typhoon-points',
    filter: ['==', ['get', 'isCurrent'], true],
    paint: {
      'circle-radius': ['case', ['get', 'isSelected'], 20, 18],
      'circle-color': themeColor.bg1,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2,
    },
  })
  add({
    id: 'typhoon-points-circle', type: 'circle', source: 'typhoon-points',
    paint: {
      'circle-color': ['case', ['get', 'isCurrent'], ['get', 'color'], ['get', 'forecast'], 'rgba(0, 0, 0, 0)', ['get', 'color']],
      'circle-radius': ['case', ['get', 'isCurrent'], ['case', ['get', 'isSelected'], 14, 12], ['get', 'forecast'], ['case', ['get', 'isSelected'], 16, 14], ['case', ['get', 'isSelected'], 7, 4]],
      'circle-stroke-color': ['case', ['any', ['get', 'isCurrent'], ['get', 'forecast']], ['get', 'color'], themeColor.bg1],
      'circle-stroke-width': ['case', ['get', 'isSelected'], 3, ['get', 'forecast'], 2, 1],
    },
  })
  add({
    id: 'typhoon-points-strength', type: 'symbol', source: 'typhoon-points',
    filter: ['any', ['==', ['get', 'isCurrent'], true], ['==', ['get', 'forecast'], true]],
    layout: {
      'text-field': ['get', 'strength'],
      'text-size': 14,
      'text-font': ['Open Sans Bold'],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['case', ['get', 'isCurrent'], themeColor.bg1, themeColor.text1],
      'text-halo-color': themeColor.bg1,
      'text-halo-width': ['case', ['get', 'isCurrent'], 0, 1],
    },
  })
  add({
    id: 'typhoon-point-labels', type: 'symbol', source: 'typhoon-points',
    filter: ['!=', ['get', 'pointLabel'], ''],
    layout: {
      'text-field': ['get', 'pointLabel'],
      'text-size': ['case', ['get', 'isCurrent'], 14, 12],
      'text-font': ['Open Sans Bold'],
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 1.8,
      'text-padding': 4,
      'symbol-sort-key': ['case', ['get', 'isCurrent'], 0, 1],
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': themeColor.bg1, 'text-halo-width': 2 },
  })
}

export function removeTyphoonLayers(map) {
  if (!map) return
  for (const id of TYPHOON_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of TYPHOON_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id)
}

export function setTyphoonVisibility(map, visible) {
  if (!map) return
  for (const id of TYPHOON_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncTyphoonLayers(map, { typhoons = [], visible = false, selected = null, hiddenKeys = [] } = {}) {
  if (!map?.getSource) return
  addTyphoonLayers(map)
  const data = buildTyphoonGeoJson(typhoons, selected, hiddenKeys)
  for (const [key, sourceId] of Object.entries(SOURCE_BY_KEY)) {
    map.getSource(sourceId)?.setData(data[key])
  }
  setTyphoonVisibility(map, visible)
}

export default { TYPHOON_SOURCE_IDS, TYPHOON_LAYER_IDS, buildTyphoonGeoJson, addTyphoonLayers, removeTyphoonLayers, setTyphoonVisibility, syncTyphoonLayers }
