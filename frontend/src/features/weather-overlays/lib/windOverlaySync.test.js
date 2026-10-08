import test from 'node:test'

import { RASTER_ROW_SCALE } from './overlayUtils.js'
import assert from 'node:assert/strict'

import WebGLWindRenderer from './webglWindRenderer.js'
import {
  __resetWindOverlayRendererFactoriesForTest,
  __setWindOverlayRendererFactoriesForTest,
  destroyWindOverlay,
  syncWindOverlay,
} from './windOverlaySync.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createWebGLContext(options = {}) {
  const calls = []
  let nextId = 1
  return {
    __calls: calls,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    TRIANGLE_STRIP: 0x0005,
    TRIANGLES: 0x0004,
    POINTS: 0x0000,
    LINES: 0x0001,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    COLOR_BUFFER_BIT: 0x4000,
    FLOAT: 0x1406,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    BLEND: 0x0be2,
    ZERO: 0,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    createShader(type) {
      const shader = { id: nextId++, type }
      calls.push({ method: 'createShader', args: [type] })
      return shader
    },
    shaderSource(shader, source) {
      calls.push({ method: 'shaderSource', args: [shader, source] })
    },
    compileShader(shader) {
      calls.push({ method: 'compileShader', args: [shader] })
    },
    getShaderParameter(shader, name) {
      calls.push({ method: 'getShaderParameter', args: [shader, name] })
      if (options.failCompile) return false
      return true
    },
    getShaderInfoLog() {
      return options.failCompile ? 'compile failed' : ''
    },
    deleteShader(shader) {
      calls.push({ method: 'deleteShader', args: [shader] })
    },
    createProgram() {
      const program = { id: nextId++ }
      calls.push({ method: 'createProgram', args: [] })
      return program
    },
    attachShader(program, shader) {
      calls.push({ method: 'attachShader', args: [program, shader] })
    },
    linkProgram(program) {
      calls.push({ method: 'linkProgram', args: [program] })
    },
    getProgramParameter(program, name) {
      calls.push({ method: 'getProgramParameter', args: [program, name] })
      if (options.failLink) return false
      return true
    },
    getProgramInfoLog() {
      return options.failLink ? 'link failed' : ''
    },
    createBuffer() {
      const buffer = { id: nextId++ }
      calls.push({ method: 'createBuffer', args: [] })
      return buffer
    },
    bindBuffer(target, buffer) {
      calls.push({ method: 'bindBuffer', args: [target, buffer] })
    },
    bufferData(target, data, usage) {
      calls.push({
        method: 'bufferData',
        args: [target, ArrayBuffer.isView(data) ? data.length : data, usage],
      })
    },
    bufferSubData(target, offset, data) {
      calls.push({
        method: 'bufferSubData',
        args: [target, offset, ArrayBuffer.isView(data) ? data.length : data],
      })
    },
    createTexture() {
      const texture = { id: nextId++ }
      calls.push({ method: 'createTexture', args: [] })
      return texture
    },
    bindTexture(target, texture) {
      calls.push({ method: 'bindTexture', args: [target, texture] })
    },
    texParameteri(target, pname, param) {
      calls.push({ method: 'texParameteri', args: [target, pname, param] })
    },
    activeTexture(textureUnit) {
      calls.push({ method: 'activeTexture', args: [textureUnit] })
    },
    texImage2D(...args) {
      calls.push({ method: 'texImage2D', args })
    },
    viewport(...args) {
      calls.push({ method: 'viewport', args })
    },
    clearColor(...args) {
      calls.push({ method: 'clearColor', args })
    },
    clear(mask) {
      calls.push({ method: 'clear', args: [mask] })
    },
    useProgram(program) {
      calls.push({ method: 'useProgram', args: [program] })
    },
    getAttribLocation(program, name) {
      calls.push({ method: 'getAttribLocation', args: [program, name] })
      return 0
    },
    enableVertexAttribArray(location) {
      calls.push({ method: 'enableVertexAttribArray', args: [location] })
    },
    vertexAttribPointer(...args) {
      calls.push({ method: 'vertexAttribPointer', args })
    },
    getUniformLocation(program, name) {
      calls.push({ method: 'getUniformLocation', args: [program, name] })
      return { program, name }
    },
    uniform1i(location, value) {
      calls.push({ method: 'uniform1i', args: [location, value] })
    },
    uniform1f(location, value) {
      calls.push({ method: 'uniform1f', args: [location, value] })
    },
    uniform2f(location, x, y) {
      calls.push({ method: 'uniform2f', args: [location, x, y] })
    },
    lineWidth(width) {
      calls.push({ method: 'lineWidth', args: [width] })
    },
    uniform4fv(location, value) {
      calls.push({ method: 'uniform4fv', args: [location, Array.from(value)] })
    },
    uniform1fv(location, value) {
      calls.push({ method: 'uniform1fv', args: [location, Array.from(value)] })
    },
    enable(cap) {
      calls.push({ method: 'enable', args: [cap] })
    },
    disable(cap) {
      calls.push({ method: 'disable', args: [cap] })
    },
    blendFunc(src, dst) {
      calls.push({ method: 'blendFunc', args: [src, dst] })
    },
    drawArrays(...args) {
      calls.push({ method: 'drawArrays', args })
    },
    deleteProgram(program) {
      calls.push({ method: 'deleteProgram', args: [program] })
    },
    deleteBuffer(buffer) {
      calls.push({ method: 'deleteBuffer', args: [buffer] })
    },
    deleteTexture(texture) {
      calls.push({ method: 'deleteTexture', args: [texture] })
    },
  }
}

