// 태풍 지도 레이어. 도형은 백엔드가 계산해 내려준다 — 여기서 다시 만들지 않는다.
// 색만으로 구분하지 않는다: 각 지점에 태풍번호 라벨이 함께 붙는다.
import { assignTyphoonColors } from './typhoonColors.js'

// JSON 왕복 후에는 참조 비교가 무의미하다. 값으로 현재 행을 가린다.
function isSameRow(a, b) {
  return Boolean(a && b) && a.validAt === b.validAt && a.seq === b.seq && Boolean(a.forecast) === Boolean(b.forecast)
}

export const TYPHOON_SOURCE_IDS = [
  'typhoon-cone', 'typhoon-gale', 'typhoon-storm', 'typhoon-track', 'typhoon-forecast-track', 'typhoon-points',
]

export const TYPHOON_LAYER_IDS = [
  'typhoon-cone-fill',
  'typhoon-gale-fill',
  'typhoon-storm-fill',
  'typhoon-track-line',
  'typhoon-forecast-track-line',
  'typhoon-points-circle',
  'typhoon-points-label',
]

const empty = () => ({ type: 'FeatureCollection', features: [] })

export function buildTyphoonGeoJson(typhoons = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  const result = {
    track: empty(), forecastTrack: empty(), points: empty(), cone: empty(), gale: empty(), storm: empty(),
  }

  for (const typhoon of typhoons) {
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
      result.points.features.push({
        type: 'Feature',
        properties: {
          ...props,
          forecast: Boolean(row.forecast),
          // leadHours로 현재 위치를 고를 수 없다 — 모든 분석 행이 0이다(힌남노 39행 중 32행).
          isCurrent: isSameRow(row, typhoon.current),
          leadHours: row.leadHours,
          pressureHpa: row.pressureHpa,
          validAt: row.validAt,
        },
        geometry: { type: 'Point', coordinates: coord(row) },
      })
    }

    for (const [key, geometry] of [['cone', typhoon.geometry?.cone], ['gale', typhoon.geometry?.gale], ['storm', typhoon.geometry?.storm]]) {
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

  add({ id: 'typhoon-cone-fill', type: 'fill', source: 'typhoon-cone', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } })
  add({ id: 'typhoon-gale-fill', type: 'fill', source: 'typhoon-gale', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } })
  add({ id: 'typhoon-storm-fill', type: 'fill', source: 'typhoon-storm', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.38 } })
  add({ id: 'typhoon-track-line', type: 'line', source: 'typhoon-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } })
  add({ id: 'typhoon-forecast-track-line', type: 'line', source: 'typhoon-forecast-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 2] } })
  add({ id: 'typhoon-points-circle', type: 'circle', source: 'typhoon-points', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['case', ['get', 'forecast'], 4, 6], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } })
  add({
    id: 'typhoon-points-label', type: 'symbol', source: 'typhoon-points',
    // 현재 위치 한 곳에만 라벨을 찍는다. leadHours==0으로 거르면 지나온 경로 전체에 라벨이 쌓인다.
    filter: ['==', ['get', 'isCurrent'], true],
    // 스펙 §9: 라벨은 태풍번호와 중심기압. 색만으로 구분하지 않기 위한 것이므로 번호는 반드시 남는다.
    layout: {
      'text-field': ['case',
        ['has', 'pressureHpa'], ['concat', ['get', 'label'], ' · ', ['to-string', ['get', 'pressureHpa']], ' hPa'],
        ['get', 'label'],
      ],
      'text-size': 12, 'text-offset': [0, 1.2], 'text-allow-overlap': false,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
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

export function syncTyphoonLayers(map, { typhoons = [], visible = false } = {}) {
  if (!map?.getSource) return
  addTyphoonLayers(map)
  const data = buildTyphoonGeoJson(typhoons)
  for (const [key, sourceId] of Object.entries(SOURCE_BY_KEY)) {
    map.getSource(sourceId)?.setData(data[key])
  }
  setTyphoonVisibility(map, visible)
}

export default { TYPHOON_SOURCE_IDS, TYPHOON_LAYER_IDS, buildTyphoonGeoJson, addTyphoonLayers, removeTyphoonLayers, setTyphoonVisibility, syncTyphoonLayers }
