import {
  createDownsampledWindField,
  createWindFieldSampler,
  effectiveWindSpeedFactor,
  getWindFieldMeanSpeed,
  pickWindSpeedColor,
} from './windField.js'

const DEFAULTS = {
  desktopCap: 4000,
  mobileCap: 1400,
  lowPowerCap: 800,
  maxAge: 80,
  speedFactor: 0.45,
  zoomSpeedReference: null,
  frameCap: 30,
  speedOpacity: 0.35,
  sampleStep: 3,
  pixelRatioCap: 2,
  flowColor: 'rgba(208, 216, 226, 0.66)',
  flowColorMode: 'neutral',
  flowOpacity: 0.66,
  flowWidth: 1.25,
  trailPersistence: 0.87,
  particleDensityScale: 0.8,
  adaptiveParticleDensity: false,
  zoomAdaptiveDensity: false,
  samplerLod: false,
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isMobileViewport(width) {
  return width < 720
}

function getBackingStorePixelRatio(cap) {
  const dpr = window.devicePixelRatio || 1
  return Math.max(1, Math.min(dpr, cap || dpr))
}

function withAlpha(color, alpha) {
  const nextAlpha = clamp(Number(alpha), 0.2, 1)
  const match = String(color).match(/rgba?\(([^)]+)\)/)
  if (!match) return `rgba(208, 216, 226, ${nextAlpha})`
  const [r, g, b] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return `rgba(${r}, ${g}, ${b}, ${nextAlpha})`
}

function getDensityFactor(windField, enabled) {
  if (!enabled) return 1
  const meanSpeed = getWindFieldMeanSpeed(windField)
  if (meanSpeed == null) return 1
  if (meanSpeed < 2) return 0.6
  if (meanSpeed < 5) return 0.75
  if (meanSpeed < 8) return 0.9
  return 1
}

function getZoomDensityFactor(map, enabled) {
  if (!enabled) return 1
  const zoom = map.getZoom?.()
  if (!Number.isFinite(zoom) || zoom <= 5) return 1
  if (zoom >= 11) return 0.65
  if (zoom <= 7) return 1 - ((zoom - 5) / 2) * 0.1
  if (zoom <= 9) return 0.9 - ((zoom - 7) / 2) * 0.15
  return 0.75 - ((zoom - 9) / 2) * 0.1
}

function getSamplerLodFactor(map, options) {
  if (!options.samplerLod) return 1
  if (Number.isFinite(options.samplerLodFactor)) return Math.max(1, Math.round(options.samplerLodFactor))
  const zoom = map.getZoom?.()
  if (!Number.isFinite(zoom)) return 1
  if (zoom <= 4) return 4
  if (zoom <= 6) return 2
  return 1
}

function makeParticle(bounds, maxAge) {
  return {
    lon: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
    lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
    age: Math.floor(Math.random() * maxAge),
    maxAge,
    prevX: null,
    prevY: null,
  }
}

function getParticleBounds(map, windField) {
  const mapBounds = map.getBounds()
  const grid = windField?.grid
  const west = Math.max(mapBounds.getWest(), grid?.lonMin ?? mapBounds.getWest())
  const east = Math.min(mapBounds.getEast(), grid?.lonMax ?? mapBounds.getEast())
  const south = Math.max(mapBounds.getSouth(), grid?.latMin ?? mapBounds.getSouth())
  const north = Math.min(mapBounds.getNorth(), grid?.latMax ?? mapBounds.getNorth())
  if (west >= east || south >= north) return null
  return {
    getWest: () => west,
    getEast: () => east,
    getSouth: () => south,
    getNorth: () => north,
  }
}

function containsPoint(bounds, lon, lat) {
  return !!bounds
    && lon >= bounds.getWest()
    && lon <= bounds.getEast()
    && lat >= bounds.getSouth()
    && lat <= bounds.getNorth()
}