function createContainer({ width = 640, height = 360 } = {}) {
  const children = []
  return {
    children,
    appendChild(node) {
      node.parentNode = this
      children.push(node)
    },
    removeChild(node) {
      const index = children.indexOf(node)
      if (index >= 0) children.splice(index, 1)
      node.parentNode = null
    },
    querySelectorAll(selector) {
      if (selector === 'canvas[data-kim-wind-overlay]') {
        return children.filter((child) => child.dataset?.kimWindOverlay)
      }
      const roleMatch = selector.match(/^canvas\[data-kim-wind-overlay="([^"]+)"\]$/)
      if (roleMatch) {
        return children.filter((child) => child.dataset?.kimWindOverlay === roleMatch[1])
      }
      return []
    },
    getBoundingClientRect() {
      return { width, height }
    },
  }
}

function createCanvas(options = {}) {
  const calls = []
  const listeners = new Map()
  const webglContext = options.webgl ? createWebGLContext(options.webgl === true ? {} : options.webgl) : null
  return {
    __calls: calls,
    __webglContext: webglContext,
    dataset: {},
    style: {},
    width: 0,
    height: 0,
    parentNode: null,
    addEventListener(name, handler) {
      listeners.set(name, handler)
    },
    removeEventListener(name) {
      listeners.delete(name)
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event)
    },
    getContext(kind) {
      if (kind === 'webgl' || kind === 'experimental-webgl') return webglContext
      const context = {
        clearRect(...args) { calls.push({ method: 'clearRect', args }) },
        fillRect(...args) { calls.push({ method: 'fillRect', args }) },
        createImageData(width, height) {
          calls.push({ method: 'createImageData', args: [width, height] })
          return { data: new Uint8ClampedArray(width * height * 4), width, height }
        },
        putImageData(imageData, x, y) {
          calls.push({ method: 'putImageData', args: [imageData.data.length, x, y] })
        },
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        save() {},
        restore() {},
        scale() {},
        setTransform() {},
        fillStyle: '',
        _strokeStyle: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        lineWidth: 1,
      }
      Object.defineProperty(context, 'strokeStyle', {
        get() {
          return this._strokeStyle
        },
        set(value) {
          this._strokeStyle = value
          calls.push({ method: 'strokeStyle', args: [value] })
        },
      })
      return context
    },
    toDataURL(type) {
      calls.push({ method: 'toDataURL', args: [type] })
      return `data:${type || 'image/png'};base64,test`
    },
  }
}

