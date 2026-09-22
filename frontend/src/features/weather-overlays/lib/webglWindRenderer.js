import {
  WIND_SPEED_COLOR_RAMP,
  createDownsampledWindField,
  createWindFieldSampler,
  decodeWindComponent,
  effectiveWindSpeedFactor,
  getWindFieldMeanSpeed,
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
  sampleStep: 4,
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

function parseRgbaColor(color) {
  const match = color.match(/rgba\(([^)]+)\)/)
  if (!match) return [1, 1, 1, 1]
  const [r, g, b, a = 1] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return [r / 255, g / 255, b / 255, a]
}

function createParticleFragmentShader() {
  const rampBranches = WIND_SPEED_COLOR_RAMP.map((entry) => {
    const color = parseRgbaColor(entry.color)
    const rgba = [color[0], color[1], color[2]]
    if (Number.isFinite(entry.max)) {
      return `  if (speed < ${entry.max.toFixed(1)}) return vec4(${rgba.join(', ')}, alpha);`
    }
    return `  return vec4(${rgba.join(', ')}, alpha);`
  }).join('\n')

  return `
precision mediump float;
varying float v_speed;
varying float v_alpha;
uniform vec4 u_flow_color;
uniform int u_flow_color_mode;
uniform float u_flow_opacity;

vec4 pickSpeedFlowColor(float speed, float alpha) {
${rampBranches}
}

void main() {
  if (u_flow_color_mode == 1) {
    vec4 color = pickSpeedFlowColor(v_speed, u_flow_opacity);
    gl_FragColor = vec4(color.rgb, color.a * v_alpha);
  } else {
    gl_FragColor = vec4(u_flow_color.rgb, u_flow_color.a * v_alpha) + vec4(0.0 * v_speed);
  }
}
`
}

const FADE_FRAGMENT_SHADER = `
precision mediump float;
uniform float u_fade_alpha;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, u_fade_alpha);
}
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog?.() || 'Shader compile failed'
    gl.deleteShader?.(shader)
    throw new Error(error)
  }
  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  let vertexShader
  let fragmentShader
  let program
  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog?.() || 'Program link failed')
    }
    return program
  } catch (error) {
    if (program) gl.deleteProgram?.(program)
    throw error
  } finally {
    if (vertexShader) gl.deleteShader?.(vertexShader)
    if (fragmentShader) gl.deleteShader?.(fragmentShader)
  }
}

function createVectorTextureData(windField) {
  const size = windField.grid.nx * windField.grid.ny * 4
  const data = new Uint8Array(size)
  for (let index = 0; index < windField.grid.nx * windField.grid.ny; index += 1) {
    const u = decodeWindComponent(windField.u[index], windField) ?? 0
    const v = decodeWindComponent(windField.v[index], windField) ?? 0
    const offset = index * 4
    data[offset] = Math.max(0, Math.min(255, Math.round(u * 8 + 128)))
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(v * 8 + 128)))
    data[offset + 2] = 0
    data[offset + 3] = 255
  }
  return data
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
    prevLon: null,
    prevLat: null,
    speed: 0,
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

const QUAD_VERTICES = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  1, 1,
])

const FULLSCREEN_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const PARTICLE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_speed;
attribute float a_alpha;
uniform vec2 u_resolution;
uniform float u_point_size;
varying float v_speed;
varying float v_alpha;
void main() {
  vec2 clip = ((a_position / u_resolution) * 2.0) - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_point_size;
  v_speed = a_speed;
  v_alpha = a_alpha;
}
`

export class WebGLWindRenderer {
  constructor(map, options = {}) {
    this.type = 'webgl'
    this.map = map
    this.options = { ...DEFAULTS, ...options }
    this.flowColor = parseRgbaColor(this.options.flowColor)
    this.flowColor[3] = clamp(this.options.flowOpacity, 0.2, 1)
    this.onFailure = options.onFailure
    this.container = map.getContainer()
    this.flowCanvas = createOverlayCanvas('webgl', '4')
    this.canvas = this.flowCanvas
    this.visibility = { flow: false, speed: false }
    this.windField = null
    this.samplerField = null
    this.sampler = { sample: () => null }
    this.particles = []
    this.segmentVertexCount = 0
    this.pointVertexCount = 0
    this.frameId = null
    this.lastFrameAt = 0
    this.destroyed = false
    this.failed = false
    this.activeUploadVersion = 0
    this.handleContextLost = (event) => {
      event.preventDefault?.()
      this.failed = true
      this.stop()
      this.onFailure?.()
    }

    try {
      this.container.appendChild(this.flowCanvas)
      const contextOptions = { alpha: true, preserveDrawingBuffer: true }
      this.gl = this.flowCanvas.getContext('webgl', contextOptions) || this.flowCanvas.getContext('experimental-webgl', contextOptions)
      if (!this.gl) throw new Error('WebGL unavailable')
      this.flowCanvas.addEventListener('webglcontextlost', this.handleContextLost)
      this.initResources()
      this.resize()
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  setOptions(options = {}) {
    this.options = { ...DEFAULTS, ...options }
    this.flowColor = parseRgbaColor(this.options.flowColor)
    this.flowColor[3] = clamp(this.options.flowOpacity, 0.2, 1)
    if (this.windField) this.setSamplerField(this.windField)
    this.ensureParticles()
    this.buildParticleGeometry()
    this.redraw()
  }

  initResources() {
    const gl = this.gl
    this.particleProgram = createProgram(gl, PARTICLE_VERTEX_SHADER, createParticleFragmentShader())
    this.fadeProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, FADE_FRAGMENT_SHADER)
    this.quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW)
    this.particleBuffer = gl.createBuffer()
    this.windTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.windTexture)
    gl.texParameteri(gl.TEXTURE_2D, 0x2801, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, 0x2800, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, 0x2802, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, 0x2803, gl.CLAMP_TO_EDGE)
    gl.enable?.(gl.BLEND)
    gl.blendFunc?.(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  }

