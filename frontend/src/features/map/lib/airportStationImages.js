import { getWeatherIconSrc } from '../../../shared/weather/weather-icon-registry.js'
import { AIRPORT_STATION_RADIUS, AIRPORT_STATION_HALO_WIDTH } from './airportMarkerSizing.js'
import {
  AIRPORT_CATEGORY_COLORS,
  AIRPORT_CATEGORY_UNKNOWN_COLOR,
} from './airportStationModel.js'

const STATION_SKY_COVERS = ['clear', 'few', 'sct', 'bkn', 'ovc']
const STATION_CATEGORIES = [
  ['vfr', AIRPORT_CATEGORY_COLORS.VFR],
  ['ifr', AIRPORT_CATEGORY_COLORS.IFR],
  ['lifr', AIRPORT_CATEGORY_COLORS.LIFR],
  ['unknown', AIRPORT_CATEGORY_UNKNOWN_COLOR],
]
const WIND_BUCKETS = Array.from({ length: 12 }, (_, index) => (index + 1) * 5)
const WEATHER_ICON_PREFIX = 'airport-wx-'

function getPixelRatio() {
  return Math.max(1, Math.round(window.devicePixelRatio || 1))
}

function createCanvasImage(draw, logicalSize) {
  const pixelRatio = getPixelRatio()
  const canvas = document.createElement('canvas')
  canvas.width = logicalSize * pixelRatio
  canvas.height = logicalSize * pixelRatio
  const context = canvas.getContext('2d', { alpha: true })
  context.scale(pixelRatio, pixelRatio)
  draw(context, logicalSize)
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width, height, pixelRatio }
}

function fillStationCover(context, centerX, centerY, radius, skyCover, color) {
  if (skyCover === 'clear') return

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.clip()
  context.fillStyle = color

  if (skyCover === 'ovc') {
    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    context.fill()
  } else {
    let endAngle = 0
    if (skyCover === 'few') endAngle = 0
    if (skyCover === 'sct') endAngle = Math.PI / 2
    if (skyCover === 'bkn') endAngle = Math.PI
    context.beginPath()
    context.moveTo(centerX, centerY)
    context.arc(centerX, centerY, radius, -Math.PI / 2, endAngle)
    context.closePath()
    context.fill()
  }

  context.restore()
}

function createStationImage(color, skyCover) {
  return createCanvasImage((context, size) => {
    const centerX = size / 2
    const centerY = size / 2
    const strokeRadius = AIRPORT_STATION_RADIUS
    const fillRadius = 5.8

    context.lineCap = 'round'
    context.lineJoin = 'round'

    context.beginPath()
    context.arc(centerX, centerY, strokeRadius, 0, Math.PI * 2)
    context.strokeStyle = '#ffffff'
    context.lineWidth = AIRPORT_STATION_HALO_WIDTH
    context.stroke()

    context.beginPath()
    context.arc(centerX, centerY, strokeRadius - 0.6, 0, Math.PI * 2)
    context.fillStyle = '#ffffff'
    context.fill()

    fillStationCover(context, centerX, centerY, fillRadius, skyCover, color)

    context.beginPath()
    context.arc(centerX, centerY, strokeRadius, 0, Math.PI * 2)
    context.strokeStyle = color
    context.lineWidth = 1.6
    context.stroke()
  }, 48)
}

