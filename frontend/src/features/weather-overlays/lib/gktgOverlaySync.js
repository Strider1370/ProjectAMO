import { syncKtgTurbulenceOverlay, destroyKtgTurbulenceOverlay } from './ktgTurbulenceOverlaySync.js'
import { gktgBand } from '../../../../../shared/gktg.js'
import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'
import { belowGroundCellRgba, decodeKimBelowGround } from './kimBelowGround.js'

const GKTG_IMAGE_SOURCE_ID = 'kim-gktg-image-source'
const GKTG_IMAGE_LAYER_ID = 'kim-gktg-image-layer'
const stateByMap = new WeakMap()

function buildGktgImage(field) {
  const grid = field?.grid
  if (!grid?.nx || !grid?.ny || !Array.isArray(field.gktg)) return null
  const sourceRows = mercatorSourceRows(grid)
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = sourceRows.length
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(grid.nx, sourceRows.length)
  const belowGround = decodeKimBelowGround(field)

  for (let y = 0; y < sourceRows.length; y += 1) {
    const sourceY = sourceRows[y]
    for (let x = 0; x < grid.nx; x += 1) {
      const sourceIndex = sourceY * grid.nx + x
      // 지면 아래 칸은 난류 칸처럼 같은 이미지에 지형색으로 칠한다(kimBelowGround.js).
      const rgba = belowGround?.[sourceIndex] ? belowGroundCellRgba() : gktgBand(field.gktg[sourceIndex])?.rgba || [0, 0, 0, 0]
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
  if (map.getLayer?.(GKTG_IMAGE_LAYER_ID)) {
    map.setLayoutProperty?.(GKTG_IMAGE_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncGktgOverlay(map, model = {}) {
  if (!map) return null
  if (model.ktgGrid?.ktg && model.ktgGrid?.product !== 'GKTG') {
    setVisible(map, false)
    return syncKtgTurbulenceOverlay(map, model)
  }
  destroyKtgTurbulenceOverlay(map)
  if (!map || !model.isVisible || !model.ktgGrid) {
    if (map) setVisible(map, false)
    return null
  }
  const coordinates = cellCoordinatesForGrid(model.ktgGrid.grid)
  if (!coordinates) return null
  const state = stateByMap.get(map) || { field: null }
  let source = map.getSource?.(GKTG_IMAGE_SOURCE_ID)

  if (state.field !== model.ktgGrid || !source) {
    const url = buildGktgImage(model.ktgGrid)
    if (!url) return null
    const image = { url, coordinates }
    if (source?.updateImage) source.updateImage(image)
    else {
      map.addSource?.(GKTG_IMAGE_SOURCE_ID, { type: 'image', ...image })
      source = map.getSource?.(GKTG_IMAGE_SOURCE_ID)
    }
    state.field = model.ktgGrid
    stateByMap.set(map, state)
  }

  if (!map.getLayer?.(GKTG_IMAGE_LAYER_ID)) {
    map.addLayer?.({
      id: GKTG_IMAGE_LAYER_ID,
      type: 'raster',
      source: GKTG_IMAGE_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    })
  }
  setVisible(map, true)
  return state
}

export function destroyGktgOverlay(map) {
  destroyKtgTurbulenceOverlay(map)
  if (!map) return
  if (map.getLayer?.(GKTG_IMAGE_LAYER_ID)) map.removeLayer?.(GKTG_IMAGE_LAYER_ID)
  if (map.getSource?.(GKTG_IMAGE_SOURCE_ID)) map.removeSource?.(GKTG_IMAGE_SOURCE_ID)
  stateByMap.delete(map)
}

export const GKTG_IMAGE_LAYER_IDS = [GKTG_IMAGE_LAYER_ID]
export const GKTG_IMAGE_SOURCE_IDS = [GKTG_IMAGE_SOURCE_ID]
