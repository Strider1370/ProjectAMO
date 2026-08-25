import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from './advisoryLayers.js'
import {
  LIGHTNING_CLOUD_LAYER,
  LIGHTNING_GROUND_LAYER,
  LIGHTNING_SOURCE,
  addLightningLayers,
  createLightningFrameSync,
  setLightningBlinkState,
  setLightningVisibility,
} from './lightningLayers.js'
import {
  RAINVIEWER_COVERAGE_LAYER,
  RAINVIEWER_COVERAGE_SOURCE,
  RAINVIEWER_LAYER,
  RAINVIEWER_SOURCE,
  syncRainviewerLayers,
} from './rainviewerLayers.js'
import {
  QPF_LAYER,
  QPF_SOURCE,
  syncQpfLayer,
} from './qpfLayers.js'
import {
  WISSDOM_LAYER,
  WISSDOM_SOURCE,
  syncWissdomLayer,
} from './wissdomLayers.js'
import { syncRasterFrame } from './rasterFrameTransition.js'

export { QPF_LAYER, QPF_SOURCE, WISSDOM_LAYER, WISSDOM_SOURCE }

export const SATELLITE_SOURCE = 'kma-satellite-overlay'
export const SATELLITE_LAYER = 'kma-satellite-overlay'
export const RADAR_SOURCE = 'kma-radar-overlay'
export const RADAR_LAYER = 'kma-radar-overlay'
export const SIGWX_SOURCE = 'kma-sigwx-overlay'
export const SIGWX_LAYER = 'kma-sigwx-overlay'
export const SIGWX_CLOUD_SOURCE = 'kma-sigwx-cloud-overlay'
export const SIGWX_CLOUD_LAYER = 'kma-sigwx-cloud-overlay'
export const SIGWX_POLYGON_SOURCE = 'kma-sigwx-low-polygons'
export const SIGWX_POLYGON_LAYER = 'kma-sigwx-low-polygons'
export const SIGWX_POLYGON_OUTLINE_LAYER = 'kma-sigwx-low-polygons-outline'
export const SIGWX_LINE_SOURCE = 'kma-sigwx-low-lines'
export const SIGWX_LINE_LAYER = 'kma-sigwx-low-lines'
export const SIGWX_LABEL_SOURCE = 'kma-sigwx-low-labels'
export const SIGWX_LABEL_LAYER = 'kma-sigwx-low-labels'
export const SIGWX_ICON_SOURCE = 'kma-sigwx-low-icons'
export const SIGWX_ICON_LAYER = 'kma-sigwx-low-icons'
export const SIGWX_ARROW_LABEL_SOURCE = 'kma-sigwx-low-arrow-labels'
export const SIGWX_ARROW_LABEL_LAYER = 'kma-sigwx-low-arrow-labels'
export const SIGWX_TEXT_CHIP_SOURCE = 'kma-sigwx-low-text-chips'
export const SIGWX_TEXT_CHIP_LAYER = 'kma-sigwx-low-text-chips'
export const SIGWX_VECTOR_LAYERS = [
  SIGWX_POLYGON_LAYER,
  SIGWX_POLYGON_OUTLINE_LAYER,
  SIGWX_LINE_LAYER,
  SIGWX_LABEL_LAYER,
  SIGWX_ICON_LAYER,
  SIGWX_ARROW_LABEL_LAYER,
  SIGWX_TEXT_CHIP_LAYER,
]
export const WEATHER_OVERLAY_SOURCE_IDS = [
  SATELLITE_SOURCE,
  RADAR_SOURCE,
  WISSDOM_SOURCE,
  QPF_SOURCE,
  RAINVIEWER_SOURCE,
  RAINVIEWER_COVERAGE_SOURCE,
  SIGWX_SOURCE,
  SIGWX_CLOUD_SOURCE,
  SIGWX_POLYGON_SOURCE,
  SIGWX_LINE_SOURCE,
  SIGWX_LABEL_SOURCE,
  SIGWX_ICON_SOURCE,
  SIGWX_ARROW_LABEL_SOURCE,
  SIGWX_TEXT_CHIP_SOURCE,
  LIGHTNING_SOURCE,
  ADVISORY_LAYER_DEFS.sigmet.sourceId,
  `${ADVISORY_LAYER_DEFS.sigmet.sourceId}-labels`,
  ADVISORY_LAYER_DEFS.sigmet_intl.sourceId,
  `${ADVISORY_LAYER_DEFS.sigmet_intl.sourceId}-labels`,
  ADVISORY_LAYER_DEFS.airmet.sourceId,
  `${ADVISORY_LAYER_DEFS.airmet.sourceId}-labels`,
]
export const WEATHER_OVERLAY_LAYER_IDS = [
  SATELLITE_LAYER,
  RADAR_LAYER,
  WISSDOM_LAYER,
  QPF_LAYER,
  RAINVIEWER_LAYER,
  RAINVIEWER_COVERAGE_LAYER,
  SIGWX_LAYER,
  SIGWX_CLOUD_LAYER,
  ...SIGWX_VECTOR_LAYERS,
  LIGHTNING_GROUND_LAYER,
  LIGHTNING_CLOUD_LAYER,
  ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
  ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
  ADVISORY_LAYER_DEFS.sigmet.iconLayerId,
  ADVISORY_LAYER_DEFS.sigmet.arrowLayerId,
  ADVISORY_LAYER_DEFS.sigmet.textLayerId,
  ADVISORY_LAYER_DEFS.sigmet_intl.fillLayerId,
  ADVISORY_LAYER_DEFS.sigmet_intl.lineLayerId,
  ADVISORY_LAYER_DEFS.sigmet_intl.iconLayerId,
  ADVISORY_LAYER_DEFS.sigmet_intl.arrowLayerId,
  ADVISORY_LAYER_DEFS.sigmet_intl.textLayerId,
  ADVISORY_LAYER_DEFS.airmet.fillLayerId,
  ADVISORY_LAYER_DEFS.airmet.lineLayerId,
  ADVISORY_LAYER_DEFS.airmet.iconLayerId,
  ADVISORY_LAYER_DEFS.airmet.arrowLayerId,
  ADVISORY_LAYER_DEFS.airmet.textLayerId,
]

