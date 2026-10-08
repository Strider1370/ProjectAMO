import { decodeIcingGrade, pickIcingColor } from './icingPotentialField.js'
import { cellCoordinatesForGrid, parseRgba, mercatorSourceRows } from './overlayUtils.js'
import { belowGroundCellRgba, decodeKimBelowGround } from './kimBelowGround.js'

const ICING_IMAGE_SOURCE_ID = 'kim-icing-image-source'
const ICING_IMAGE_LAYER_ID = 'kim-icing-image-layer'
const stateByMap = new WeakMap()

function buildIcingPotentialImage(field) {
  const grid = field?.grid
  if (!grid?.nx || !grid?.ny || !Array.isArray(field.icingGrade)) return null
  const sourceRows = mercatorSourceRows(grid)
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = sourceRows.length
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(grid.nx, sourceRows.length)
  // 지면 아래 칸(지상기압보다 큰 기압면)은 난류처럼 같은 이미지에 회색으로 칠한다.
  const belowGround = decodeKimBelowGround(field)

  for (let y = 0; y < sourceRows.length; y += 1) {
    const sourceY = sourceRows[y]
    for (let x = 0; x < grid.nx; x += 1) {
      const sourceIndex = sourceY * grid.nx + x
      const grade = decodeIcingGrade(field.icingGrade[sourceIndex], field)
      const rgba = belowGround?.[sourceIndex] ? belowGroundCellRgba() : grade == null ? [0, 0, 0, 0] : parseRgba(pickIcingColor(grade).color)
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
  if (map.getLayer?.(ICING_IMAGE_LAYER_ID)) {
    map.setLayoutProperty?.(ICING_IMAGE_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncIcingPotentialOverlay(map, model = {}) {
  if (!map || !model.isVisible || !model.icingField) {
    if (map) setVisible(map, false)
    return null
  }
  const coordinates = cellCoordinatesForGrid(model.icingField.grid)
  if (!coordinates) return null
  const state = stateByMap.get(map) || { field: null }
  let source = map.getSource?.(ICING_IMAGE_SOURCE_ID)

  if (state.field !== model.icingField || !source) {
    const url = buildIcingPotentialImage(model.icingField)
    if (!url) return null
    const image = { url, coordinates }
    if (source?.updateImage) source.updateImage(image)
    else {
      map.addSource?.(ICING_IMAGE_SOURCE_ID, { type: 'image', ...image })
      source = map.getSource?.(ICING_IMAGE_SOURCE_ID)
    }
    state.field = model.icingField
    stateByMap.set(map, state)
  }

  if (!map.getLayer?.(ICING_IMAGE_LAYER_ID)) {
    map.addLayer?.({
      id: ICING_IMAGE_LAYER_ID,
      type: 'raster',
      source: ICING_IMAGE_SOURCE_ID,
      slot: 'middle',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    })
  }
  setVisible(map, true)
  return state
}

export function destroyIcingPotentialOverlay(map) {
  if (!map) return
  if (map.getLayer?.(ICING_IMAGE_LAYER_ID)) map.removeLayer?.(ICING_IMAGE_LAYER_ID)
  if (map.getSource?.(ICING_IMAGE_SOURCE_ID)) map.removeSource?.(ICING_IMAGE_SOURCE_ID)
  stateByMap.delete(map)
}

export const ICING_IMAGE_LAYER_IDS = [ICING_IMAGE_LAYER_ID]
export const ICING_IMAGE_SOURCE_IDS = [ICING_IMAGE_SOURCE_ID]