  setData(windField, commit = {}) {
    const version = commit.version ?? this.activeUploadVersion + 1
    this.activeUploadVersion = version
    this.pendingWindField = windField
    if (this.failed || this.destroyed) return Promise.resolve(false)
    if (commit.isCurrent && !commit.isCurrent()) return Promise.resolve(false)

    const gl = this.gl
    const textureData = createVectorTextureData(windField)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.windTexture)
    if (commit.isCurrent && !commit.isCurrent()) return Promise.resolve(false)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      windField.grid.nx,
      windField.grid.ny,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      textureData,
    )
    if (commit.isCurrent && !commit.isCurrent()) return Promise.resolve(false)

    this.windField = windField
    this.pendingWindField = null
    this.setSamplerField(windField)
    this.ensureParticles()
    this.buildParticleGeometry()
    this.redraw()
    return Promise.resolve(true)
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
    this.redraw()
  }

  resize() {
    const rect = this.container.getBoundingClientRect()
    const dpr = getBackingStorePixelRatio(this.options.pixelRatioCap)
    this.width = Math.max(1, Math.round(rect.width))
    this.height = Math.max(1, Math.round(rect.height))
    this.flowCanvas.width = Math.round(this.width * dpr)
    this.flowCanvas.height = Math.round(this.height * dpr)
    this.gl.viewport(0, 0, this.flowCanvas.width, this.flowCanvas.height)
    this.ensureParticles()
    this.buildParticleGeometry()
    this.redraw()
  }

  ensureParticles() {
    if (!this.windField || !this.width || !this.height) return
    const densityFactor = getDensityFactor(this.windField, this.options.adaptiveParticleDensity)
      * getZoomDensityFactor(this.map, this.options.zoomAdaptiveDensity)
    const baseCap = isMobileViewport(this.width) ? this.options.mobileCap : this.options.desktopCap
    const densityScale = clamp(this.options.particleDensityScale, 0.2, 1)
    const cap = Math.max(64, Math.round(baseCap * densityFactor * densityScale))
    const count = clamp(Math.round((this.width * this.height) / 450 * densityScale), 64, cap)
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
    if (this.frameId || !this.visibility.flow || this.failed || !this.windField) return
    this.frameId = window.requestAnimationFrame((time) => this.frame(time))
  }

  stop() {
    if (!this.frameId) return
    window.cancelAnimationFrame(this.frameId)
    this.frameId = null
  }

  frame(time) {
    this.frameId = null
    if (!this.visibility.flow || this.failed || this.destroyed) return
    const minFrameMs = 1000 / this.options.frameCap
    if (!this.lastFrameAt || time - this.lastFrameAt >= minFrameMs) {
      this.stepParticles()
      this.lastFrameAt = time
    }
    this.drawFrame()
    this.start()
  }

  reseedParticle(particle, bounds) {
    Object.assign(particle, makeParticle(bounds, this.options.maxAge))
  }

  stepParticles() {
    if (!this.windField) return
    const bounds = getParticleBounds(this.map, this.windField)
    if (!bounds) return
    const speedFactor = effectiveWindSpeedFactor(this.map, this.options)
    for (const particle of this.particles) {
      const vector = this.sampler.sample(particle.lon, particle.lat)
      if (
        !vector
        || particle.age >= particle.maxAge
        || !containsPoint(bounds, particle.lon, particle.lat)
      ) {
        this.reseedParticle(particle, bounds)
        continue
      }

      particle.prevLon = particle.lon
      particle.prevLat = particle.lat
      particle.speed = vector.speed
      const nextLon = particle.lon + vector.u * speedFactor * 0.002
      const nextLat = particle.lat + vector.v * speedFactor * 0.002
      if (!containsPoint(bounds, nextLon, nextLat)) {
        this.reseedParticle(particle, bounds)
        continue
      }
      particle.lon = nextLon
      particle.lat = nextLat
      particle.age += 1
    }
    this.buildParticleGeometry()
  }

  buildParticleGeometry() {
    if (!this.windField || !this.width || !this.height) return
    const requiredLength = this.particles.length * 8
    const needsAllocation = !this.particleVertexData || this.particleVertexData.length !== requiredLength
    if (needsAllocation) {
      this.particleVertexData = new Float32Array(requiredLength)
    }

    let offset = 0
    for (const particle of this.particles) {
      const from = this.map.project([
        Number.isFinite(particle.prevLon) ? particle.prevLon : particle.lon,
        Number.isFinite(particle.prevLat) ? particle.prevLat : particle.lat,
      ])
      const to = this.map.project([particle.lon, particle.lat])
      const speed = particle.speed ?? 0
      const alpha = getParticleAgeAlpha(particle)
      this.particleVertexData[offset++] = from.x
      this.particleVertexData[offset++] = from.y
      this.particleVertexData[offset++] = speed
      this.particleVertexData[offset++] = alpha
      this.particleVertexData[offset++] = to.x
      this.particleVertexData[offset++] = to.y
      this.particleVertexData[offset++] = speed
      this.particleVertexData[offset++] = alpha
    }

    this.segmentVertexCount = offset / 4
    this.pointVertexCount = this.segmentVertexCount

    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer)
    if (needsAllocation) {
      gl.bufferData(gl.ARRAY_BUFFER, this.particleVertexData, gl.DYNAMIC_DRAW ?? gl.STATIC_DRAW)
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleVertexData)
    }
  }

  redraw() {
    if (this.failed || this.destroyed) return
    if (!this.visibility.flow) {
      this.clearFlowLayer()
      return
    }
    this.drawFrame()
  }

  redrawForMapInteraction() {
    if (this.failed || this.destroyed) return
    if (!this.visibility.flow) {
      this.clearFlowLayer()
      return
    }
    this.setSamplerField(this.windField)
    this.ensureParticles()
    this.buildParticleGeometry()
    this.clearFlowLayer()
    this.drawParticles()
  }

  drawFrame() {
    if (!this.windField || this.failed || this.destroyed) return
    const gl = this.gl
    if (this.visibility.flow) {
      this.drawFadePass()
      this.drawParticles()
    } else if (!this.visibility.speed) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
  }

  clearFlowLayer() {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  drawFadePass() {
    const gl = this.gl
    gl.blendFunc?.(gl.ZERO ?? 0, gl.SRC_ALPHA)
    gl.useProgram(this.fadeProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    const positionLocation = gl.getAttribLocation(this.fadeProgram, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    const fadeAlphaLocation = gl.getUniformLocation(this.fadeProgram, 'u_fade_alpha')
    gl.uniform1f(fadeAlphaLocation, clamp(this.options.trailPersistence, 0.55, 0.94))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.blendFunc?.(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  drawParticles() {
    const gl = this.gl
    gl.useProgram(this.particleProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer)
    const positionLocation = gl.getAttribLocation(this.particleProgram, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
    const speedLocation = gl.getAttribLocation(this.particleProgram, 'a_speed')
    gl.enableVertexAttribArray(speedLocation)
    gl.vertexAttribPointer(speedLocation, 1, gl.FLOAT, false, 16, 8)
    const alphaLocation = gl.getAttribLocation(this.particleProgram, 'a_alpha')
    gl.enableVertexAttribArray(alphaLocation)
    gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, 16, 12)
    const resolutionLocation = gl.getUniformLocation(this.particleProgram, 'u_resolution')
    gl.uniform2f(resolutionLocation, this.width, this.height)
    const flowWidth = clamp(this.options.flowWidth, 0.6, 2.4)
    gl.lineWidth?.(flowWidth)
    const pointSizeLocation = gl.getUniformLocation(this.particleProgram, 'u_point_size')
    gl.uniform1f(pointSizeLocation, flowWidth * 1.5)
    const flowColorLocation = gl.getUniformLocation(this.particleProgram, 'u_flow_color')
    gl.uniform4fv(flowColorLocation, this.flowColor)
    const colorModeLocation = gl.getUniformLocation(this.particleProgram, 'u_flow_color_mode')
    gl.uniform1i(colorModeLocation, this.options.flowColorMode === 'speed' ? 1 : 0)
    const opacityLocation = gl.getUniformLocation(this.particleProgram, 'u_flow_opacity')
    gl.uniform1f(opacityLocation, clamp(this.options.flowOpacity, 0.2, 1))
    gl.drawArrays(gl.LINES, 0, this.segmentVertexCount)
    gl.drawArrays(gl.POINTS, 0, this.pointVertexCount)
  }

  destroy() {
    this.stop()
    this.destroyed = true
    this.flowCanvas?.removeEventListener?.('webglcontextlost', this.handleContextLost)
    this.gl?.deleteProgram?.(this.particleProgram)
    this.gl?.deleteProgram?.(this.fadeProgram)
    this.gl?.deleteBuffer?.(this.quadBuffer)
    this.gl?.deleteBuffer?.(this.particleBuffer)
    this.gl?.deleteTexture?.(this.windTexture)
    if (this.flowCanvas?.parentNode) this.flowCanvas.parentNode.removeChild(this.flowCanvas)
  }
}

export default WebGLWindRenderer
