import CanvasWindRenderer from './canvasWindRenderer.js'
import WebGLWindRenderer from './webglWindRenderer.js'
import { decodeWindComponent, interpolateWindSpeedColor } from './windField.js'
import { cellCoordinatesForGrid, parseRgba, mercatorSourceRows } from './overlayUtils.js'

const overlays = new WeakMap()
const canvasFallbackMaps = new WeakSet()
const WIND_SPEED_SOURCE_ID = 'kim-wind-speed-image-source'
const WIND_SPEED_LAYER_ID = 'kim-wind-speed-image-layer'

const defaultFactories = {
  createCanvasRenderer(map, options) {
    return new CanvasWindRenderer(map, options)
  },
  createWebGLRenderer(map, options) {
    return new WebGLWindRenderer(map, options)
  },
}

let rendererFactories = defaultFactories

function windVisible(visibility = {}) {
  return !!(visibility.wind && (visibility.windFlow || visibility.windSpeed))
}

function bindMapEvents(map, renderer) {
  let interactionFrameId = null
  const resize = () => renderer.resize()
  const redraw = () => {
    renderer.resize()
    renderer.redraw?.()
  }
  const redrawInteraction = () => {
    if (interactionFrameId != null) return
    interactionFrameId = window.requestAnimationFrame(() => {
      interactionFrameId = null
      renderer.redrawForMapInteraction?.()
    })
  }
  map.on?.('resize', resize)
  map.on?.('move', redrawInteraction)
  map.on?.('zoom', redrawInteraction)
  map.on?.('zoomend', redrawInteraction)
  map.on?.('moveend', redrawInteraction)
  return () => {
    map.off?.('resize', resize)
    map.off?.('move', redrawInteraction)
    map.off?.('zoom', redrawInteraction)
    map.off?.('zoomend', redrawInteraction)
    map.off?.('moveend', redrawInteraction)
    if (interactionFrameId != null) window.cancelAnimationFrame(interactionFrameId)
  }
}

function createRenderer(map, options) {
  if (!canvasFallbackMaps.has(map)) {
    try {
      return rendererFactories.createWebGLRenderer(map, {
        ...options,
        onFailure() {
          replaceFailedRendererWithCanvas(map)
        },
      })
    } catch {
      // Fall through to the Canvas fallback.
    }
  }
  try {
    return rendererFactories.createCanvasRenderer(map, options)
  } catch {
    return null
  }
}

function applyVisibility(renderer, visibility = {}) {
  renderer.setVisibility({
    flow: !!(visibility.wind && visibility.windFlow),
    speed: false,
  })
}