export const RADAR_RAINRATE_LEGEND = [
  { label: '150', color: 'rgb(51, 50, 59)' },
  { label: '110', color: 'rgb(2, 4, 138)' },
  { label: '90', color: 'rgb(75, 79, 170)' },
  { label: '70', color: 'rgb(178, 180, 219)' },
  { label: '60', color: 'rgb(141, 6, 219)' },
  { label: '50', color: 'rgb(174, 44, 250)' },
  { label: '40', color: 'rgb(201, 107, 248)' },
  { label: '30', color: 'rgb(223, 170, 250)' },
  { label: '25', color: 'rgb(174, 5, 7)' },
  { label: '20', color: 'rgb(202, 4, 6)' },
  { label: '15', color: 'rgb(246, 61, 4)' },
  { label: '10', color: 'rgb(237, 118, 7)' },
  { label: '9', color: 'rgb(211, 175, 10)' },
  { label: '8', color: 'rgb(237, 196, 10)' },
  { label: '7', color: 'rgb(251, 218, 32)' },
  { label: '6', color: 'rgb(254, 247, 19)' },
  { label: '5', color: 'rgb(18, 92, 5)' },
  { label: '4', color: 'rgb(7, 135, 6)' },
  { label: '3', color: 'rgb(6, 187, 8)' },
  { label: '2', color: 'rgb(8, 250, 8)' },
  { label: '1.0', color: 'rgb(4, 74, 231)' },
  { label: '0.5', color: 'rgb(6, 153, 238)' },
  { label: '0.1', color: 'rgb(8, 198, 246)' },
  { label: '0.0', color: 'rgb(247, 252, 249)' },
]

