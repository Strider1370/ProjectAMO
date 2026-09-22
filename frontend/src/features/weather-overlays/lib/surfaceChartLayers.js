// KIM 지상 일기도 Mapbox 소스·레이어 설치와 동기화. 데이터 모양은 surfaceChartModel.js가 정한다.
import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const SURFACE_CHART_PRECIP_SOURCE = 'kim-surface-chart-precip'
export const SURFACE_CHART_PRECIP_LAYER = 'kim-surface-chart-precip'
export const SURFACE_CHART_ISOBAR_SOURCE = 'kim-surface-chart-isobars'
export const SURFACE_CHART_ISOBAR_LAYER = 'kim-surface-chart-isobars'
export const SURFACE_CHART_ISOBAR_LABEL_LAYER = 'kim-surface-chart-isobar-labels'
export const SURFACE_CHART_CENTER_SOURCE = 'kim-surface-chart-centers'
export const SURFACE_CHART_CENTER_LAYER = 'kim-surface-chart-center-symbols'
export const SURFACE_CHART_CENTER_PRESSURE_LAYER = 'kim-surface-chart-center-pressure'
export const SURFACE_CHART_BARB_SOURCE = 'kim-surface-chart-barbs'
export const SURFACE_CHART_BARB_LAYER = 'kim-surface-chart-barbs'
export const SURFACE_CHART_CALM_LAYER = 'kim-surface-chart-calm'

export const SURFACE_CHART_SOURCE_IDS = [SURFACE_CHART_ISOBAR_SOURCE, SURFACE_CHART_CENTER_SOURCE, SURFACE_CHART_BARB_SOURCE]
export const SURFACE_CHART_LAYER_IDS = [
  SURFACE_CHART_PRECIP_LAYER,
  SURFACE_CHART_ISOBAR_LAYER,
  SURFACE_CHART_ISOBAR_LABEL_LAYER,
  SURFACE_CHART_CALM_LAYER,
  SURFACE_CHART_BARB_LAYER,
  SURFACE_CHART_CENTER_LAYER,
  SURFACE_CHART_CENTER_PRESSURE_LAYER,
]

// 자료 표현용 색. 일기도 관례(H 빨강·L 파랑)와 2026-09-22 시험에서 정한 등압선 색이다.
// 밝은 배경지도에서는 짙은 남회색 선, 어두운 배경지도와 위성 배경에서는 밝은 선을 쓴다.
export const SURFACE_CHART_COLORS = Object.freeze({
  high: '#d11f1f',
  low: '#1d3fd6',
  light: { isobar: '#1e293b', label: '#0f172a', halo: '#ffffff', calm: '#1e293b' },
  dark: { isobar: '#e2e8f0', label: '#f8fafc', halo: '#0f172a', calm: '#e2e8f0' },
})
const FONT = ['Open Sans Bold']
const EMPTY = { type: 'FeatureCollection', features: [] }

export function surfaceChartPalette(basemapId) {
  return basemapId === 'dark' || basemapId === 'satellite' ? SURFACE_CHART_COLORS.dark : SURFACE_CHART_COLORS.light
}

function addLayerOnce(map, layer) {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

function installVectorLayers(map, palette) {
  for (const id of SURFACE_CHART_SOURCE_IDS) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY })
  addLayerOnce(map, {
    id: SURFACE_CHART_ISOBAR_LAYER, type: 'line', source: SURFACE_CHART_ISOBAR_SOURCE, slot: 'top',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': palette.isobar,
      'line-opacity': ['case', ['get', 'major'], 0.95, 0.7],
      'line-width': ['case', ['get', 'major'], 1.8, 1.4],
    },
  })
  addLayerOnce(map, {
    id: SURFACE_CHART_ISOBAR_LABEL_LAYER, type: 'symbol', source: SURFACE_CHART_ISOBAR_SOURCE, slot: 'top',
    filter: ['==', ['get', 'major'], true],
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 350,
      'text-field': ['to-string', ['get', 'p']], 'text-font': FONT, 'text-size': 12,
    },
    paint: { 'text-color': palette.label, 'text-halo-color': palette.halo, 'text-halo-width': 2 },
  })
  addLayerOnce(map, {
    id: SURFACE_CHART_CALM_LAYER, type: 'circle', source: SURFACE_CHART_BARB_SOURCE, slot: 'top',
    filter: ['==', ['get', 'calm'], true],
    paint: { 'circle-radius': 3, 'circle-color': 'rgba(0, 0, 0, 0)', 'circle-stroke-color': palette.calm, 'circle-stroke-width': 1.2 },
  })
  addLayerOnce(map, {
    id: SURFACE_CHART_BARB_LAYER, type: 'symbol', source: SURFACE_CHART_BARB_SOURCE, slot: 'top',
    filter: ['==', ['get', 'calm'], false],
    layout: {
      'icon-image': ['get', 'icon'], 'icon-rotate': ['get', 'direction'], 'icon-rotation-alignment': 'map',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.75, 9, 0.9],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  })
  addLayerOnce(map, {
    id: SURFACE_CHART_CENTER_LAYER, type: 'symbol', source: SURFACE_CHART_CENTER_SOURCE, slot: 'top',
    layout: { 'text-field': ['get', 'kind'], 'text-font': FONT, 'text-size': 30, 'text-allow-overlap': true },
    paint: {
      'text-color': ['match', ['get', 'kind'], 'H', SURFACE_CHART_COLORS.high, SURFACE_CHART_COLORS.low],
      'text-halo-color': palette.halo, 'text-halo-width': 2,
    },
  })
  addLayerOnce(map, {
    id: SURFACE_CHART_CENTER_PRESSURE_LAYER, type: 'symbol', source: SURFACE_CHART_CENTER_SOURCE, slot: 'top',
    layout: {
      'text-field': ['to-string', ['get', 'pressureHpa']], 'text-font': FONT, 'text-size': 13,
      'text-offset': [0, 1.7], 'text-allow-overlap': true,
    },
    paint: {
      'text-color': ['match', ['get', 'kind'], 'H', SURFACE_CHART_COLORS.high, SURFACE_CHART_COLORS.low],
      'text-halo-color': palette.halo, 'text-halo-width': 1.6,
    },
  })
}

