import assert from 'node:assert/strict'
import test from 'node:test'

import { RASTER_ROW_SCALE, cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'

const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const latFromMercatorY = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI

test('each image row shows the grid row whose cell contains the latitude it is drawn at', () => {
  for (const grid of [{ nx: 205, ny: 169, lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 }, { nx: 541, ny: 529, lonMin: 100, lonMax: 145, latMin: 6, latMax: 50 }]) {
    const rows = mercatorSourceRows(grid)
    assert.equal(rows.length, grid.ny * RASTER_ROW_SCALE)
    const [[west, north], , [east, south]] = cellCoordinatesForGrid(grid)
    const dy = (grid.latMax - grid.latMin) / (grid.ny - 1)
    assert.ok(Math.abs(west - (grid.lonMin - (grid.lonMax - grid.lonMin) / (grid.nx - 1) / 2)) < 1e-9 && east > grid.lonMax)
    const top = mercatorY(north)
    const bottom = mercatorY(south)
    for (let y = 0; y < rows.length; y++) {
      const lat = latFromMercatorY(top - ((y + 0.5) / rows.length) * (top - bottom))
      assert.ok(Math.abs(grid.latMin + rows[y] * dy - lat) <= dy / 2 + 1e-9, `row ${y}`)
    }
  }
})

test('the old linear stacking misplaced mid-latitudes by many rows on the expanded domain', () => {
  const grid = { nx: 541, ny: 529, lonMin: 100, lonMax: 145, latMin: 6, latMax: 50 }
  const rows = mercatorSourceRows(grid, grid.ny)
  const middle = Math.floor(grid.ny / 2)
  assert.ok(Math.abs(rows[middle] - (grid.ny - 1 - middle)) > 20)
})
