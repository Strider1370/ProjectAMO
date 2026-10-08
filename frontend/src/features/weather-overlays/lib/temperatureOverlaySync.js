import { decodeTemperatureValue, kelvinToCelsius, pickTemperatureColor } from './temperatureField.js'
import { cellCoordinatesForGrid, parseRgba, mercatorSourceRows } from './overlayUtils.js'

const TEMPERATURE_IMAGE_SOURCE_ID = 'kim-temperature-image-source'
const TEMPERATURE_IMAGE_LAYER_ID = 'kim-temperature-image-layer'
const stateByMap = new WeakMap()

function buildTemperatureImage(field) {
  const grid = field?.grid
  if (!grid?.nx || !grid?.ny || !Array.isArray(field.T)) return null
  const sourceRows = mercatorSourceRows(grid)
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = sourceRows.length
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(grid.nx, sourceRows.length)

  for (let y = 0; y < sourceRows.length; y += 1) {
    const sourceY = sourceRows[y]
    for (let x = 0; x < grid.nx; x += 1) {
      const sourceIndex = sourceY * grid.nx + x
      const kelvin = decodeTemperatureValue(field.T[sourceIndex], field)
      const rgba = kelvin == null ? [0, 0, 0, 0] : parseRgba(pickTemperatureColor(kelvinToCelsius(kelvin)).color)
      const targetIndex = (y * grid.nx + x) * 4
      imageData.data[targetIndex] = rgba[0]
      imageData.data[targetIndex + 1] = rgba[1]
      imageData.data[targetIndex + 2] = rgba[2]
      imageData.data[targetIndex + 3] = rgba[3]
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function setVisible(map, visible) {
  if (map.getLayer?.(TEMPERATURE_IMAGE_LAYER_ID)) {
    map.setLayoutProperty?.(TEMPERATURE_IMAGE_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncTemperatureOverlay(map, model = {}) {
  if (!map || !model.isVisible || !model.temperatureField) {
    if (map) setVisible(map, false)
    return null
  }
  const coordinates = cellCoordinatesForGrid(model.temperatureField.grid)
  if (!coordinates) return null
  const state = stateByMap.get(map) || { field: null }
  let source = map.getSource?.(TEMPERATURE_IMAGE_SOURCE_ID)

  if (state.field !== model.temperatureField || !source) {
    const url = buildTemperatureImage(model.temperatureField)
    if (!url) return null
    const image = { url, coordinates }
    if (source?.updateImage) source.updateImage(image)
    else {
      map.addSource?.(TEMPERATURE_IMAGE_SOURCE_ID, { type: 'image', ...image })
      source = map.getSource?.(TEMPERATURE_IMAGE_SOURCE_ID)
    }
    state.field = model.temperatureField
    stateByMap.set(map, state)
  }

  if (!map.getLayer?.(TEMPERATURE_IMAGE_LAYER_ID)) {
    map.addLayer?.({
      id: TEMPERATURE_IMAGE_LAYER_ID,
      type: 'raster',
      source: TEMPERATURE_IMAGE_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    })
  }
  setVisible(map, true)
  return state
}

export function destroyTemperatureOverlay(map) {
  if (!map) return
  if (map.getLayer?.(TEMPERATURE_IMAGE_LAYER_ID)) map.removeLayer?.(TEMPERATURE_IMAGE_LAYER_ID)
  if (map.getSource?.(TEMPERATURE_IMAGE_SOURCE_ID)) map.removeSource?.(TEMPERATURE_IMAGE_SOURCE_ID)
  stateByMap.delete(map)
}

export const TEMPERATURE_IMAGE_LAYER_IDS = [TEMPERATURE_IMAGE_LAYER_ID]
export const TEMPERATURE_IMAGE_SOURCE_IDS = [TEMPERATURE_IMAGE_SOURCE_ID]