function buildWindSpeedImage(windField) {
  const grid = windField?.grid
  if (!grid?.nx || !grid?.ny || !Array.isArray(windField.u) || !Array.isArray(windField.v)) return null
  const sourceRows = mercatorSourceRows(grid)
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = sourceRows.length
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const imageData = ctx.createImageData?.(grid.nx, sourceRows.length)
  if (imageData?.data) {
    for (let y = 0; y < sourceRows.length; y += 1) {
      const sourceY = sourceRows[y]
      for (let x = 0; x < grid.nx; x += 1) {
        const sourceIndex = sourceY * grid.nx + x
        const u = decodeWindComponent(windField.u[sourceIndex], windField)
        const v = decodeWindComponent(windField.v[sourceIndex], windField)
        const [r, g, b, a] = u == null || v == null
          ? [0, 0, 0, 0]
          : parseRgba(interpolateWindSpeedColor(Math.hypot(u, v)))
        const targetIndex = (y * grid.nx + x) * 4
        imageData.data[targetIndex] = r
        imageData.data[targetIndex + 1] = g
        imageData.data[targetIndex + 2] = b
        imageData.data[targetIndex + 3] = a
      }
    }
    ctx.putImageData(imageData, 0, 0)
  } else {
    for (let y = 0; y < sourceRows.length; y += 1) {
      const sourceY = sourceRows[y]
      for (let x = 0; x < grid.nx; x += 1) {
        const sourceIndex = sourceY * grid.nx + x
        const u = decodeWindComponent(windField.u[sourceIndex], windField)
        const v = decodeWindComponent(windField.v[sourceIndex], windField)
        if (u == null || v == null) continue
        ctx.fillStyle = interpolateWindSpeedColor(Math.hypot(u, v))
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  return canvas.toDataURL?.('image/png') || canvas
}

function removeWindSpeedImageLayer(map) {
  if (map.getLayer?.(WIND_SPEED_LAYER_ID)) map.removeLayer?.(WIND_SPEED_LAYER_ID)
  if (map.getSource?.(WIND_SPEED_SOURCE_ID)) map.removeSource?.(WIND_SPEED_SOURCE_ID)
}

function setWindSpeedImageVisible(map, visible) {
  if (map.getLayer?.(WIND_SPEED_LAYER_ID)) {
    map.setLayoutProperty?.(WIND_SPEED_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

function syncWindSpeedImageLayer(map, state, windField, visibility = {}) {
  const visible = !!(visibility.wind && visibility.windSpeed)
  if (!visible) {
    setWindSpeedImageVisible(map, false)
    return
  }

  const coordinates = cellCoordinatesForGrid(windField?.grid)
  if (!coordinates) return

  const source = map.getSource?.(WIND_SPEED_SOURCE_ID)
  const layer = map.getLayer?.(WIND_SPEED_LAYER_ID)
  const imageChanged = state.speedImageField !== windField || !source
  if (imageChanged) {
    const url = buildWindSpeedImage(windField)
    if (!url) return
    const image = { url, coordinates }
    if (source?.updateImage) {
      source.updateImage(image)
    } else if (!source) {
      map.addSource?.(WIND_SPEED_SOURCE_ID, { type: 'image', ...image })
    }
    state.speedImageField = windField
  }

  if (!layer) {
    map.addLayer?.({
      id: WIND_SPEED_LAYER_ID,
      type: 'raster',
      source: WIND_SPEED_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    })
  }
  setWindSpeedImageVisible(map, true)
}

function destroyState(map, state) {
  state.cleanup?.()
  state.renderer.destroy()
  removeWindSpeedImageLayer(map)
  overlays.delete(map)
}

function replaceFailedRendererWithCanvas(map) {
  const state = overlays.get(map)
  if (!state) return null
  canvasFallbackMaps.add(map)
  const windField = state.pendingWindField || state.windField
  const visibility = state.visibility
  destroyState(map, state)
  if (!windField) return null

  const renderer = createRenderer(map, state.rendererOptions)
  if (!renderer) return null
  const nextState = {
    cleanup: bindMapEvents(map, renderer),
    dataVersion: state.dataVersion + 1,
    pendingWindField: null,
    renderer,
    rendererOptions: state.rendererOptions,
    speedImageField: null,
    visibility,
    windField: null,
  }
  overlays.set(map, nextState)
  syncWindField(map, nextState, windField)
  applyVisibility(renderer, visibility)
  return nextState
}

function ensureRenderer(map, model, state) {
  if (state?.renderer?.failed) {
    canvasFallbackMaps.add(map)
    destroyState(map, state)
    return null
  }
  if (state) return state

  const renderer = createRenderer(map, model.rendererOptions)
  if (!renderer) return null
  const nextState = {
    cleanup: bindMapEvents(map, renderer),
    dataVersion: 0,
    pendingWindField: null,
    renderer,
    rendererOptions: model.rendererOptions,
    speedImageField: null,
    visibility: model.visibility,
    windField: null,
  }
  overlays.set(map, nextState)
  return nextState
}

function syncWindField(map, state, windField) {
  if (state.windField === windField && state.pendingWindField == null) return
  state.dataVersion += 1
  const version = state.dataVersion
  state.pendingWindField = windField
  Promise.resolve(state.renderer.setData(windField, {
    version,
    isCurrent() {
      return overlays.get(map) === state && state.dataVersion === version
    },
  }))
    .then((committed) => {
      if (overlays.get(map) !== state) return
      if (state.dataVersion !== version) return
      if (committed === false) {
        state.pendingWindField = null
        return
      }
      state.windField = windField
      state.pendingWindField = null
    })
    .catch(() => {
      if (overlays.get(map) !== state) return
      if (state.dataVersion !== version) return
      state.pendingWindField = null
    })
}

export function syncWindOverlay(map, model = {}) {
  if (!map?.getContainer) return null
  if (!windVisible(model.visibility) || !model.windField) {
    destroyWindOverlay(map)
    return null
  }

  let state = overlays.get(map)
  state = ensureRenderer(map, model, state)
  if (!state) {
    state = ensureRenderer(map, model, overlays.get(map))
  }
  if (!state) return null

  state.renderer.setOptions?.(model.rendererOptions || {})
  state.rendererOptions = model.rendererOptions
  syncWindField(map, state, model.windField)
  state.visibility = model.visibility
  syncWindSpeedImageLayer(map, state, model.windField, model.visibility)
  applyVisibility(state.renderer, model.visibility)
  return state
}

export function destroyWindOverlay(map) {
  const state = overlays.get(map)
  if (!state) return
  destroyState(map, state)
}

export function __setWindOverlayRendererFactoriesForTest(factories) {
  rendererFactories = { ...defaultFactories, ...factories }
}

export function __resetWindOverlayRendererFactoriesForTest() {
  rendererFactories = defaultFactories
}


export const WIND_SPEED_IMAGE_LAYER_IDS = [WIND_SPEED_LAYER_ID]
export const WIND_SPEED_IMAGE_SOURCE_IDS = [WIND_SPEED_SOURCE_ID]
