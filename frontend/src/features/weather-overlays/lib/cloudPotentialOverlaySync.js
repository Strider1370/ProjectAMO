import { decodeSpreadValue, pickCloudPotentialColor } from './cloudPotentialField.js'
import { coordinatesForGrid, parseRgba } from './overlayUtils.js'

const CLOUD_POTENTIAL_IMAGE_SOURCE_ID = 'kim-cloud-potential-image-source'
const CLOUD_POTENTIAL_IMAGE_LAYER_ID = 'kim-cloud-potential-image-layer'
const stateByMap = new WeakMap()

function buildCloudPotentialImage(field) {
  const grid = field?.grid
  if (!grid?.nx || !grid?.ny || !Array.isArray(field.spread)) return null
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = grid.ny
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(grid.nx, grid.ny)

  for (let y = 0; y < grid.ny; y += 1) {
    const sourceY = grid.ny - 1 - y
    for (let x = 0; x < grid.nx; x += 1) {
      const sourceIndex = sourceY * grid.nx + x
      const value = decodeSpreadValue(field.spread[sourceIndex], field)
      const rgba = value == null ? [0, 0, 0, 0] : parseRgba(pickCloudPotentialColor(value, field).color)
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
  if (map.getLayer?.(CLOUD_POTENTIAL_IMAGE_LAYER_ID)) {
    map.setLayoutProperty?.(CLOUD_POTENTIAL_IMAGE_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncCloudPotentialOverlay(map, model = {}) {
  if (!map || !model.isVisible || !model.cloudPotentialField) {
    if (map) setVisible(map, false)
    return null
  }
  const coordinates = coordinatesForGrid(model.cloudPotentialField.grid)
  if (!coordinates) return null
  const state = stateByMap.get(map) || { field: null }
  let source = map.getSource?.(CLOUD_POTENTIAL_IMAGE_SOURCE_ID)

  if (state.field !== model.cloudPotentialField || !source) {
    const url = buildCloudPotentialImage(model.cloudPotentialField)
    if (!url) return null
    const image = { url, coordinates }
    if (source?.updateImage) source.updateImage(image)
    else {
      map.addSource?.(CLOUD_POTENTIAL_IMAGE_SOURCE_ID, { type: 'image', ...image })
      source = map.getSource?.(CLOUD_POTENTIAL_IMAGE_SOURCE_ID)
    }
    state.field = model.cloudPotentialField
    stateByMap.set(map, state)
  }

  if (!map.getLayer?.(CLOUD_POTENTIAL_IMAGE_LAYER_ID)) {
    const before = ['kim-icing-pattern-layer', 'kim-temperature-zero-halo', 'kim-temperature-zero-line'].find(id => map.getLayer?.(id))
    map.addLayer?.({
      id: CLOUD_POTENTIAL_IMAGE_LAYER_ID,
      type: 'raster',
      source: CLOUD_POTENTIAL_IMAGE_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    }, before)
  }
  setVisible(map, true)
  return state
}

export function destroyCloudPotentialOverlay(map) {
  if (!map) return
  if (map.getLayer?.(CLOUD_POTENTIAL_IMAGE_LAYER_ID)) map.removeLayer?.(CLOUD_POTENTIAL_IMAGE_LAYER_ID)
  if (map.getSource?.(CLOUD_POTENTIAL_IMAGE_SOURCE_ID)) map.removeSource?.(CLOUD_POTENTIAL_IMAGE_SOURCE_ID)
  stateByMap.delete(map)
}

export const CLOUD_POTENTIAL_IMAGE_LAYER_IDS = [CLOUD_POTENTIAL_IMAGE_LAYER_ID]
export const CLOUD_POTENTIAL_IMAGE_SOURCE_IDS = [CLOUD_POTENTIAL_IMAGE_SOURCE_ID]