function getParticleAgeAlpha(particle) {
  const fadeFrames = Math.max(1, particle.maxAge * 0.25)
  return clamp(Math.max(0, particle.maxAge - particle.age) / fadeFrames, 0, 1)
}

function createOverlayCanvas(role, zIndex) {
  const canvas = document.createElement('canvas')
  canvas.dataset.kimWindOverlay = role
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = zIndex
  return canvas
}

export class CanvasWindRenderer {
  constructor(map, options = {}) {
    this.type = 'canvas'
    this.map = map
    this.options = { ...DEFAULTS, ...options }
    this.container = map.getContainer()
    this.flowCanvas = createOverlayCanvas('flow', '4')
    this.ctx = this.flowCanvas.getContext('2d')
    this.container.appendChild(this.flowCanvas)
    this.particles = []
    this.windField = null
    this.samplerField = null
    this.sampler = { sample: () => null }
    this.visibility = { flow: false, speed: false }
    this.frameId = null
    this.lastFrameAt = 0
    this.destroyed = false
    this.resize()
  }

  setOptions(options = {}) {
    this.options = { ...DEFAULTS, ...options }
    if (this.windField) this.setSamplerField(this.windField)
    this.ensureParticles()
  }

  setData(windField) {
    this.windField = windField
    this.setSamplerField(windField)
    this.ensureParticles()
  }

  setSamplerField(windField) {
    const factor = getSamplerLodFactor(this.map, this.options)
    if (this.samplerSourceField === windField && this.samplerLodFactor === factor) return
    this.samplerSourceField = windField
    this.samplerLodFactor = factor
    this.samplerField = createDownsampledWindField(windField, factor)
    this.sampler = createWindFieldSampler(this.samplerField)
  }

  setVisibility({ flow = false } = {}) {
    this.visibility = { flow, speed: false }
    this.flowCanvas.style.display = flow ? 'block' : 'none'
    if (flow) this.start()
    else this.stop()
    if (!flow && this.ctx) this.ctx.clearRect(0, 0, this.width, this.height)
  }

  resize() {
    const rect = this.container.getBoundingClientRect()
    const dpr = getBackingStorePixelRatio(this.options.pixelRatioCap)
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    this.flowCanvas.width = Math.round(width * dpr)
    this.flowCanvas.height = Math.round(height * dpr)
    if (this.ctx?.setTransform) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.width = width
    this.height = height
    this.ensureParticles()
  }

  ensureParticles() {
    if (!this.windField) return
    const densityFactor = getDensityFactor(this.windField, this.options.adaptiveParticleDensity)
      * getZoomDensityFactor(this.map, this.options.zoomAdaptiveDensity)
    const baseCap = isMobileViewport(this.width) ? this.options.mobileCap : this.options.desktopCap
    const densityScale = clamp(this.options.particleDensityScale, 0.2, 1)
    const cap = Math.max(1, Math.round(baseCap * densityFactor * densityScale))
    const count = clamp(Math.round((this.width * this.height) / 450 * densityScale), 1, cap)
    const bounds = getParticleBounds(this.map, this.windField)
    if (!bounds) {
      this.particles.length = 0
      return
    }
    while (this.particles.length < count) {
      this.particles.push(makeParticle(bounds, this.options.maxAge))
    }
    if (this.particles.length > count) this.particles.length = count
  }

  start() {
    if (this.frameId || !this.windField) return
    this.frameId = window.requestAnimationFrame((time) => this.frame(time))
  }

  stop() {
    if (!this.frameId) return
    window.cancelAnimationFrame(this.frameId)
    this.frameId = null
  }

  destroy() {
    this.stop()
    this.destroyed = true
    if (this.flowCanvas.parentNode) this.flowCanvas.parentNode.removeChild(this.flowCanvas)
  }

  redraw() {}

