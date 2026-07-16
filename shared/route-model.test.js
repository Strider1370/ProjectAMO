import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCommonRouteModel } from './route-model.js'

const feature = (coordinates) => ({
  type: 'Feature',
  properties: { role: 'route-segment-line' },
  geometry: { type: 'LineString', coordinates },
})

test('keeps terminal procedure ranges outside aligned en-route segments', () => {
  const model = buildCommonRouteModel({
    routeGeometry: { type: 'LineString', coordinates: [[0, 0], [0.5, 0], [1, 0], [2, 0], [3, 0], [3.5, 0], [4, 0]] },
    routeResult: {
      flightRule: 'IFR',
      navpointIds: ['ENTRY', 'MID', 'EXIT'],
      segments: [
        { id: 'R1-1', routeId: 'R1', from: 'ENTRY', to: 'MID', routeType: 'ATS', cycle: 'AIRAC TEST' },
        { id: 'R1-2', routeId: 'R1', from: 'MID', to: 'EXIT', routeType: 'ATS', cycle: 'AIRAC TEST' },
      ],
      previewGeojson: { type: 'FeatureCollection', features: [feature([[1, 0], [2, 0]]), feature([[2, 0], [3, 0]])] },
    },
  })

  assert.equal(model.graphConnectionStatus, 'connected')
  assert.deepEqual(model.enRouteSegments.map((segment) => segment.id), ['R1-1', 'R1-2'])
  assert.equal(model.enRouteSegments[0].endNm, model.enRouteSegments[1].startNm)
  assert.ok(model.enRouteRange.startNm > 0)
  assert.ok(model.enRouteRange.endNm < model.routeAxis.totalDistanceNm)
})

test('does not invent an en-route distance when a segment is absent from the route geometry', () => {
  const model = buildCommonRouteModel({
    routeGeometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
    routeResult: {
      flightRule: 'IFR',
      segments: [{ id: 'R2-1', routeId: 'R2', from: 'A', to: 'B' }],
      previewGeojson: { type: 'FeatureCollection', features: [feature([[2, 0], [3, 0]])] },
    },
  })

  assert.equal(model.enRouteSegments[0].alignmentStatus, 'unavailable')
  assert.equal(model.enRouteRange.status, 'unavailable')
})