function installDom({ dpr = 1, webgl = false } = {}) {
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  let nextFrameId = 1
  const activeFrames = new Set()
  const frameCallbacks = new Map()
  const createdCanvases = []

  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, 'canvas')
      const canvas = createCanvas({ webgl })
      createdCanvases.push(canvas)
      return canvas
    },
  }
  globalThis.window = {
    devicePixelRatio: dpr,
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} }
    },
    requestAnimationFrame(callback) {
      const id = nextFrameId++
      activeFrames.add(id)
      frameCallbacks.set(id, callback)
      return id
    },
    cancelAnimationFrame(id) {
      activeFrames.delete(id)
      frameCallbacks.delete(id)
    },
    addEventListener() {},
    removeEventListener() {},
  }

  return {
    activeFrames,
    createdCanvases,
    flushAnimationFrame(time = 16) {
      const [id] = activeFrames
      if (!id) return false
      const callback = frameCallbacks.get(id)
      activeFrames.delete(id)
      frameCallbacks.delete(id)
      callback?.(time)
      return true
    },
    restore() {
      __resetWindOverlayRendererFactoriesForTest()
      globalThis.document = previousDocument
      globalThis.window = previousWindow
    },
  }
}

function createMap(container = createContainer(), { zoom, bounds } = {}) {
  const sources = new Map()
  const layers = new Map()
  const layout = []
  let currentZoom = zoom
  return {
    container,
    events: new Map(),
    sources,
    layers,
    layout,
    getContainer() {
      return container
    },
    getZoom() {
      return currentZoom
    },
    setZoom(nextZoom) {
      currentZoom = nextZoom
    },
    on(eventName, handler) {
      this.events.set(eventName, handler)
    },
    off(eventName) {
      this.events.delete(eventName)
    },
    getBounds() {
      if (bounds) return bounds
      return {
        getWest: () => 126,
        getEast: () => 127,
        getSouth: () => 36,
        getNorth: () => 37,
      }
    },
    project([lon, lat]) {
      return { x: (lon - 126) * 640, y: (37 - lat) * 360 }
    },
    unproject([x, y]) {
      return { lng: 126 + x / 640, lat: 37 - y / 360 }
    },
    getSource(id) {
      return sources.get(id)
    },
    addSource(id, source) {
      sources.set(id, {
        ...source,
        updateImage(image) {
          this.url = image.url
          this.coordinates = image.coordinates
          this.updatedImage = image
        },
      })
    },
    removeSource(id) {
      sources.delete(id)
    },
    getLayer(id) {
      return layers.get(id)
    },
    addLayer(layer) {
      layers.set(layer.id, { ...layer })
    },
    removeLayer(id) {
      layers.delete(id)
    },
    setLayoutProperty(id, prop, value) {
      layout.push([id, prop, value])
      const layer = layers.get(id)
      if (layer) {
        layer.layout = { ...(layer.layout || {}), [prop]: value }
      }
    },
  }
}

const FIELD_A = {
  encoding: 'int16-scaled-json-v1',
  scale: 1,
  offset: 0,
  grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37, dx: 1, dy: 1 },
  u: [1, 1, 1, 1],
  v: [0, 0, 0, 0],
}

const FIELD_B = {
  ...FIELD_A,
  u: [2, 2, 2, 2],
}