function createWindBarbImage(speedKt) {
  return createCanvasImage((context, size) => {
    const centerX = size / 2
    const centerY = size / 2
    const stemStartY = centerY - 10
    const stemLength = 28
    const fullBarbLength = 12
    const halfBarbLength = 6
    const barbSpacing = 5
    const angleRad = (60 * Math.PI) / 180
    const tipY = stemStartY - stemLength
    const bareTipLength = 3
    const featherStartY = tipY + bareTipLength
    const bucket = Math.min(60, Math.max(5, Math.round(speedKt / 5) * 5))
    let remaining = bucket
    const flags = Math.floor(remaining / 50)
    remaining -= flags * 50
    const fullBarbs = Math.floor(remaining / 10)
    remaining -= fullBarbs * 10
    const halfBarbs = remaining >= 5 ? 1 : 0

    const drawPass = (strokeStyle, lineWidth) => {
      context.strokeStyle = strokeStyle
      context.lineWidth = lineWidth
      context.lineCap = 'round'
      context.lineJoin = 'round'

      context.beginPath()
      context.moveTo(centerX, stemStartY)
      context.lineTo(centerX, tipY)
      context.stroke()

      const drawBarb = (attachY, length) => {
        const dx = length * Math.sin(angleRad)
        const dy = length * Math.cos(angleRad)
        context.beginPath()
        context.moveTo(centerX, attachY)
        context.lineTo(centerX - dx, attachY + dy)
        context.stroke()
      }

      const drawPennant = (attachY) => {
        const dx = fullBarbLength * Math.sin(angleRad)
        const dy = fullBarbLength * Math.cos(angleRad)
        const nextY = attachY + (barbSpacing * 2)
        context.fillStyle = strokeStyle
        context.beginPath()
        context.moveTo(centerX, attachY)
        context.lineTo(centerX - dx, attachY + dy)
        context.lineTo(centerX, nextY)
        context.closePath()
        context.fill()
        return nextY
      }

      let currentY = featherStartY
      for (let index = 0; index < flags; index += 1) {
        currentY = drawPennant(currentY)
      }

      for (let index = 0; index < fullBarbs; index += 1) {
        drawBarb(currentY, fullBarbLength)
        currentY += barbSpacing
      }

      if (halfBarbs > 0) {
        drawBarb(currentY, halfBarbLength)
      }
    }

    drawPass('#ffffff', 4)
    drawPass('#0f172a', 2)
  }, 72)
}

function ensureMapImage(map, imageId, image) {
  if (map.hasImage(imageId)) return
  map.addImage(imageId, image, { pixelRatio: image.pixelRatio })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function createWeatherImage(iconId) {
  const image = await loadImageElement(getWeatherIconSrc(iconId))
  return createCanvasImage((context, size) => {
    const imageInset = 5
    const imageSize = size - (imageInset * 2)

    context.clearRect(0, 0, size, size)
    context.save()
    context.globalAlpha = 0.28
    for (const [offsetX, offsetY] of [
      [-1.5, 0],
      [1.5, 0],
      [0, -1.5],
      [0, 1.5],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      context.drawImage(
        image,
        imageInset + offsetX,
        imageInset + offsetY,
        imageSize,
        imageSize,
      )
    }
    context.restore()

    context.save()
    context.shadowColor = 'rgba(15, 23, 42, 0.3)'
    context.shadowBlur = 6
    context.shadowOffsetY = 1.5
    context.drawImage(image, imageInset, imageInset, imageSize, imageSize)
    context.restore()
  }, 48)
}

export function registerAirportStationImages(map) {
  STATION_CATEGORIES.forEach(([categoryKey, color]) => {
    STATION_SKY_COVERS.forEach((skyCover) => {
      const imageId = `airport-station-${categoryKey}-${skyCover}`
      ensureMapImage(map, imageId, createStationImage(color, skyCover))
    })
  })
}

export function registerAirportWindBarbImages(map) {
  WIND_BUCKETS.forEach((speedKt) => {
    const imageId = `airport-wind-${String(speedKt).padStart(3, '0')}`
    ensureMapImage(map, imageId, createWindBarbImage(speedKt))
  })
}

export async function registerAirportWeatherImages(map, imageIds = []) {
  const uniqueIds = [...new Set(imageIds.filter(Boolean))]
  await Promise.all(uniqueIds.map(async (imageId) => {
    if (map.hasImage(imageId)) return
    const iconId = imageId.startsWith(WEATHER_ICON_PREFIX)
      ? imageId.slice(WEATHER_ICON_PREFIX.length)
      : imageId
    try {
      ensureMapImage(map, imageId, await createWeatherImage(iconId))
    } catch {
      ensureMapImage(map, imageId, await createWeatherImage('unknown'))
    }
  }))
}