function applyPalette(map, palette) {
  const set = (layerId, property, value) => { if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value) }
  set(SURFACE_CHART_ISOBAR_LAYER, 'line-color', palette.isobar)
  set(SURFACE_CHART_ISOBAR_LABEL_LAYER, 'text-color', palette.label)
  set(SURFACE_CHART_ISOBAR_LABEL_LAYER, 'text-halo-color', palette.halo)
  set(SURFACE_CHART_CALM_LAYER, 'circle-stroke-color', palette.calm)
  set(SURFACE_CHART_CENTER_LAYER, 'text-halo-color', palette.halo)
  set(SURFACE_CHART_CENTER_PRESSURE_LAYER, 'text-halo-color', palette.halo)
}

// model: { visible, show: { isobars, precip, barbs }, frame: { isobars, centers, precipUrl, view } | null, barbs, basemapId,
//          ensureBarbImages(map) — 공항 바람깃 그림 등록(훅이 넘긴다) }
export function syncSurfaceChartLayers(map, model) {
  if (!map) return
  const { visible, show = {}, frame, barbs, basemapId, ensureBarbImages } = model
  const hasFrame = !!frame
  if (!visible && !SURFACE_CHART_LAYER_IDS.some((id) => map.getLayer(id))) return

  const palette = surfaceChartPalette(basemapId)
  if (visible) {
    // 배경지도를 바꾸면 런타임 이미지가 지워지므로 매번 확인한다(이미 있으면 건너뛴다).
    ensureBarbImages?.(map)
    installVectorLayers(map, palette)
    applyPalette(map, palette)
    addOrUpdateGeoJsonSource(map, SURFACE_CHART_ISOBAR_SOURCE, frame?.isobars || EMPTY)
    addOrUpdateGeoJsonSource(map, SURFACE_CHART_CENTER_SOURCE, frame?.centers || EMPTY)
    addOrUpdateGeoJsonSource(map, SURFACE_CHART_BARB_SOURCE, barbs || EMPTY)
    if (frame?.precipUrl && frame.view) {
      addOrUpdateImageOverlay(map, {
        sourceId: SURFACE_CHART_PRECIP_SOURCE,
        layerId: SURFACE_CHART_PRECIP_LAYER,
        frame: { path: frame.precipUrl, bounds: [[frame.view.latMin, frame.view.lonMin], [frame.view.latMax, frame.view.lonMax]] },
        opacity: 0.9,
      })
    }
  }

  const on = (flag) => visible && hasFrame && !!flag
  setMapLayerVisible(map, SURFACE_CHART_PRECIP_LAYER, on(show.precip))
  for (const id of [SURFACE_CHART_ISOBAR_LAYER, SURFACE_CHART_ISOBAR_LABEL_LAYER, SURFACE_CHART_CENTER_LAYER, SURFACE_CHART_CENTER_PRESSURE_LAYER]) {
    setMapLayerVisible(map, id, on(show.isobars))
  }
  setMapLayerVisible(map, SURFACE_CHART_BARB_LAYER, on(show.barbs))
  setMapLayerVisible(map, SURFACE_CHART_CALM_LAYER, on(show.barbs))
}
