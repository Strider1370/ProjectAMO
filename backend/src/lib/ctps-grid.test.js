import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CTPS_GRID, ctpsIndexForLatLon } from './ctps-grid.js'

describe('ctpsIndexForLatLon', () => {
  it('maps Seoul into the CTPS grid and rejects outside points', () => {
    const index = ctpsIndexForLatLon(37.5, 127)
    assert.ok(index !== null && index >= 0 && index < CTPS_GRID.width * CTPS_GRID.height)
    assert.equal(ctpsIndexForLatLon(0, 0), null)
  })
})