test('syncWindOverlay prefers WebGL renderer when WebGL context is available', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.type, 'webgl')
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 1)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay falls back to Canvas renderer when WebGL context is unavailable', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.type, 'canvas')
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="flow"]').length, 1)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="speed"]').length, 0)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay creates one overlay across repeated sync calls', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: true, windSpeed: false } })
    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: true, windSpeed: false } })

    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay]').length, 1)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer stop and destroy cancel animation and remove canvas', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(dom.activeFrames.size, 1)
    destroyWindOverlay(map)
    assert.equal(dom.activeFrames.size, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 0)
    assert.equal(state.renderer.destroyed, true)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay stops animation when flow visibility is off', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: true, windSpeed: false } })
    assert.equal(dom.activeFrames.size, 1)

    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: false, windSpeed: false } })
    assert.equal(dom.activeFrames.size, 0)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer clears and hides flow canvas when flow is turned off while speed stays on', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: false, windSpeed: true },
    })

    assert.equal(state.renderer.flowCanvas.style.display, 'none')
    assert.ok(state.renderer.gl.__calls.some(
      (call) => call.method === 'clearColor' && call.args.every((value) => value === 0),
    ))
    assert.ok(state.renderer.gl.__calls.some((call) => call.method === 'clear'))
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay destroys overlay when parent wind visibility turns off', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: true, windSpeed: false } })
    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: false, windFlow: true, windSpeed: false } })

    assert.equal(dom.activeFrames.size, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay]').length, 0)
  } finally {
    dom.restore()
  }
})

test('speed layer installs a map-anchored image overlay and does not redraw on map movement', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    syncWindOverlay(map, { windField: FIELD_A, visibility: { wind: true, windFlow: false, windSpeed: true } })
    const source = map.getSource('kim-wind-speed-image-source')
    assert.equal(source.type, 'image')
    // 이미지 모서리는 격자 칸 바깥 경계(격자점 ± 반 칸)다.
    assert.deepEqual(source.coordinates, [[125.5, 37.5], [127.5, 37.5], [127.5, 35.5], [125.5, 35.5]])
    assert.equal(map.getLayer('kim-wind-speed-image-layer').type, 'raster')
    assert.equal(map.getLayer('kim-wind-speed-image-layer').paint['raster-resampling'], 'linear')
    const initialUrl = source.url

    map.events.get('moveend')()
    dom.flushAnimationFrame()

    assert.equal(map.getSource('kim-wind-speed-image-source').url, initialUrl)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay schedules map interaction reprojection without pausing animation', () => {
  const dom = installDom()
  try {
    const calls = []
    const fakeRenderer = {
      type: 'fake',
      failed: false,
      setData() {},
      setVisibility() {},
      resize() {
        calls.push('resize')
      },
      redraw() {
        calls.push('redraw')
      },
      redrawForMapInteraction() {
        calls.push('interaction')
      },
      destroy() {},
    }
    __setWindOverlayRendererFactoriesForTest({
      createWebGLRenderer() {
        return fakeRenderer
      },
    })

    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    map.events.get('move')()
    map.events.get('zoom')()
    map.events.get('moveend')()

    assert.deepEqual(calls, [])
    assert.equal(dom.activeFrames.size, 1)

    dom.flushAnimationFrame()

    assert.deepEqual(calls, ['interaction'])
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay throttles repeated interaction redraws to one animation frame', () => {
  const dom = installDom()
  try {
    const calls = []
    const fakeRenderer = {
      type: 'fake',
      failed: false,
      setData() {},
      setVisibility() {},
      resize() {},
      redraw() {},
      redrawForMapInteraction() {
        calls.push('interaction')
      },
      destroy() {},
    }
    __setWindOverlayRendererFactoriesForTest({
      createWebGLRenderer() {
        return fakeRenderer
      },
    })

    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    map.events.get('move')()
    map.events.get('move')()
    map.events.get('zoom')()

    assert.deepEqual(calls, [])
    assert.equal(dom.activeFrames.size, 1)

    dom.flushAnimationFrame()

    assert.deepEqual(calls, ['interaction'])
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay forwards low-power renderer options', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 1000, mobileCap: 1000, frameCap: 15 },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.options.desktopCap, 1000)
    assert.equal(state.renderer.options.mobileCap, 1000)
    assert.equal(state.renderer.options.frameCap, 15)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay updates renderer options without recreating the overlay', () => {
  const dom = installDom()
  try {
    const calls = []
    const fakeRenderer = {
      type: 'fake',
      failed: false,
      setData() {},
      setOptions(options) {
        calls.push(['options', options.flowOpacity, options.flowColorMode, options.flowWidth, options.trailPersistence])
      },
      setVisibility() {},
      resize() {},
      redraw() {},
      destroy() {
        calls.push(['destroy'])
      },
    }
    __setWindOverlayRendererFactoriesForTest({
      createWebGLRenderer() {
        return fakeRenderer
      },
    })

    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { flowOpacity: 0.62, flowColorMode: 'neutral', flowWidth: 1.4, trailPersistence: 0.82 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })
    syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { flowOpacity: 0.74, flowColorMode: 'speed', flowWidth: 1.8, trailPersistence: 0.76 },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.deepEqual(calls, [
      ['options', 0.62, 'neutral', 1.4, 0.82],
      ['options', 0.74, 'speed', 1.8, 0.76],
    ])
  } finally {
    dom.restore()
  }
})

