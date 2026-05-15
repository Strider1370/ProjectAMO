import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from './advisoryLayers.js'
import {
  LIGHTNING_SOURCE,
  addLightningLayers,
  setLightningBlinkState,
  setLightningVisibility,
} from './lightningLayers.js'

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
  ADVISORY_LAYER_DEFS.airmet.sourceId,
  `${ADVISORY_LAYER_DEFS.airmet.sourceId}-labels`,
]
export const WEATHER_OVERLAY_LAYER_IDS = [
  SATELLITE_LAYER,
  RADAR_LAYER,
  SIGWX_LAYER,
  SIGWX_CLOUD_LAYER,
  ...SIGWX_VECTOR_LAYERS,
  ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
  ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
  ADVISORY_LAYER_DEFS.sigmet.labelLayerId,
  ADVISORY_LAYER_DEFS.sigmet.iconLayerId,
  ADVISORY_LAYER_DEFS.airmet.fillLayerId,
  ADVISORY_LAYER_DEFS.airmet.lineLayerId,
  ADVISORY_LAYER_DEFS.airmet.labelLayerId,
  ADVISORY_LAYER_DEFS.airmet.iconLayerId,
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

export const MET_LAYERS = [
  { id: 'radar', label: 'Radar', color: '#38bdf8' },
  { id: 'satellite', label: 'Satellite', color: '#64748b' },
  { id: 'lightning', label: 'Lightning', color: '#facc15' },
  { id: 'sigmet', label: 'SIGMET', color: ADVISORY_LAYER_DEFS.sigmet.color },
  { id: 'airmet', label: 'AIRMET', color: ADVISORY_LAYER_DEFS.airmet.color },
  { id: 'sigwx', label: 'SIGWX', color: '#a78bfa' },
  { id: 'adsb', label: 'ADS-B', color: '#10b981' },
]

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

export function ensureMapImage(map, { id, url }) {
  if (!id || !url || map.hasImage(id)) return
  map.loadImage(url, (error, image) => {
    if (error || !image || map.hasImage(id)) return
    map.addImage(id, image)
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

export function addOrUpdateSigwxLowLayers(map, data) {
  ensureSigwxChipImages(map)
  addOrUpdateGeoJsonSource(map, SIGWX_POLYGON_SOURCE, data?.polygons || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_LINE_SOURCE, data?.lines || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_LABEL_SOURCE, data?.labels || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_ICON_SOURCE, data?.icons || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_ARROW_LABEL_SOURCE, data?.arrowLabels || EMPTY_GEOJSON)
  addOrUpdateGeoJsonSource(map, SIGWX_TEXT_CHIP_SOURCE, data?.textChips || EMPTY_GEOJSON)

  data?.iconImages?.forEach((image) => ensureMapImage(map, image))

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

export function syncRasterAndSigwxLayers(map, model) {
  const hasSat = addOrUpdateImageOverlay(map, {
    sourceId: SATELLITE_SOURCE,
    layerId: SATELLITE_LAYER,
    frame: model.satelliteFrame,
    opacity: 0.92,
  })
  const hasRadar = addOrUpdateImageOverlay(map, {
    sourceId: RADAR_SOURCE,
    layerId: RADAR_LAYER,
    frame: model.radarFrame,
    opacity: 0.88,
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

  addOrUpdateSigwxLowLayers(map, model.sigwxLowMapData)
  setMapLayerVisible(map, SATELLITE_LAYER, hasSat && model.visibility.satellite)
  setMapLayerVisible(map, RADAR_LAYER, hasRadar && model.visibility.radar)
  setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && model.visibility.sigwx && model.showVisibleSigwxFrontOverlay)
  setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && model.visibility.sigwx && model.showVisibleSigwxCloudOverlay)
  setSigwxLowVisibility(map, model.visibility.sigwx)
}

export function syncAdvisoryLayers(map, model) {
  updateAdvisoryLayerData(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  updateAdvisoryLayerData(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}

export function installAdvisoryLayers(map, model) {
  addAdvisoryLayers(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  addAdvisoryLayers(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}

export function syncLightningLayers(map, model) {
  addLightningLayers(map, model.lightningGeoJSON)
  map.getSource(LIGHTNING_SOURCE)?.setData(model.lightningGeoJSON)
  setLightningVisibility(map, model.visibility.lightning)
  setLightningBlinkState(map, model.visibility.lightning && model.blinkLightning && model.lightningBlinkOff)
}