// WISSDOM 바람장 풍속 밴드(m/s). 색은 눈대중이 아니라 기상청이 함께 보내주는 범례 이미지
// (RDR_WIS_legend320.png)의 픽셀에서 그대로 읽은 값이다 — 40px씩 여덟 칸.
// 라벨은 각 밴드의 하한이다. 기상청 원본에는 0 아래로 흰색(#EEEEEE) 칸이 하나 더 있는데,
// 지도에서 사실상 보이지 않는 무풍/무자료 칸이라 범례에서 뺐다.
// 기상청이 색이나 구간을 바꾸면 이 표도 같이 바꿔야 한다 — 그때는 범례 이미지를 다시 읽으면 된다.
export const WISSDOM_WIND_LEGEND = [
  { label: '0', color: 'rgb(204, 170, 0)' },
  { label: '5', color: 'rgb(0, 128, 0)' },
  { label: '10', color: 'rgb(7, 171, 255)' },
  { label: '20', color: 'rgb(0, 0, 255)' },
  { label: '40', color: 'rgb(255, 0, 255)' },
  { label: '60', color: 'rgb(213, 0, 0)' },
  { label: '85', color: 'rgb(51, 51, 51)' },
]

// 이 레이어들은 공유 레이어 레지스트리(features/map/layerActions.js)에 연동됨.
// id 추가/삭제 시 layerActions.test.js 커버리지 테스트가 동기화를 강제한다.
export const MET_LAYERS = [
  // ponytail: 기상청이 그려주는 합성영상 두 종류를 임시로 붙여 비교 중이다. 쓸지 결정되면
  // 하나로 정리하거나 우리 렌더링으로 되돌린다.
  { id: 'radarHsr', label: '레이더', color: '#38bdf8' },
  { id: 'radarHci', label: '강수 형태', color: '#0ea5e9' },
  { id: 'radarOverseas', label: 'Radar(해외)', color: '#38bdf8' },
  { id: 'echoTop', label: '에코탑(재산출)', color: '#7E22CE' },
  { id: 'satellite', label: '적외영상', color: '#64748b' },
  { id: 'satelliteVisible', label: '가시영상', color: '#94a3b8' },
  { id: 'ci', label: '대류 가능성', color: '#F6C945' },
  { id: 'ctps', label: '구름 꼭대기', color: '#7E22CE' },
  { id: 'lightning', label: 'Lightning', color: '#facc15' },
  { id: 'wind', label: 'Wind', color: '#22c55e' },
  { id: 'temp', label: 'Temp', color: '#ef4444' },
  { id: 'cloud', label: 'Moisture', color: 'rgba(49, 124, 62, 0.7)' },
  { id: 'icing', label: 'Icing Potential', color: 'rgba(220, 75, 116, 0.74)' },
  { id: 'turbulence', label: 'Turbulence', color: 'rgba(251, 146, 60, 0.85)' },
  { id: 'sigmet', label: 'SIGMET', color: ADVISORY_LAYER_DEFS.sigmet.color },
  { id: 'sigmet_intl', label: 'SIGMET(해외)', color: ADVISORY_LAYER_DEFS.sigmet_intl.color },
  { id: 'airmet', label: 'AIRMET', color: ADVISORY_LAYER_DEFS.airmet.color },
  { id: 'sigwx', label: 'SIGWX', color: '#a78bfa' },
  { id: 'typhoon', label: '태풍', color: '#dc2626' },   // TYPHOON_PALETTE[0]과 같은 값
  { id: 'visibility', label: '시정', color: '#f97316' },
  { id: 'ceiling', label: '운고', color: '#dc2626' },
  { id: 'terrainHazard', label: '지형 근접', color: '#dc2626' },
  { id: 'notam', label: 'NOTAM', color: '#334155' },
]

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }
const pendingMapImages = new WeakMap()
const addedMapImages = new WeakMap()
const loadedMapImages = new Map()
const sigwxIconUrlsById = new Map()
const styleImageMissingBoundMaps = new WeakSet()
const lightningFrameSyncs = new WeakMap()

function registerSigwxIconImages(images = []) {
  images.forEach(({ id, url }) => {
    if (id && url) sigwxIconUrlsById.set(id, url)
  })
}

