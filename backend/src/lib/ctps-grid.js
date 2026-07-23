import { latLonToEN } from './lcc-projection.js'

export const CTPS_GRID = Object.freeze({
  width: 900,
  height: 900,
  pixelSize: 2000,
  ulEasting: -899000,
  ulNorthing: 899000,
})

export function ctpsIndexForLatLon(lat, lon, grid = CTPS_GRID) {
  const [easting, northing] = latLonToEN(lat, lon)
  const col = Math.round((easting - grid.ulEasting) / grid.pixelSize)
  const row = Math.round((grid.ulNorthing - northing) / grid.pixelSize)
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null
  return row * grid.width + col
}
