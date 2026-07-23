import { latLonToEN } from './lcc-projection.js'

const DEG2RAD = Math.PI / 180

export const KO_DISPLAY_GRID = Object.freeze({
  west: 114,
  east: 138,
  south: 29.3,
  north: 45.8,
  width: 1200,
  height: 1049,
  bounds: [[29.3, 114], [45.8, 138]],
})

function mercatorYToLat(y) {
  return Math.atan(Math.sinh(y)) / DEG2RAD
}

export function displayPointToLonLat(x, y, grid = KO_DISPLAY_GRID) {
  const minMercatorY = Math.log(Math.tan(Math.PI / 4 + grid.south * DEG2RAD / 2))
  const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + grid.north * DEG2RAD / 2))
  const lon = grid.west + (x + 0.5) / grid.width * (grid.east - grid.west)
  const mercatorY = maxMercatorY - (y + 0.5) / grid.height * (maxMercatorY - minMercatorY)
  return [lon, mercatorYToLat(mercatorY)]
}

export function displayPixelToSourceIndex(x, y, sourceGrid, displayGrid = KO_DISPLAY_GRID) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= displayGrid.width || y < 0 || y >= displayGrid.height) return null
  const [lon, lat] = displayPointToLonLat(x, y, displayGrid)
  const [easting, northing] = latLonToEN(lat, lon)
  const col = Math.round((easting - sourceGrid.ulEasting) / sourceGrid.pixelSize)
  const row = Math.round((sourceGrid.ulNorthing - northing) / sourceGrid.pixelSize)
  if (col < 0 || col >= sourceGrid.width || row < 0 || row >= sourceGrid.height) return null
  return row * sourceGrid.width + col
}