export function bindSigwxStyleImageMissing(map) {
  if (!map?.on || styleImageMissingBoundMaps.has(map)) return
  styleImageMissingBoundMaps.add(map)
  map.on('styleimagemissing', (event) => {
    const id = event?.id
    const url = sigwxIconUrlsById.get(id)
    if (!url) return
    ensureMapImage(map, { id, url })
  })
}

export function ensureMapImage(map, { id, url }) {
  if (!id || !url || map.hasImage(id)) return
  const cachedImage = loadedMapImages.get(url)
  if (cachedImage) {
    map.addImage(id, cachedImage)
    let addedImages = addedMapImages.get(map)
    if (!addedImages) {
      addedImages = new Map()
      addedMapImages.set(map, addedImages)
    }
    addedImages.set(id, url)
    return
  }

  let addedImages = addedMapImages.get(map)
  if (!addedImages) {
    addedImages = new Map()
    addedMapImages.set(map, addedImages)
  }
  if (addedImages.get(id) === url) return

  let pendingImages = pendingMapImages.get(map)
  if (!pendingImages) {
    pendingImages = new Map()
    pendingMapImages.set(map, pendingImages)
  }
  if (pendingImages.get(id) === url) return

  pendingImages.set(id, url)
  map.loadImage(url, (error, image) => {
    if (pendingImages.get(id) === url) {
      pendingImages.delete(id)
    }
    if (error || !image || map.hasImage(id)) return
    loadedMapImages.set(url, image)
    map.addImage(id, image)
    addedImages.set(id, url)
  })
}

export function createSigwxChipImage({ fill, stroke }) {
  const width = 64
  const height = 26
  const radius = 6
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.beginPath()
  ctx.moveTo(radius, 1)
  ctx.lineTo(width - radius - 1, 1)
  ctx.quadraticCurveTo(width - 1, 1, width - 1, radius)
  ctx.lineTo(width - 1, height - radius - 1)
  ctx.quadraticCurveTo(width - 1, height - 1, width - radius - 1, height - 1)
  ctx.lineTo(radius, height - 1)
  ctx.quadraticCurveTo(1, height - 1, 1, height - radius - 1)
  ctx.lineTo(1, radius)
  ctx.quadraticCurveTo(1, 1, radius, 1)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
  return ctx.getImageData(0, 0, width, height)
}

export function ensureSigwxChipImages(map) {
  const images = [
    { id: 'sigwx-chip-neutral', fill: 'rgba(255,255,255,0.96)', stroke: '#111827' },
    { id: 'sigwx-chip-green', fill: 'rgba(236, 253, 245, 0.96)', stroke: '#16a34a' },
    { id: 'sigwx-chip-blue', fill: 'rgba(239, 246, 255, 0.96)', stroke: '#2563eb' },
    { id: 'sigwx-chip-orange', fill: 'rgba(255, 247, 237, 0.96)', stroke: '#ea580c' },
  ]

  images.forEach((image) => {
    if (map.hasImage(image.id)) return
    const data = createSigwxChipImage(image)
    if (!data || map.hasImage(image.id)) return
    map.addImage(image.id, data, { pixelRatio: 2 })
  })
}

export function buildSigwxDashArrayExpression() {
  return [
    'match',
    ['get', 'lineType'],
    '2', ['literal', [8, 6]],
    '3', ['literal', [10, 6]],
    '4', ['literal', [10, 4, 2, 4]],
    '5', ['literal', [14, 8]],
    '6', ['literal', [16, 6]],
    '7', ['literal', [12, 4, 2, 4, 2, 4]],
    '8', ['literal', [18, 6]],
    '301', ['literal', [10, 6]],
    '302', ['literal', [10, 6]],
    '303', ['literal', [10, 6]],
    '304', ['literal', [10, 6]],
    '310', ['literal', [10, 6]],
    ['literal', [1, 0]],
  ]
}

