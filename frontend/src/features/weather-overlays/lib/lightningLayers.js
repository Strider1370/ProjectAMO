import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const LIGHTNING_SOURCE = 'kma-lightning'
export const LIGHTNING_GROUND_LAYER = 'kma-lightning-ground'
export const LIGHTNING_CLOUD_LAYER = 'kma-lightning-cloud'
export const LIGHTNING_BLINK_INTERVAL_MS = 800
export const LIGHTNING_TIME_WINDOW_MINUTES = 60
export const LIGHTNING_AGE_BANDS = [
  { min: 0, max: 10, color: '#ff1f1f', opacity: 1, iconId: 'lightning-0-10' },
  { min: 10, max: 20, color: '#ff00ff', opacity: 0.92, iconId: 'lightning-10-20' },
  { min: 20, max: 30, color: '#2f55ff', opacity: 0.85, iconId: 'lightning-20-30' },
  { min: 30, max: 40, color: '#1dd9e6', opacity: 0.78, iconId: 'lightning-30-40' },
  { min: 40, max: 50, color: '#25d90a', opacity: 0.7, iconId: 'lightning-40-50' },
  { min: 50, max: 60, color: '#ffeb00', opacity: 0.62, iconId: 'lightning-50-60' },
]

export function getLightningAgeBand(ageMinutes) {
  return LIGHTNING_AGE_BANDS.find((band) => ageMinutes >= band.min && ageMinutes < band.max) ?? null
}

export function createLightningCrossImage(color) {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.translate(size / 2, size / 2)
  ctx.lineCap = 'round'

  // Black outline for contrast against raster backgrounds.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()

  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()

  return ctx.getImageData(0, 0, size, size)
}

export function ensureLightningIcons(map) {
  LIGHTNING_AGE_BANDS.forEach((band) => {
    if (map.hasImage(band.iconId)) return
    const image = createLightningCrossImage(band.color)
    if (!image) return
    map.addImage(band.iconId, image)
  })
}

export function buildLightningOpacityExpression(blinkOff = false) {
  if (blinkOff) return 0
  return [
    'coalesce',
    ['get', 'opacity'],
    1,
  ]
}

export function createLightningGeoJSON(lightningData, referenceTimeMs) {
  const strikes = lightningData?.nationwide?.strikes || lightningData?.strikes || []
  const baseTimeMs = Number.isFinite(referenceTimeMs) ? referenceTimeMs : Date.now()
  return {
    type: 'FeatureCollection',
    features: strikes
      .filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
      .map((s) => {
        const strikeTimeMs = new Date(s.time).getTime()
        if (!Number.isFinite(strikeTimeMs)) return null
        const ageMinutes = (baseTimeMs - strikeTimeMs) / 60000
        if (ageMinutes < 0 || ageMinutes > LIGHTNING_TIME_WINDOW_MINUTES) return null
        const band = getLightningAgeBand(ageMinutes)
        if (!band) return null
        return { s, ageMinutes, band }
      })
      .filter(Boolean)
      .map((s, i) => ({
        type: 'Feature',
        id: i,
        properties: {
          type: s.s.type_name || (s.s.type === 'G' ? 'ground' : 'cloud'),
          ageMinutes: Number(s.ageMinutes.toFixed(1)),
          iconId: s.band.iconId,
          iconKey: s.band.iconId,
          opacity: s.band.opacity,
        },
        geometry: { type: 'Point', coordinates: [s.s.lon, s.s.lat] },
      })),
  }
}

export function addLightningLayers(map, data) {
  ensureLightningIcons(map)

  if (!map.getSource(LIGHTNING_SOURCE)) {
    map.addSource(LIGHTNING_SOURCE, { type: 'geojson', data })
  }
  if (!map.getLayer(LIGHTNING_GROUND_LAYER)) {
    map.addLayer({
      id: LIGHTNING_GROUND_LAYER, type: 'symbol', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'ground'],
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 0.62,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': buildLightningOpacityExpression(false) },
    })
  }
  if (!map.getLayer(LIGHTNING_CLOUD_LAYER)) {
    map.addLayer({
      id: LIGHTNING_CLOUD_LAYER, type: 'symbol', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'cloud'],
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 0.48,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': buildLightningOpacityExpression(false) },
    })
  }
}

export function setLightningVisibility(map, isVisible) {
  setMapLayerVisible(map, LIGHTNING_GROUND_LAYER, isVisible)
  setMapLayerVisible(map, LIGHTNING_CLOUD_LAYER, isVisible)
}

export function setLightningBlinkState(map, blinkOff) {
  if (map.getLayer(LIGHTNING_GROUND_LAYER)) {
    map.setPaintProperty(LIGHTNING_GROUND_LAYER, 'icon-opacity', buildLightningOpacityExpression(blinkOff))
  }
  if (map.getLayer(LIGHTNING_CLOUD_LAYER)) {
    map.setPaintProperty(LIGHTNING_CLOUD_LAYER, 'icon-opacity', buildLightningOpacityExpression(blinkOff))
  }
}
