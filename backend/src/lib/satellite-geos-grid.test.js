import test from 'node:test'
import assert from 'node:assert/strict'
import { geosPixelForLatLon, resampleGeosCtpsToKo } from './satellite-geos-grid.js'

const grid = { width: 1900, height: 1200, longitude: 128.1999969482422, satelliteHeight: 35785864, semiMajor: 6378137, semiMinor: 6356752.5, columnScale: 20425338, lineScale: 20425338, columnOffset: 1125.5, lineOffset: 2337.5 }

test('GK2A navigation agrees with independent NMSC ELA latitude/longitude table', () => {
  // Samples from NMSC gk2a_ami_ela020ge_latlon.nc, not computed by this module.
  for (const [lat, lon, col, row] of [[55.069557189941406, 85.34557342529297, 0, 0], [50.54925537109375, 130.4738006591797, 1200, 52], [36.59775161743164, 115.90599060058594, 600, 526], [24.409061431884766, 129.7156219482422, 1200, 1052]]) {
    const pixel = geosPixelForLatLon(lat, lon, grid)
    assert.ok(Math.abs(pixel[0] - col) < 0.002)
    assert.ok(Math.abs(pixel[1] - row) < 0.002)
  }
  assert.equal(geosPixelForLatLon(0, -51.8, grid), null)
})

test('resampling preserves raw fill/quality values and KO binary grid dimensions', () => {
  const count = grid.width * grid.height
  const parsed = { cth: new Uint16Array(count).fill(1200), ctt: new Uint16Array(count).fill(25000), flag: new Uint8Array(count).fill(1), attrs: { cthFill: 65535, cttFill: 65535, flagFill: 255, cthScale: 0.01 } }
  const result = resampleGeosCtpsToKo(parsed, grid)
  assert.equal(result.attrs.width, 900)
  assert.equal(result.attrs.height, 900)
  assert.equal(result.attrs.pixelSize, 2000)
  assert.equal(result.cth.length, 810000)
  assert.equal(result.cth[450 * 900 + 450], 1200)
  assert.equal(result.flag[450 * 900 + 450], 1)
  parsed.cth.fill(65535)
  assert.equal(resampleGeosCtpsToKo(parsed, grid).cth[450 * 900 + 450], 65535)
  assert.throws(() => resampleGeosCtpsToKo(parsed, { ...grid, columnOffset: 1e8 }), /does not cover/)
})