export function addOrUpdateSigwxLowLayers(map, data, { loadIcons = true } = {}) {
  bindSigwxStyleImageMissing(map)
  registerSigwxIconImages(data?.iconImages)
  ensureSigwxChipImages(map)
  addOrUpdateGeoJsonSource(map, SIGWX_POLYGON_SOURCE, data?.polygons || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_LINE_SOURCE, data?.lines || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_LABEL_SOURCE, data?.labels || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_ICON_SOURCE, data?.icons || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_ARROW_LABEL_SOURCE, data?.arrowLabels || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_TEXT_CHIP_SOURCE, data?.textChips || EMPTY_GEOJSON)

  if (loadIcons) {
    data?.iconImages?.forEach((image) => ensureMapImage(map, image))
  }

  if (!map.getLayer(SIGWX_POLYGON_LAYER)) {
    map.addLayer({
      id: SIGWX_POLYGON_LAYER,
      type: 'fill',
      source: SIGWX_POLYGON_SOURCE,
      slot: 'top',
      paint: {
        'fill-color': ['coalesce', ['get', 'colorBack'], '#a78bfa'],
        'fill-opacity': 0.12,
      },
    })
  }

  if (!map.getLayer(SIGWX_POLYGON_OUTLINE_LAYER)) {
    map.addLayer({
      id: SIGWX_POLYGON_OUTLINE_LAYER,
      type: 'line',
      source: SIGWX_POLYGON_SOURCE,
      slot: 'top',
      paint: {
        'line-color': ['coalesce', ['get', 'colorLine'], '#7c3aed'],
        'line-opacity': 0.95,
        'line-width': ['coalesce', ['get', 'lineWidth'], 2],
        'line-dasharray': buildSigwxDashArrayExpression(),
      },
    })
  }

  if (!map.getLayer(SIGWX_LINE_LAYER)) {
    map.addLayer({
      id: SIGWX_LINE_LAYER,
      type: 'line',
      source: SIGWX_LINE_SOURCE,
      slot: 'top',
      paint: {
        'line-color': ['coalesce', ['get', 'colorLine'], '#7c3aed'],
        'line-opacity': 0.95,
        'line-width': ['coalesce', ['get', 'lineWidth'], 2],
        'line-dasharray': buildSigwxDashArrayExpression(),
      },
    })
  }

  if (!map.getLayer(SIGWX_ICON_LAYER)) {
    map.addLayer({
      id: SIGWX_ICON_LAYER,
      type: 'symbol',
      source: SIGWX_ICON_SOURCE,
      slot: 'top',
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': ['coalesce', ['get', 'iconScale'], 0.82],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }

  if (!map.getLayer(SIGWX_LABEL_LAYER)) {
    map.addLayer({
      id: SIGWX_LABEL_LAYER,
      type: 'symbol',
      source: SIGWX_LABEL_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#2d1b69',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }

  if (!map.getLayer(SIGWX_ARROW_LABEL_LAYER)) {
    map.addLayer({
      id: SIGWX_ARROW_LABEL_LAYER,
      type: 'symbol',
      source: SIGWX_ARROW_LABEL_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    })
  }

  if (!map.getLayer(SIGWX_TEXT_CHIP_LAYER)) {
    map.addLayer({
      id: SIGWX_TEXT_CHIP_LAYER,
      type: 'symbol',
      source: SIGWX_TEXT_CHIP_SOURCE,
      slot: 'top',
      layout: {
        'icon-image': [
          'match',
          ['get', 'chipTone'],
          'green', 'sigwx-chip-green',
          'blue', 'sigwx-chip-blue',
          'orange', 'sigwx-chip-orange',
          'sigwx-chip-neutral',
        ],
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [5, 7, 5, 7],
        'text-field': ['get', 'chipText'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'chipTone'],
          'green', '#166534',
          'blue', '#1d4ed8',
          'orange', '#c2410c',
          '#111827',
        ],
      },
    })
  }
}

export function setSigwxLowVisibility(map, isVisible) {
  SIGWX_VECTOR_LAYERS.forEach((layerId) => setMapLayerVisible(map, layerId, isVisible))
}

export function syncRasterAndSigwxLayers(map, model, { syncRaster = syncRasterFrame } = {}) {
  syncRaster(map, {
    sourceId: SATELLITE_SOURCE,
    layerId: SATELLITE_LAYER,
    frame: model.satelliteFrame,
    opacity: 1,
    beforeLayerId: 'gk2a-visible-overlay',
    visible: Boolean(model.visibility.satellite && model.satelliteFrame),
    transitionMs: 200,
  })
  const hasRadar = addOrUpdateImageOverlay(map, {
    sourceId: RADAR_SOURCE,
    layerId: RADAR_LAYER,
    frame: model.radarFrame,
    opacity: 0.88,
  })
  syncWissdomLayer(map, model, { syncRaster })
  syncQpfLayer(map, model, { syncRaster })
  // 해외 레이더 — 국내와 상호배타라 z-order 다툼이 없다. 프레임이 없으면(커버 시간 밖) 스스로 숨는다.
  syncRainviewerLayers(map, {
    meta: model.rainviewerMeta,
    frame: model.rainviewerFrame,
    visible: !!model.visibility.radarOverseas,
  })
  const hasSigwx = addOrUpdateImageOverlay(map, {
    sourceId: SIGWX_SOURCE,
    layerId: SIGWX_LAYER,
    frame: model.selectedSigwxFrontMeta,
    opacity: 0.85,
  })
  const hasSigwxCloud = addOrUpdateImageOverlay(map, {
    sourceId: SIGWX_CLOUD_SOURCE,
    layerId: SIGWX_CLOUD_LAYER,
    frame: model.selectedSigwxCloudMeta,
    opacity: 0.65,
  })

  addOrUpdateSigwxLowLayers(map, model.sigwxLowMapData, { loadIcons: model.visibility.sigwx })
  setMapLayerVisible(map, RADAR_LAYER, hasRadar && model.visibility.radar)
  setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && model.visibility.sigwx && model.showVisibleSigwxFrontOverlay)
  setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && model.visibility.sigwx && model.showVisibleSigwxCloudOverlay)
  setSigwxLowVisibility(map, model.visibility.sigwx)
}

export function syncAdvisoryLayers(map, model) {
  updateAdvisoryLayerData(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  updateAdvisoryLayerData(map, 'sigmet_intl', model.sigmetIntlFeatures, model.sigmetIntlLabels)
  updateAdvisoryLayerData(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'sigmet_intl', model.visibility.sigmet_intl)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}
export function installAdvisoryLayers(map, model) {
  addAdvisoryLayers(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  addAdvisoryLayers(map, 'sigmet_intl', model.sigmetIntlFeatures, model.sigmetIntlLabels)
  addAdvisoryLayers(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'sigmet_intl', model.visibility.sigmet_intl)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}

export function installWeatherOverlayLayers(map) {
  addOrUpdateSigwxLowLayers(map, null)
  installAdvisoryLayers(map, {
    sigmetFeatures: EMPTY_GEOJSON,
    sigmetLabels: EMPTY_GEOJSON,
    sigmetIntlFeatures: EMPTY_GEOJSON,
    sigmetIntlLabels: EMPTY_GEOJSON,
    airmetFeatures: EMPTY_GEOJSON,
    airmetLabels: EMPTY_GEOJSON,
    visibility: { sigmet: false, sigmet_intl: false, airmet: false },
  })
  syncLightningLayers(map, {
    lightningGeoJSON: EMPTY_GEOJSON,
    visibility: { lightning: false },
    blinkLightning: false,
    lightningBlinkOff: false,
  })
}

export function syncLightningLayers(map, model) {
  addLightningLayers(map, model.lightningGeoJSON)
  let frameSync = lightningFrameSyncs.get(map)
  if (!frameSync) {
    frameSync = createLightningFrameSync(map)
    lightningFrameSyncs.set(map, frameSync)
  }
  void frameSync.sync({
    geojson: model.lightningGeoJSON,
    visible: model.visibility.lightning,
    frameKey: String(model.lightningReferenceTimeMs ?? ''),
  })
  setLightningVisibility(map, model.visibility.lightning)
  setLightningBlinkState(map, model.visibility.lightning && model.blinkLightning && model.lightningBlinkOff)
}
