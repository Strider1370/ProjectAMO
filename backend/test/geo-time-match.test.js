import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pointInPolygon, routeIntersectsGeometry, timeWindowsOverlap, routeIntervalInGeometry } from '../src/briefing/geo-time-match.js'

const square = { type: 'Polygon', coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]] }

const intervalAxis = { samples: [
  { distanceNm: 0, lon: -5, lat: -5 },
  { distanceNm: 10, lon: 2, lat: 2 },
  { distanceNm: 20, lon: 5, lat: 5 },
  { distanceNm: 30, lon: 8, lat: 8 },
  { distanceNm: 40, lon: 20, lat: 20 },
] }

test('routeIntervalInGeometry: returns entered interval by distance', () => {
  const r = routeIntervalInGeometry(intervalAxis, square)
  assert.equal(r.entered, true)
  assert.equal(r.startNm, 10)
  assert.equal(r.endNm, 30)
})
test('routeIntervalInGeometry: no entry', () => {
  const out = { samples: [{ distanceNm: 0, lon: 20, lat: 20 }, { distanceNm: 5, lon: 30, lat: 30 }] }
  assert.equal(routeIntervalInGeometry(out, square).entered, false)
})

test('pointInPolygon: inside', () => {
  assert.equal(pointInPolygon([5,5], square.coordinates[0]), true)
})
test('pointInPolygon: outside', () => {
  assert.equal(pointInPolygon([20,20], square.coordinates[0]), false)
})
test('routeIntersectsGeometry: a route sample falls inside', () => {
  const route = { type:'LineString', coordinates: [[-5,-5],[5,5],[20,20]] }
  assert.equal(routeIntersectsGeometry(route, square), true)
})
test('routeIntersectsGeometry: route entirely outside', () => {
  const route = { type:'LineString', coordinates: [[20,20],[30,30]] }
  assert.equal(routeIntersectsGeometry(route, square), false)
})
test('routeIntersectsGeometry: MultiPolygon supported', () => {
  const multi = { type:'MultiPolygon', coordinates: [ square.coordinates ] }
  const route = { type:'LineString', coordinates: [[5,5],[5,6]] }
  assert.equal(routeIntersectsGeometry(route, multi), true)
})

test('routeIntervalInGeometry: documents the sample-only limits used by route exposure', () => {
  const betweenSamples = { samples: [{ distanceNm: 0, lon: 0, lat: 0 }, { distanceNm: 2, lon: 2, lat: 0 }] }
  const thinBetween = { type: 'Polygon', coordinates: [[[0.9, -1], [1.1, -1], [1.1, 1], [0.9, 1], [0.9, -1]]] }
  const hole = { type: 'Polygon', coordinates: [[[0, -1], [2, -1], [2, 1], [0, 1], [0, -1]], [[0.5, -0.5], [1.5, -0.5], [1.5, 0.5], [0.5, 0.5], [0.5, -0.5]]] }
  const multi = { type: 'MultiPolygon', coordinates: [thinBetween.coordinates, [[[1.9, -1], [2.1, -1], [2.1, 1], [1.9, 1], [1.9, -1]]] ] }
  const narrowAtSample = { type: 'Polygon', coordinates: [[[0.99, -0.011], [1.01, -0.011], [1.01, 0.011], [0.99, 0.011], [0.99, -0.011]]] }
  const withMiddleSample = { samples: [...betweenSamples.samples, { distanceNm: 1, lon: 1, lat: 0 }] }

  assert.equal(routeIntervalInGeometry(betweenSamples, thinBetween).entered, false)
  assert.equal(routeIntervalInGeometry(withMiddleSample, hole).entered, true)
  assert.equal(routeIntervalInGeometry(betweenSamples, multi).endNm, 2)
  assert.equal(routeIntervalInGeometry(withMiddleSample, narrowAtSample).entered, true)
})
test('timeWindowsOverlap: overlapping', () => {
  assert.equal(timeWindowsOverlap(
    '2026-06-26T09:00:00Z','2026-06-26T10:30:00Z',
    '2026-06-26T10:00:00Z','2026-06-26T14:00:00Z'), true)
})
test('timeWindowsOverlap: disjoint', () => {
  assert.equal(timeWindowsOverlap(
    '2026-06-26T09:00:00Z','2026-06-26T10:00:00Z',
    '2026-06-26T11:00:00Z','2026-06-26T14:00:00Z'), false)
})