  frame(time) {
    this.frameId = null
    if (!this.visibility.flow) return
    const minFrameMs = 1000 / this.options.frameCap
    if (!this.lastFrameAt || time - this.lastFrameAt >= minFrameMs) {
      this.stepParticles()
      this.lastFrameAt = time
    }
    this.frameId = window.requestAnimationFrame((nextTime) => this.frame(nextTime))
  }

  redrawForMapInteraction() {
    if (this.visibility.flow) {
      this.setSamplerField(this.windField)
      this.ensureParticles()
      this.drawParticleSnapshot()
    }
  }

  drawParticleSnapshot() {
    if (!this.ctx || !this.windField) return
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.lineWidth = clamp(this.options.flowWidth, 0.6, 2.4)
    this.ctx.globalAlpha = 0.78
    const bounds = getParticleBounds(this.map, this.windField)
    if (!bounds) return
    const speedFactor = effectiveWindSpeedFactor(this.map, this.options)

    for (const particle of this.particles) {
      const vector = this.sampler.sample(particle.lon, particle.lat)
      if (!vector) continue

      const from = this.map.project([particle.lon, particle.lat])
      const nextLon = particle.lon + vector.u * speedFactor * 0.002
      const nextLat = particle.lat + vector.v * speedFactor * 0.002
      if (!containsPoint(bounds, particle.lon, particle.lat) || !containsPoint(bounds, nextLon, nextLat)) continue
      const to = this.map.project([nextLon, nextLat])

      this.ctx.globalAlpha = 0.78 * getParticleAgeAlpha(particle)
      this.ctx.strokeStyle = this.getFlowColor(vector)
      this.ctx.beginPath()
      this.ctx.moveTo(from.x, from.y)
      this.ctx.lineTo(to.x, to.y)
      this.ctx.stroke()
    }
    this.ctx.globalAlpha = 1
  }

  stepParticles() {
    if (!this.ctx || !this.windField) return
    const bounds = getParticleBounds(this.map, this.windField)
    if (!bounds) return
    const speedFactor = effectiveWindSpeedFactor(this.map, this.options)
    this.ctx.globalCompositeOperation = 'destination-in'
    this.ctx.fillStyle = `rgba(0, 0, 0, ${clamp(this.options.trailPersistence, 0.55, 0.94)})`
    this.ctx.fillRect(0, 0, this.width, this.height)
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.lineWidth = clamp(this.options.flowWidth, 0.6, 2.4)
    this.ctx.globalAlpha = 0.78

    for (const particle of this.particles) {
      const vector = this.sampler.sample(particle.lon, particle.lat)
      if (!vector || particle.age >= particle.maxAge) {
        Object.assign(particle, makeParticle(bounds, this.options.maxAge))
        continue
      }

      const from = this.map.project([particle.lon, particle.lat])
      const nextLon = particle.lon + vector.u * speedFactor * 0.002
      const nextLat = particle.lat + vector.v * speedFactor * 0.002
      if (!containsPoint(bounds, nextLon, nextLat)) {
        Object.assign(particle, makeParticle(bounds, this.options.maxAge))
        continue
      }
      particle.lon = nextLon
      particle.lat = nextLat
      const to = this.map.project([particle.lon, particle.lat])

      this.ctx.globalAlpha = 0.78 * getParticleAgeAlpha(particle)
      this.ctx.strokeStyle = this.getFlowColor(vector)
      this.ctx.beginPath()
      this.ctx.moveTo(from.x, from.y)
      this.ctx.lineTo(to.x, to.y)
      this.ctx.stroke()
      particle.prevX = to.x
      particle.prevY = to.y
      particle.age += 1
    }
    this.ctx.globalAlpha = 1
  }

  getFlowColor(vector) {
    if (this.options.flowColorMode === 'speed' && vector) {
      return withAlpha(pickWindSpeedColor(vector.speed).color, this.options.flowOpacity)
    }
    return withAlpha(this.options.flowColor, this.options.flowOpacity)
  }

}

export default CanvasWindRenderer
