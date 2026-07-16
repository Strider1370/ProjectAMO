import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateAltitudeExposure,
  evaluateHorizontalExposure,
  evaluateTimeStatus,
} from '../src/briefing/hazard-exposure.js'

const geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
const axis = {
  totalDistanceNm: 100,
  samples: [
    { distanceNm: 0, lon: -1, lat: -1 },
    { distanceNm: 40, lon: 5, lat: 5 },
    { distanceNm: 60, lon: 6, lat: 6 },
    { distanceNm: 100, lon: 20, lat: 20 },
  ],
}

test('horizontal, altitude, and missing-time status remain separate', () => {
  const horizontal = evaluateHorizontalExposure({ axis, geometry, enRouteRange: { status: 'aligned', startNm: 20, endNm: 80 } })
  const altitude = evaluateAltitudeExposure({ horizontalExposure: horizontal, bandFt: { lowFt: 18000, highFt: 25000 }, plannedCruiseAltitudeFt: 33000 })
  const timeStatus = evaluateTimeStatus({ validFrom: '2026-01-01T00:00:00Z', validTo: '2026-01-01T03:00:00Z' })

  assert.deepEqual(horizontal, { status: 'intersects', intervals: [{ startNm: 40, endNm: 60 }] })
  assert.equal(altitude.status, 'clear')
  assert.equal(timeStatus, 'not_provided')
})

test('terminal-only overlap is excluded from en-route exposure', () => {
  const exposure = evaluateHorizontalExposure({ axis, geometry, enRouteRange: { status: 'aligned', startNm: 70, endNm: 100 } })
  assert.deepEqual(exposure, { status: 'clear', intervals: [] })
})
