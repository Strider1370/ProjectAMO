import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const RADAR_MOTION_SOURCE = 'kma-radar-motion'
export const RADAR_MOTION_SHAFT_SOURCE = 'kma-radar-motion-shaft'
export const RADAR_MOTION_SHAFT_LAYER = 'kma-radar-motion-shaft'
export const RADAR_MOTION_ARROW_LAYER = 'kma-radar-motion-arrow'

const ARROW_ICON_ID = 'radar-motion-arrowhead'
const EMPTY = { type: 'FeatureCollection', features: [] }
// 화살대 길이 = 이 시간만큼의 이동거리. 5분치는 화면에서 너무 짧아 10분치로 그린다.
// 범례 문구('길이 = 10분 이동거리')와 반드시 같이 움직여야 한다.
const ARROW_MINUTES = 10
const EARTH_KM = 6371.0088
const ARROW_RED = '#e11d2e'

const stateByMap = new WeakMap()

function getState(map) {
  let state = stateByMap.get(map)
  if (!state) {
    state = { dataUrl: null, points: EMPTY, visible: false, requestId: 0 }
    stateByMap.set(map, state)
  }
  return state
}

// 화살대 끝점. 화살대와 화살촉이 반드시 같은 좌표를 쓰도록 한 곳에서만 계산한다.
export function arrowTip(feature) {
  const speedKt = Number(feature?.properties?.speedKt)
  const bearingDeg = Number(feature?.properties?.bearingDeg)
  const start = feature?.geometry?.coordinates
  if (!Number.isFinite(speedKt) || speedKt <= 0) return null
  if (!Number.isFinite(bearingDeg) || !Array.isArray(start)) return null

  const toRad = Math.PI / 180
  const d = (speedKt * 1.852 * (ARROW_MINUTES / 60)) / EARTH_KM
  const brg = bearingDeg * toRad
  const lat1 = start[1] * toRad, lon1 = start[0] * toRad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
  const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / toRad, lat2 / toRad]
}

// 화살대는 실제 좌표를 갖는다 — 확대하면 같이 커지므로 길이가 속도로 읽힌다.
export function buildMotionShaftGeoJSON(points) {
  const features = []
  for (const f of points?.features || []) {
    const tip = arrowTip(f)
    if (!tip) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.geometry.coordinates, tip] },
      properties: f.properties,
    })
  }
  return { type: 'FeatureCollection', features }
}

// 화살촉은 화살대 끝에 놓는다. 서버가 준 Point는 시작점이다.
export function buildMotionHeadGeoJSON(points) {
  const features = []
  for (const f of points?.features || []) {
    const tip = arrowTip(f)
    if (!tip) continue
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: tip }, properties: f.properties })
  }
  return { type: 'FeatureCollection', features }
}

// 화살촉만 그리는 아이콘. 위(북)를 향하게 그려두고 bearingDeg로 회전시킨다.
function ensureArrowImage(map) {
  if (map.hasImage(ARROW_ICON_ID) || typeof document === 'undefined') return
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { alpha: true })
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = ARROW_RED
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(5.5, 5)
  ctx.lineTo(0, 2.5)
  ctx.lineTo(-5.5, 5)
  ctx.closePath()
  ctx.fill()
  const { data, width, height } = ctx.getImageData(0, 0, size, size)
  map.addImage(ARROW_ICON_ID, { data, width, height })
}

function ensureLayers(map) {
  addOrUpdateGeoJsonSource(map, RADAR_MOTION_SHAFT_SOURCE, EMPTY)
  addOrUpdateGeoJsonSource(map, RADAR_MOTION_SOURCE, EMPTY)
  ensureArrowImage(map)

  if (!map.getLayer(RADAR_MOTION_SHAFT_LAYER)) {
    map.addLayer({
      id: RADAR_MOTION_SHAFT_LAYER,
      type: 'line',
      source: RADAR_MOTION_SHAFT_SOURCE,
      slot: 'top',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': ARROW_RED, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2.4] },
    })
  }
  if (!map.getLayer(RADAR_MOTION_ARROW_LAYER)) {
    map.addLayer({
      id: RADAR_MOTION_ARROW_LAYER,
      type: 'symbol',
      source: RADAR_MOTION_SOURCE,
      slot: 'top',
      layout: {
        // symbol-placement를 지정하지 않는다(기본 point). 선 위 배치는 아이콘을 선
        // 방향으로 한 번 더 돌려 방위가 이중 적용된다.
        'icon-image': ARROW_ICON_ID,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 10, 0.7],
        'icon-rotate': ['get', 'bearingDeg'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }
}

function applyData(map, state) {
  const points = state.visible ? state.points : EMPTY
  map.getSource(RADAR_MOTION_SHAFT_SOURCE)?.setData(buildMotionShaftGeoJSON(points))
  map.getSource(RADAR_MOTION_SOURCE)?.setData(buildMotionHeadGeoJSON(points))
}

function loadData(map, state, dataUrl) {
  state.dataUrl = dataUrl
  const requestId = ++state.requestId
  fetch(dataUrl)
    .then((response) => (response.ok ? response.json() : EMPTY))
    .catch(() => EMPTY)
    .then((data) => {
      if (state.requestId !== requestId || state.dataUrl !== dataUrl) return
      state.points = data?.type === 'FeatureCollection' ? data : EMPTY
      applyData(map, state)
    })
}

export function syncRadarMotionLayer(map, model) {
  ensureLayers(map)
  const state = getState(map)
  state.visible = Boolean(model?.visible && model?.dataUrl)
  setMapLayerVisible(map, RADAR_MOTION_SHAFT_LAYER, state.visible)
  setMapLayerVisible(map, RADAR_MOTION_ARROW_LAYER, state.visible)

  if (model?.dataUrl && state.dataUrl !== model.dataUrl) loadData(map, state, model.dataUrl)
  applyData(map, state)
}