test('WebGL renderer uses neutral gray flow color over the speed layer', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64, flowOpacity: 0.62, flowColorMode: 'neutral' },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const colorUniform = state.renderer.gl.__calls.find(
      (call) => call.method === 'uniform4fv' && call.args[0]?.name === 'u_flow_color',
    )
    const modeUniform = state.renderer.gl.__calls.find(
      (call) => call.method === 'uniform1i' && call.args[0]?.name === 'u_flow_color_mode',
    )
    assert.deepEqual(colorUniform?.args[1], [208 / 255, 216 / 255, 226 / 255, 0.62])
    assert.equal(modeUniform?.args[1], 0)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer applies configured flow width and trail persistence', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64, flowWidth: 1.7, trailPersistence: 0.76 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const pointSizeUniform = state.renderer.gl.__calls.find(
      (call) => call.method === 'uniform1f' && call.args[0]?.name === 'u_point_size',
    )
    const fadeUniform = state.renderer.gl.__calls.find(
      (call) => call.method === 'uniform1f' && call.args[0]?.name === 'u_fade_alpha',
    )
    assert.equal(pointSizeUniform?.args[1], 2.55)
    assert.equal(fadeUniform?.args[1], 0.76)
    // 꼬리는 사각형이라 첫 두 꼭짓점(같은 끝점의 양옆) 사이가 선 굵기다. WebGL 선(lineWidth)은 쓰지 않는다.
    const v = state.renderer.particleVertexData
    if (Math.hypot(v[0] - v[4], v[1] - v[5]) > 0) assert.ok(Math.abs(Math.hypot(v[0] - v[4], v[1] - v[5]) - 1.7) < 1e-4)
    assert.ok(!state.renderer.gl.__calls.some((call) => call.method === 'lineWidth'))
  } finally {
    dom.restore()
  }
})

test('WebGL renderer fades particles near the end of their lifetime', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const particle = state.renderer.particles[0]
    particle.age = particle.maxAge - 1
    state.renderer.buildParticleGeometry()

    assert.ok(state.renderer.particleVertexData[3] < 0.1)
    assert.ok(state.renderer.particleVertexData[7] < 0.1)
  } finally {
    dom.restore()
  }
})

test('Canvas renderer uses speed-colored flow when the speed layer is off', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 1, mobileCap: 1, flowOpacity: 0.7, flowColorMode: 'speed' },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    dom.flushAnimationFrame(40)

    const strokeCall = dom.createdCanvases
      .flatMap((canvas) => canvas.__calls)
      .find((call) => call.method === 'strokeStyle')
    assert.notEqual(strokeCall?.args[0], 'rgba(208, 216, 226, 0.7)')
    assert.match(strokeCall?.args[0] || '', /^rgba\(/)
  } finally {
    dom.restore()
  }
})

