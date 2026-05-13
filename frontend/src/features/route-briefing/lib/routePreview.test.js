import test from 'node:test'
import assert from 'node:assert/strict'
import {
  augmentRouteWithProcedures,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
  calcVfrDistance,
  relabeledWaypoints,
} from './routePreview.js'

test('relabeledWaypoints preserves fixed points and labels editable points in order', () => {
  const result = relabeledWaypoints([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'custom-a', lon: 127, lat: 37 },
    { id: 'custom-b', lon: 128, lat: 36 },
  ])

  assert.equal(result[0].id, 'RKSI')
  assert.equal(result[1].id, 'WP1')
  assert.equal(result[2].id, 'WP2')
})

test('buildVfrGeoJSON returns a route line and waypoint features', () => {
  const result = buildVfrGeoJSON([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'WP1', lon: 127, lat: 37 },
  ])

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 3)
  assert.equal(result.features[0].geometry.type, 'LineString')
  assert.deepEqual(result.features[0].geometry.coordinates, [[126.45, 37.46], [127, 37]])
})

test('calcVfrDistance returns zero for fewer than two waypoints', () => {
  assert.equal(calcVfrDistance([]), 0)
  assert.equal(calcVfrDistance([{ lon: 126.45, lat: 37.46 }]), 0)
})

test('buildProcedureGeoJSON includes line and waypoint features for SID, STAR, and IAP', () => {
  const sid = {
    fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 127, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
  }
  const star = {
    fixes: [{ id: 'C', lon: 128, lat: 37 }, { id: 'D', lon: 129, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[128, 37], [129, 38]] },
  }
  const iap = {
    fixes: [
      { id: 'E', coordinates: { lon: 130, lat: 37 } },
      { id: 'F', coordinates: { lon: 131, lat: 38 } },
    ],
    geometry: { type: 'LineString', coordinates: [[130, 37], [131, 38]] },
  }

  const result = buildProcedureGeoJSON(sid, star, iap)
  const roles = result.features.map((feature) => feature.properties.role)

  assert.ok(roles.includes('sid-line'))
  assert.ok(roles.includes('star-line'))
  assert.ok(roles.includes('iap-line'))
  assert.ok(roles.includes('sid-wp'))
  assert.ok(roles.includes('star-wp'))
  assert.ok(roles.includes('iap-wp'))
})

test('augmentRouteWithProcedures leaves route unchanged when no procedures exist', () => {
  const preview = buildVfrGeoJSON([
    { id: 'A', lon: 126, lat: 37 },
    { id: 'B', lon: 127, lat: 38 },
  ])

  assert.deepEqual(augmentRouteWithProcedures(preview, null, null, null), preview)
})
