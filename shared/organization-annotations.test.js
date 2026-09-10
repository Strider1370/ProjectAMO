import assert from 'node:assert/strict'
import test from 'node:test'
import { projectOrganizationAnnotations } from './organization-annotations.js'

const equatorRoute = { type: 'LineString', coordinates: [[0, 0], [0.1, 0]] }

test('polygon re-entry preserves every route distance interval', () => {
  const routeGeometry = {
    type: 'LineString',
    coordinates: [[0, 0], [0.03, 0], [0.03, 0.03], [0, 0.03], [0, 0]],
  }
  const [item] = projectOrganizationAnnotations({
    routeGeometry,
    annotations: [{
      id: 'zone',
      geometry: { type: 'Polygon', coordinates: [[[0.009, -0.01], [0.021, -0.01], [0.021, 0.04], [0.009, 0.04], [0.009, -0.01]]] },
      altitude: { minFt: 1500, maxFt: 4000, reference: 'AMSL' },
    }],
  })
  assert.equal(item.relationship, 'on_route')
  assert.equal(item.distanceIntervals.length, 2)
  assert.deepEqual(item.altitude, { minFt: 1500, maxFt: 4000, reference: 'AMSL' })
  assert.ok(item.distanceIntervals[1].startNm > item.distanceIntervals[0].endNm)
})

test('circle projection keeps the canonical center and radius', () => {
  const circle = { center: [0.05, 0], radiusMeters: 500 }
  const [item] = projectOrganizationAnnotations({
    routeGeometry: equatorRoute,
    annotations: [{ id: 'circle', circle, authorUserId: 17, updatedByUserId: 18 }],
  })
  assert.deepEqual(item.circle, circle)
  assert.equal(item.geometry, null)
  assert.equal(item.distanceIntervals.length, 1)
  assert.equal(item.authorUserId, 17)
  assert.equal(item.updatedByUserId, 18)
  const widthMeters = (item.distanceIntervals[0].endNm - item.distanceIntervals[0].startNm) * 1852
  assert.ok(Math.abs(widthMeters - 1000) < 2)
})

test('server Circle shape is normalized without losing its radius source', () => {
  const [item] = projectOrganizationAnnotations({
    routeGeometry: equatorRoute,
    annotations: [{ id: 'legacy-circle', shapeType: 'Circle', geometry: { center: [0.05, 0], radiusM: 250 } }],
  })
  assert.deepEqual(item.circle, { center: [0.05, 0], radiusMeters: 250 })
  assert.equal(item.relationship, 'on_route')
})

test('point and line use only the one metre numerical tolerance', () => {
  const nearLat = 0.5 / 111195
  const farLat = 1.5 / 111195
  const items = projectOrganizationAnnotations({
    routeGeometry: equatorRoute,
    annotations: [
      { id: 'near-point', geometry: { type: 'Point', coordinates: [0.05, nearLat] } },
      { id: 'far-point', geometry: { type: 'Point', coordinates: [0.05, farLat] } },
      { id: 'near-line', geometry: { type: 'LineString', coordinates: [[0.04, nearLat], [0.06, nearLat]] } },
      { id: 'far-line', geometry: { type: 'LineString', coordinates: [[0.04, farLat], [0.06, farLat]] } },
    ],
  })
  assert.equal(items.find((item) => item.id === 'near-point').relationship, 'on_route')
  assert.equal(items.find((item) => item.id === 'far-point').relationship, 'off_route')
  assert.equal(items.find((item) => item.id === 'near-line').relationship, 'on_route')
  assert.equal(items.find((item) => item.id === 'far-line').relationship, 'off_route')
})

test('repeated route visits to one point remain distinct', () => {
  const [item] = projectOrganizationAnnotations({
    routeGeometry: { type: 'LineString', coordinates: [[0, 0], [0.1, 0], [0, 0]] },
    annotations: [{ id: 'turn', geometry: { type: 'Point', coordinates: [0.025, 0] } }],
  })
  assert.equal(item.distanceIntervals.length, 2)
  assert.ok(item.distanceIntervals[1].startNm > item.distanceIntervals[0].startNm)
})

test('text-only and off-route annotations are distinguished', () => {
  const items = projectOrganizationAnnotations({
    routeGeometry: equatorRoute,
    flightId: 'flight-1',
    annotations: [
      { id: 'text', title: '설명만' },
      { id: 'off', geometry: { type: 'Point', coordinates: [1, 1] } },
    ],
  })
  assert.equal(items[0].relationship, 'text_only')
  assert.equal(items[1].relationship, 'off_route')
  assert.equal(items[0].flightId, 'flight-1')
})
