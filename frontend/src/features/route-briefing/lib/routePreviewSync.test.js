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

test('syncRoutePreviewLayers writes IFR route and full procedure preview data (lines + waypoints)', () => {
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
  assert.ok(map.sourceData.get(PROC_PREVIEW_SOURCE).features.some((feature) => feature.properties.role === 'sid-line'))
})

test('syncRoutePreviewLayers clears stale route line when route result is removed', () => {
  const map = createMockMap()
  const routeLine = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }

  syncRoutePreviewLayers(map, {
    routeResult: {
      flightRule: 'IFR',
      previewGeojson: { type: 'FeatureCollection', features: [routeLine] },
      navpointIds: ['A'],
    },
    selectedSid: null,
    selectedStar: null,
    selectedIap: null,
  })
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 1)

  syncRoutePreviewLayers(map, {
    routeResult: null,
    selectedSid: null,
    selectedStar: null,
    selectedIap: null,
  })

  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 0)
})

test('syncRoutePreviewLayers writes candidate lines and selects only the active candidate', () => {
  const map = createMockMap()
  const candidate = (id, coordinates) => ({ id, routeResult: { previewGeojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates } }] } } })

  syncRoutePreviewLayers(map, {
    routeResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [] }, navpointIds: [] },
    routeCandidates: [candidate('base', [[126, 37], [127, 36]]), candidate('alt-1', [[126, 37], [128, 36]]), candidate('alt-2', [[126, 37], [129, 36]])],
    selectedCandidateId: 'alt-1', selectedSid: null, selectedStar: null, selectedIap: null,
  })

  const features = map.sourceData.get(ROUTE_PREVIEW_SOURCE).features
  assert.equal(features.length, 3)
  assert.deepEqual(features.map((feature) => feature.properties.selected), [false, true, false])
})

test('syncRoutePreviewLayers removes airport connector legs from procedure candidates', () => {
  const map = createMockMap()
  const routeResult = { previewGeojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 37], [128, 37], [129, 37]] } }] } }

  syncRoutePreviewLayers(map, {
    routeResult,
    routeCandidates: [{ id: 'base', routeResult, procedures: { sid: {}, star: {}, iapKey: null } }, { id: 'alt-1', routeResult, procedures: { sid: {}, star: {}, iapKey: null } }],
    selectedCandidateId: 'base', selectedSid: null, selectedStar: null, selectedIap: null,
  })

  assert.deepEqual(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features[0].geometry.coordinates, [[127, 37], [128, 37]])
})

test('syncRoutePreviewLayers keeps the legacy route and procedures when only the base candidate exists', () => {
  const map = createMockMap()
  const routeLine = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
  const routeResult = { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [routeLine] }, navpointIds: [] }

  syncRoutePreviewLayers(map, {
    routeResult,
    routeCandidates: [{ id: 'base', routeResult }], selectedCandidateId: 'base',
    selectedSid: { fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 126.5, lat: 36.5 }] },
    selectedStar: null, selectedIap: null,
  })

  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features[0].properties.role, 'route-preview-line')
  assert.ok(map.sourceData.get(PROC_PREVIEW_SOURCE).features.some((feature) => feature.properties.role === 'sid-line'))
})

test('syncRoutePreviewLayers accepts an IAP with fixes but no precomputed geometry', () => {
  const map = createMockMap()

  const { fitCoordinates } = syncRoutePreviewLayers(map, {
    routeResult: null,
    selectedSid: null,
    selectedStar: null,
    selectedIap: {
      fixes: [
        { id: 'IAF', coordinates: { lon: 127.739333, lat: 35.035944 } },
        { id: 'RW06L', coordinates: { lon: 128.056806, lat: 35.082194 } },
      ],
    },
  })

  assert.deepEqual(fitCoordinates, [[127.739333, 35.035944], [128.056806, 35.082194], [127.739333, 35.035944], [128.056806, 35.082194]])
  assert.equal(map.sourceData.get(PROC_PREVIEW_SOURCE).features[0].geometry.type, 'LineString')
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