test('Canvas renderer applies configured flow width and trail persistence', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 1, mobileCap: 1, flowWidth: 1.8, trailPersistence: 0.74 },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    dom.flushAnimationFrame(40)

    assert.equal(state.renderer.ctx.lineWidth, 1.8)
    assert.equal(state.renderer.ctx.fillStyle, 'rgba(0, 0, 0, 0.74)')
  } finally {
    dom.restore()
  }
})

test('WebGL renderer reduces particle count for weak wind fields', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 1920, height: 1080 }))
    const weakField = {
      ...FIELD_A,
      u: [0.2, 0.2, 0.2, 0.2],
      v: [0, 0, 0, 0],
    }
    const state = syncWindOverlay(map, {
      windField: weakField,
      rendererOptions: { adaptiveParticleDensity: true },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.particles.length, 1920)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer reduces particle count moderately at closer zoom levels', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 1920, height: 1080 }), { zoom: 10 })
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { zoomAdaptiveDensity: true },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.particles.length, 2240)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer seeds particles inside the wind field bounds', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 640, height: 360 }), {
      bounds: {
        getWest: () => 120,
        getEast: () => 130,
        getSouth: () => 30,
        getNorth: () => 40,
      },
    })
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    assert.ok(state.renderer.particles.every((particle) => particle.lon >= 126 && particle.lon <= 127))
    assert.ok(state.renderer.particles.every((particle) => particle.lat >= 36 && particle.lat <= 37))
  } finally {
    dom.restore()
  }
})

test('WebGL renderer reseeds instead of drawing particle segments outside the wind field bounds', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: { ...FIELD_A, u: [20, 20, 20, 20], v: [0, 0, 0, 0] },
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const particle = state.renderer.particles[0]
    particle.lon = 126.99
    particle.lat = 36.5
    particle.prevLon = 126.98
    particle.prevLat = 36.5

    state.renderer.stepParticles()

    assert.ok(particle.lon <= 127)
    assert.equal(particle.prevLon, null)
    assert.equal(particle.prevLat, null)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer caps particle count below the previous desktop maximum', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 1920, height: 1080 }))
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.particles.length, 3200)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer caps high-DPI backing stores without changing CSS size', () => {
  const dom = installDom({ dpr: 3, webgl: true })
  try {
    const map = createMap(createContainer({ width: 640, height: 360 }))
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.flowCanvas.width, 1280)
    assert.equal(state.renderer.flowCanvas.height, 720)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl-speed"]').length, 0)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay preserves particle state when Canvas wind data hot-swaps', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()

    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })
    const particleRef = state.renderer.particles

    syncWindOverlay(map, {
      windField: FIELD_B,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.particles, particleRef)
    assert.equal(state.renderer.windField, FIELD_B)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer uploads wind data and updates backing-store viewport size', () => {
  const dom = installDom({ dpr: 2, webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const flowCalls = state.renderer.gl.__calls
    assert.ok(flowCalls.some((call) => call.method === 'texImage2D'))
    assert.ok(flowCalls.some((call) => call.method === 'viewport' && call.args[2] === 1280 && call.args[3] === 720))
    assert.ok(flowCalls.some((call) => call.method === 'drawArrays' && call.args[0] === state.renderer.gl.TRIANGLES))
    assert.ok(flowCalls.some((call) => call.method === 'drawArrays' && call.args[0] === state.renderer.gl.POINTS))
    assert.equal(map.getSource('kim-wind-speed-image-source').type, 'image')
    assert.equal(map.getLayer('kim-wind-speed-image-layer').type, 'raster')
    assert.ok(flowCalls.some((call) => call.method === 'blendFunc' && call.args[0] === state.renderer.gl.ZERO && call.args[1] === state.renderer.gl.SRC_ALPHA))
    assert.ok(flowCalls.some((call) => call.method === 'vertexAttribPointer' && call.args[2] === state.renderer.gl.FLOAT))
  } finally {
    dom.restore()
  }
})

