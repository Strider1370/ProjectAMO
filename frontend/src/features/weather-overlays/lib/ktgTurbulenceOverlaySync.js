import { pickKtgRgba } from './ktgTurbulenceField.js'
import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'

const KTG_IMAGE_SOURCE_ID = 'ktg-turbulence-image-source'
const KTG_IMAGE_LAYER_ID = 'ktg-turbulence-image-layer'
const stateByMap = new WeakMap()

function buildKtgImage(ktgData) {
  const { grid, ktg } = ktgData
  if (!grid?.nx || !grid?.ny || !Array.isArray(ktg)) return null
  const sourceRows = mercatorSourceRows(grid)
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = sourceRows.length
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(grid.nx, sourceRows.length)

  for (let y = 0; y < sourceRows.length; y += 1) {
    // KTG NetCDF rows are ordered south→north; canvas top = north, so flip.
    const sourceY = sourceRows[y]
    for (let x = 0; x < grid.nx; x += 1) {
      const rgba = pickKtgRgba(ktg[sourceY * grid.nx + x])
      const ti = (y * grid.nx + x) * 4
      if (rgba) {
        imageData.data[ti] = rgba[0]
        imageData.data[ti + 1] = rgba[1]
        imageData.data[ti + 2] = rgba[2]
        imageData.data[ti + 3] = rgba[3]
      }
      // else: transparent (default 0)
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function setVisible(map, visible) {
  if (map.getLayer?.(KTG_IMAGE_LAYER_ID)) {
    map.setLayoutProperty?.(KTG_IMAGE_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncKtgTurbulenceOverlay(map, model = {}) {
  if (!map || !model.isVisible || !model.ktgGrid) {
    if (map) setVisible(map, false)
    return null
  }
  const coordinates = cellCoordinatesForGrid(model.ktgGrid.grid)
  if (!coordinates) return null
  const state = stateByMap.get(map) || { ktgGrid: null }
  let source = map.getSource?.(KTG_IMAGE_SOURCE_ID)

  if (state.ktgGrid !== model.ktgGrid || !source) {
    const url = buildKtgImage(model.ktgGrid)
    if (!url) return null
    const image = { url, coordinates }
    if (source?.updateImage) source.updateImage(image)
    else {
      map.addSource?.(KTG_IMAGE_SOURCE_ID, { type: 'image', ...image })
      source = map.getSource?.(KTG_IMAGE_SOURCE_ID)
    }
    state.ktgGrid = model.ktgGrid
    stateByMap.set(map, state)
  }

  if (!map.getLayer?.(KTG_IMAGE_LAYER_ID)) {
    map.addLayer?.({
      id: KTG_IMAGE_LAYER_ID,
      type: 'raster',
      source: KTG_IMAGE_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    })
  }
  setVisible(map, true)
  return state
}

export function destroyKtgTurbulenceOverlay(map) {
  if (!map) return
  if (map.getLayer?.(KTG_IMAGE_LAYER_ID)) map.removeLayer?.(KTG_IMAGE_LAYER_ID)
  if (map.getSource?.(KTG_IMAGE_SOURCE_ID)) map.removeSource?.(KTG_IMAGE_SOURCE_ID)
  stateByMap.delete(map)
}

export const KTG_IMAGE_LAYER_IDS = [KTG_IMAGE_LAYER_ID]
export const KTG_IMAGE_SOURCE_IDS = [KTG_IMAGE_SOURCE_ID]
