import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_GRID, echoTopCellToLatLon, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'

test('grid covers the HSR composite at 2 km spacing', () => {
  assert.equal(ECHO_TOP_GRID.stride, 4)
  assert.equal(ECHO_TOP_GRID.nx, 577)
  assert.equal(ECHO_TOP_GRID.ny, 721)
})

test('index round-trips through lat/lon near Seoul', () => {
  const index = echoTopIndexForLatLon(37.5665, 126.978)
  assert.ok(Number.isInteger(index) && index >= 0)
  const iy = Math.floor(index / ECHO_TOP_GRID.nx)
  const ix = index % ECHO_TOP_GRID.nx
  const { lat, lon } = echoTopCellToLatLon(ix, iy)
  assert.ok(Math.abs(lat - 37.5665) < 0.02, `lat ${lat}`)
  assert.ok(Math.abs(lon - 126.978) < 0.02, `lon ${lon}`)
})

test('points outside the composite return null', () => {
  assert.equal(echoTopIndexForLatLon(0, 0), null)
  assert.equal(echoTopIndexForLatLon(60, 126), null)
})