test('WebGL renderer uses a downsampled sampler at low zoom', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 640, height: 360 }), { zoom: 5 })
    const field = {
      ...FIELD_A,
      grid: { nx: 5, ny: 5, lonMin: 126, latMin: 36, lonMax: 130, latMax: 40, dx: 1, dy: 1 },
      u: Array.from({ length: 25 }, (_, index) => index),
      v: Array.from({ length: 25 }, () => 0),
    }

    const state = syncWindOverlay(map, {
      windField: field,
      rendererOptions: { samplerLod: true },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.samplerField.grid.nx, 3)
    assert.equal(state.renderer.samplerField.grid.ny, 3)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer keeps the original sampler at close zoom', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 640, height: 360 }), { zoom: 9 })
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { samplerLod: true },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.samplerField, FIELD_A)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer updates sampler LOD after zoom changes', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap(createContainer({ width: 640, height: 360 }), { zoom: 5 })
    const field = {
      ...FIELD_A,
      grid: { nx: 5, ny: 5, lonMin: 126, latMin: 36, lonMax: 130, latMax: 40, dx: 1, dy: 1 },
      u: Array.from({ length: 25 }, (_, index) => index),
      v: Array.from({ length: 25 }, () => 0),
    }
    const state = syncWindOverlay(map, {
      windField: field,
      rendererOptions: { samplerLod: true },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })
    assert.equal(state.renderer.samplerField.grid.nx, 3)

    map.setZoom(9)
    state.renderer.redrawForMapInteraction()

    assert.equal(state.renderer.samplerField, field)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer reuses particle vertex storage and updates GPU buffers incrementally', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })
    const initialVertexData = state.renderer.particleVertexData
    const flowCalls = state.renderer.gl.__calls
    const initialBufferDataCount = flowCalls.filter((call) => call.method === 'bufferData').length

    state.renderer.stepParticles()

    const nextBufferDataCount = flowCalls.filter((call) => call.method === 'bufferData').length
    const bufferSubDataCount = flowCalls.filter((call) => call.method === 'bufferSubData').length
    assert.equal(state.renderer.particleVertexData, initialVertexData)
    assert.equal(nextBufferDataCount, initialBufferDataCount)
    assert.ok(bufferSubDataCount > 0)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer draws flow particles with default neutral gray color', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const colorUniform = state.renderer.gl.__calls.find(
      (call) => call.method === 'uniform4fv' && call.args[0]?.name === 'u_flow_color',
    )
    assert.deepEqual(colorUniform?.args[1], [208 / 255, 216 / 255, 226 / 255, 0.66])
  } finally {
    dom.restore()
  }
})

test('Canvas renderer draws flow particles with default neutral gray color', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 1, mobileCap: 1 },
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    dom.flushAnimationFrame(40)

    const strokeCall = dom.createdCanvases
      .flatMap((canvas) => canvas.__calls)
      .find((call) => call.method === 'strokeStyle')
    assert.equal(strokeCall?.args[0], 'rgba(208, 216, 226, 0.66)')
  } finally {
    dom.restore()
  }
})

