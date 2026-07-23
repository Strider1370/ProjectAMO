import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CTPS_GRID } from './ctps-grid.js'
import { enToLatLon, latLonToEN } from './lcc-projection.js'
import { KO_DISPLAY_GRID, displayPixelToSourceIndex, displayPointToLonLat } from './satellite-ko-grid.js'

describe('KO display grid', () => {
  it('round-trips the GK2A Lambert projection', () => {
    const [easting, northing] = latLonToEN(37.5665, 126.978)
    const [lat, lon] = enToLatLon(easting, northing)
    assert.ok(Math.abs(lat - 37.5665) < 1e-9)
    assert.ok(Math.abs(lon - 126.978) < 1e-9)
  })

  it('maps each display corner and centre deterministically', () => {
    for (const [x, y] of [[0, 0], [KO_DISPLAY_GRID.width - 1, 0], [0, KO_DISPLAY_GRID.height - 1], [KO_DISPLAY_GRID.width - 1, KO_DISPLAY_GRID.height - 1], [600, 524]]) {
      const [lon, lat] = displayPointToLonLat(x, y)
      assert.ok(lon >= KO_DISPLAY_GRID.west && lon <= KO_DISPLAY_GRID.east)
      assert.ok(lat >= KO_DISPLAY_GRID.south && lat <= KO_DISPLAY_GRID.north)
    }
    assert.ok(displayPixelToSourceIndex(600, 524, CTPS_GRID) !== null)
    assert.equal(displayPixelToSourceIndex(-1, 0, CTPS_GRID), null)
  })
})
