import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const RADAR_MOTION_SOURCE = 'kma-radar-motion'
export const RADAR_MOTION_ARROW_LAYER = 'kma-radar-motion-arrow'
const RADAR_MOTION_ARROW_ICON_ID = 'radar-observed-motion-arrow'

const motionStateByMap = new WeakMap()
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

function getMotionState(map) {
  let state = motionStateByMap.get(map)
  if (!state) {
    state = { dataUrl: null, data: EMPTY_GEOJSON, visible: false, bound: false, requestId: 0 }
    motionStateByMap.set(map, state)
  }
  return state
}

function readBounds(map) {
  const bounds = map.getBounds?.()
  if (!bounds) return null
  return {
    west: bounds.getWest?.(), east: bounds.getEast?.(), south: bounds.getSouth?.(), north: bounds.getNorth?.(),
  }
}

export function selectVisibleMotionFeatures(data, bounds, columns = 15, rows = 12) {
  const features = Array.isArray(data?.features) ? data.features : []
  if (!bounds || ![bounds.west, bounds.east, bounds.south, bounds.north].every(Number.isFinite)) {
    return { type: 'FeatureCollection', features: features.slice(0, columns * rows) }
  }
  const width = bounds.east - bounds.west
  const height = bounds.north - bounds.south
  if (width <= 0 || height <= 0) return { type: 'FeatureCollection', features: [] }
  const best = new Map()
  for (const feature of features) {
    const [lon, lat] = feature?.geometry?.coordinates?.[0] || []
    if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) continue
    const col = Math.min(columns - 1, Math.floor((lon - bounds.west) / width * columns))
    const row = Math.min(rows - 1, Math.floor((bounds.north - lat) / height * rows))
    const key = `${col}:${row}`
    const current = best.get(key)
    if (!current || Number(feature.properties?.confidence || 0) > Number(current.properties?.confidence || 0)) best.set(key, feature)
  }
  return { type: 'FeatureCollection', features: [...best.values()] }
}

function ensureRadarMotionArrowImage(map) {
  if (map.hasImage(RADAR_MOTION_ARROW_ICON_ID) || typeof document === 'undefined') return
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { alpha: true })
  context.translate(size / 2, size / 2)
  for (const [color, width] of [['#ffffff', 7], ['#075985', 3]]) {
    context.strokeStyle = color
    context.lineWidth = width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(0, 10)
    context.lineTo(0, -10)
    context.moveTo(-6, -4)
    context.lineTo(0, -10)
    context.lineTo(6, -4)
    context.stroke()
  }
  const { data, width, height } = context.getImageData(0, 0, size, size)
  map.addImage(RADAR_MOTION_ARROW_ICON_ID, { data, width, height })
}

function applyMotionData(map, state) {
  const source = map.getSource(RADAR_MOTION_SOURCE)
  if (!source) return
  source.setData(state.visible ? selectVisibleMotionFeatures(state.data, readBounds(map)) : EMPTY_GEOJSON)
}

function loadMotionData(map, state, dataUrl) {
  state.dataUrl = dataUrl
  const requestId = ++state.requestId
  fetch(dataUrl)
    .then((response) => response.ok ? response.json() : EMPTY_GEOJSON)
    .catch(() => EMPTY_GEOJSON)
    .then((data) => {
      if (state.requestId !== requestId || state.dataUrl !== dataUrl) return
      state.data = data?.type === 'FeatureCollection' ? data : EMPTY_GEOJSON
      applyMotionData(map, state)
    })
}

function ensureMotionLayers(map) {
  addOrUpdateGeoJsonSource(map, RADAR_MOTION_SOURCE, EMPTY_GEOJSON)
  ensureRadarMotionArrowImage(map)
  if (!map.getLayer(RADAR_MOTION_ARROW_LAYER)) {
    map.addLayer({
      id: RADAR_MOTION_ARROW_LAYER,
      type: 'symbol',
      source: RADAR_MOTION_SOURCE,
      minzoom: 5,
      slot: 'top',
      layout: {
        'icon-image': RADAR_MOTION_ARROW_ICON_ID,
        'icon-size': 1.05,
        'icon-rotate': ['get', 'bearingDeg'],
        'icon-rotation-alignment': 'map',
        'symbol-placement': 'line-center',
        'icon-allow-overlap': true,
      },
      paint: { 'icon-opacity': ['coalesce', ['get', 'confidence'], 0.6] },
    })
  }
}

export function syncRadarMotionLayer(map, model) {
  ensureMotionLayers(map)
  const state = getMotionState(map)
  state.visible = Boolean(model?.visible && model?.dataUrl)
  setMapLayerVisible(map, RADAR_MOTION_ARROW_LAYER, state.visible)

  if (!state.bound && map.on) {
    state.bound = true
    map.on('moveend', () => applyMotionData(map, state))
  }

  // Fetch the small, already-downsampled payload as soon as an exact frame has one.
  // The user toggle only controls painting; this avoids a metadata-after-radar race.
  if (model?.dataUrl && state.dataUrl !== model.dataUrl) loadMotionData(map, state, model.dataUrl)

  if (!state.visible) {
    applyMotionData(map, state)
    return
  }
  applyMotionData(map, state)
}