test('speed image overlay updates only when wind data changes', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: false, windSpeed: true },
    })
    const source = map.getSource('kim-wind-speed-image-source')
    const initialUpdate = source.updatedImage

    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: false, windSpeed: true },
    })
    assert.equal(source.updatedImage, initialUpdate)

    syncWindOverlay(map, {
      windField: FIELD_B,
      visibility: { wind: true, windFlow: false, windSpeed: true },
    })
    assert.notEqual(source.updatedImage, initialUpdate)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer does not draw long stale segments after particle reseed', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      rendererOptions: { desktopCap: 64, mobileCap: 64 },
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    const particle = state.renderer.particles[0]
    particle.lon = 126.5
    particle.lat = 36.5
    particle.prevLon = 127
    particle.prevLat = 37
    particle.age = particle.maxAge

    state.renderer.stepParticles()

    assert.equal(particle.prevLon, null)
    assert.equal(particle.prevLat, null)
    // 꼭짓점 0은 출발점 쪽, 꼭짓점 2는 도착점 쪽(같은 옆면)이다. 재시작한 입자는 길이 0이라 둘이 같다.
    const data = state.renderer.particleVertexData
    assert.equal(data[0], data[8])
    assert.equal(data[1], data[9])
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay ignores stale async renderer data commits', async () => {
  const dom = installDom({ webgl: false })
  try {
    const first = createDeferred()
    const second = createDeferred()
    const committedFields = []

    class FakeRenderer {
      constructor() {
        this.type = 'fake'
        this.visibility = { flow: false, speed: false }
      }

      setData(field, commit) {
        const current = committedFields.length === 0 ? first : second
        return current.promise.then(() => {
          if (commit.isCurrent()) committedFields.push(field)
        })
      }

      setVisibility(visibility) {
        this.visibility = visibility
      }

      resize() {}
      start() {}
      stop() {}
      destroy() {
        this.destroyed = true
      }
    }

    __setWindOverlayRendererFactoriesForTest({
      createWebGLRenderer: () => {
        throw new Error('not available')
      },
      createCanvasRenderer: () => new FakeRenderer(),
    })

    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    syncWindOverlay(map, {
      windField: FIELD_B,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    second.resolve()
    await second.promise
    first.resolve()
    await first.promise
    await Promise.resolve()

    assert.deepEqual(committedFields, [FIELD_B])
    assert.equal(state.windField, FIELD_B)
    assert.equal(state.pendingWindField, null)
    assert.equal(state.renderer.type, 'fake')
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay falls back to Canvas on the next sync after WebGL context loss', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    const canvas = map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]')[0]
    canvas.dispatchEvent({
      type: 'webglcontextlost',
      preventDefault() {},
    })

    assert.equal(state.renderer.failed, true)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl-speed"]').length, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="flow"]').length, 1)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="speed"]').length, 0)

    const nextState = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(nextState.renderer.type, 'canvas')
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="flow"]').length, 1)
  } finally {
    dom.restore()
  }
})

test('WebGL renderer constructor cleans up appended canvas when shader init fails', () => {
  const dom = installDom({ webgl: { failCompile: true } })
  try {
    const map = createMap()
    assert.throws(() => new WebGLWindRenderer(map), /compile failed/)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 0)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay returns null and cleans up when both WebGL and Canvas renderers fail', () => {
  const dom = installDom({ webgl: false })
  try {
    __setWindOverlayRendererFactoriesForTest({
      createWebGLRenderer: () => {
        throw new Error('webgl failed')
      },
      createCanvasRenderer: () => {
        throw new Error('canvas failed')
      },
    })

    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state, null)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay]').length, 0)
  } finally {
    dom.restore()
  }
})

test('speed image overlay rasterizes wind speed colors once per field', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: true },
    })

    const source = map.getSource('kim-wind-speed-image-source')
    assert.equal(source.type, 'image')
    assert.match(source.url, /^data:image\/png/)
    const rasterCanvas = dom.createdCanvases.find((child) => child.__calls?.some((call) => call.method === 'toDataURL'))
    assert.ok(rasterCanvas.__calls.some((call) => call.method === 'createImageData' && call.args[0] === 2 && call.args[1] === 2 * RASTER_ROW_SCALE))
    assert.ok(rasterCanvas.__calls.some((call) => call.method === 'putImageData'))
  } finally {
    dom.restore()
  }
})
