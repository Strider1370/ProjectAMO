import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteExposure } from '../src/briefing/route-exposure.js'

const routeGeometry = { type: 'LineString', coordinates: [[0, 0], [2, 0]] }
const intersects = { type: 'Polygon', coordinates: [[[0.5, -1], [1.5, -1], [1.5, 1], [0.5, 1], [0.5, -1]]] }
const outside = { type: 'Polygon', coordinates: [[[3, -1], [4, -1], [4, 1], [3, 1], [3, -1]]] }
const window = { etd: '2026-01-01T00:00:00Z', eta: '2026-01-01T02:00:00Z' }
const ts = (overrides = {}) => ({ id: 'ts', phenomenon_code: 'EMBD_TS', phenomenon_label: 'Embedded TS', geometry: intersects, valid_from: '2026-01-01T00:30:00Z', valid_to: '2026-01-01T03:00:00Z', ...overrides })

test('route exposure triggers only for time-matched intersecting TS polygons', () => {
  const result = buildRouteExposure({ routeGeometry, ...window, sigmet: { items: [ts()] } })
  assert.equal(result.trigger, 'ready')
  assert.equal(result.hazards.length, 1)

  assert.equal(buildRouteExposure({ routeGeometry, ...window, sigmet: { items: [ts({ geometry: outside })] } }).trigger, 'none')
  assert.equal(buildRouteExposure({ routeGeometry, sigmet: { items: [ts()] } }).trigger, 'time_unknown')
  assert.equal(buildRouteExposure({ routeGeometry, ...window, airmet: { items: [ts()] } }).trigger, 'none')
  assert.equal(buildRouteExposure({ routeGeometry, ...window, sigmetOverseas: { items: [ts({ id: 'overseas-ts' })] } }).trigger, 'ready')
  assert.equal(buildRouteExposure({ routeGeometry, ...window, sigmet: { items: [ts({ valid_from: 'bad', valid_to: 'bad' })] } }).trigger, 'unavailable')
})

test('route exposure preserves unavailable geometry and counts recent nearby lightning only', () => {
  const result = buildRouteExposure({
    routeGeometry,
    ...window,
    sigmet: { items: [ts({ geometry: null })] },
    lightning: {
      fetched_at: '2026-01-01T02:00:00Z', history_window_minutes: 60,
      nationwide: { strikes: [
        { time: '2026-01-01T01:30:00Z', lon: 1, lat: 0 },
        { time: '2026-01-01T01:30:00Z', lon: 1, lat: 2 },
        { time: '2026-01-01T00:30:00Z', lon: 1, lat: 0 },
      ] },
    },
  })
  assert.equal(result.trigger, 'unavailable')
  assert.deepEqual(result.comparisonOnly.lightning, {
    status: 'available', observedAt: '2026-01-01T01:30:00Z', within20NmCount: 1,
  })
})
