import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BOUNDARY_FIX_PREVIEW_SOURCE,
  clearRoutePreviewLayers,
  syncBoundaryFixPreview,
  syncRoutePreviewLayers,
  syncVfrWaypointData,
} from './routePreviewSync.js'
import {
  PROC_PREVIEW_SOURCE,
  ROUTE_PREVIEW_SOURCE,
} from './routePreview.js'

function createMockMap() {
  const sourceData = new Map()
  const layout = []
  return {
    sourceData,
    layout,
    getSource(id) {
      if (!sourceData.has(id)) sourceData.set(id, null)
      return {
        setData(data) {
          sourceData.set(id, data)
        },
      }
    },
    getLayer() {
      return true
    },
    setFilter() {},
    setLayoutProperty(id, prop, value) {
      layout.push({ id, prop, value })
    },
  }
}

test('syncRoutePreviewLayers writes IFR route and procedure waypoint-only preview data', () => {
  const map = createMockMap()
  const routeLine = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
  const selectedSid = {
    fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 126.5, lat: 36.5 }],
    geometry: { type: 'LineString', coordinates: [[126, 37], [126.5, 36.5]] },
  }

  syncRoutePreviewLayers(map, {
    routeResult: {
      flightRule: 'IFR',
      previewGeojson: { type: 'FeatureCollection', features: [routeLine] },
      navpointIds: ['A'],
    },
    selectedSid,
    selectedStar: null,
    selectedIap: null,
  })

  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features[0].geometry.coordinates[1][0], 126.5)
  assert.ok(map.sourceData.get(PROC_PREVIEW_SOURCE).features.every((feature) => !feature.properties.role.endsWith('-line')))
})

test('syncVfrWaypointData writes VFR waypoint GeoJSON and clears when fewer than two waypoints exist', () => {
  const map = createMockMap()

  syncVfrWaypointData(map, {
    vfrWaypoints: [{ id: 'RKSI', lon: 126, lat: 37 }, { id: 'RKPC', lon: 127, lat: 36 }],
  })
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 3)

  syncVfrWaypointData(map, { vfrWaypoints: [{ id: 'RKSI', lon: 126, lat: 37 }] })
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 0)
})

test('syncBoundaryFixPreview writes selected boundary fix and returns fit coordinates', () => {
  const map = createMockMap()
  const result = syncBoundaryFixPreview(map, {
    selectedBoundaryFix: 'AGAVO',
    selectedBoundaryNavpoint: { coordinates: { lon: 126.1, lat: 37.2 } },
    routeResult: null,
    selectedSid: {
      fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 126.5, lat: 36.5 }],
      geometry: { type: 'LineString', coordinates: [[126, 37], [126.5, 36.5]] },
    },
  })

  assert.equal(map.sourceData.get(BOUNDARY_FIX_PREVIEW_SOURCE).features[0].properties.label, 'AGAVO')
  assert.deepEqual(result.fitCoordinates.at(-1), [126.1, 37.2])
})

test('clearRoutePreviewLayers clears route, procedure, boundary, and highlight presentation', () => {
  const map = createMockMap()

  clearRoutePreviewLayers(map)

  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(PROC_PREVIEW_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(BOUNDARY_FIX_PREVIEW_SOURCE).features.length, 0)
  assert.ok(map.layout.every((entry) => entry.prop === 'visibility' && entry.value === 'none'))
})
