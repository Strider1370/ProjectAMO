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
  ROUTE_BASELINE_SOURCE,
  ROUTE_DRAW_SOURCE,
  ROUTE_PENDING_SOURCE,
  PROC_PREVIEW_SOURCE,
  ROUTE_PREVIEW_SOURCE,
} from './routePreview.js'

function createMockMap() {
  const sourceData = new Map()
  const layout = []
  const filters = []
  return {
    sourceData,
    layout,
    filters,
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
    setFilter(id, value) { filters.push({ id, value }) },
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
  assert.ok(map.filters.some(({ id, value }) => id === 'aviation-waypoints-label' && value.at(-1)[0] === '!'))
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

test('syncRoutePreviewLayers keeps selected IFR design waypoints with its line', () => {
  const map = createMockMap()
  const design = (id, coordinates) => ({ id, kind: id === 'base' ? 'base' : 'alternative', routeResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates } },
    { type: 'Feature', properties: { role: 'route-preview-point', sequence: 1, label: 'GONAX' }, geometry: { type: 'Point', coordinates: coordinates[0] } },
  ] } } })

  syncRoutePreviewLayers(map, {
    routeResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [] }, navpointIds: [] },
    routeDesigns: [design('base', [[126, 37], [127, 37], [128, 37], [129, 37]]), design('route-a', [[126, 37], [128, 36]])],
    selectedRouteDesignId: 'route-a', selectedSid: null, selectedStar: null, selectedIap: null,
  })

  const features = map.sourceData.get(ROUTE_PREVIEW_SOURCE).features
  assert.equal(features.filter((feature) => feature.properties.role === 'route-design-line').length, 1)
  assert.equal(features.filter((feature) => feature.properties.role === 'route-design-hit').length, 1)
  assert.equal(features.filter((feature) => feature.properties.role === 'route-preview-point').length, 1)
  assert.equal(features.find((feature) => feature.properties.role === 'route-preview-point').properties.label, 'GONAX')
  assert.equal(features.find((feature) => feature.properties.role === 'route-design-line').properties.selected, true)
  assert.deepEqual(map.sourceData.get(ROUTE_BASELINE_SOURCE).features[0].geometry.coordinates, [[126, 37], [127, 37], [128, 37], [129, 37]])
})

test('syncRoutePreviewLayers keeps baseline, applied route, and pending route in separate sources', () => {
  const map = createMockMap()
  const feature = (coordinates) => ({ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates } })

  syncRoutePreviewLayers(map, {
    routeResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [feature([[126, 37], [127, 37]])] }, navpointIds: [] },
    baselinePreview: { type: 'FeatureCollection', features: [feature([[125, 37], [128, 37]])] },
    pendingRouteResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [feature([[126, 38], [127, 38]])] } },
    selectedSid: null, selectedStar: null, selectedIap: null,
    pendingSid: null, pendingStar: null, pendingIap: null,
  })

  assert.deepEqual(map.sourceData.get(ROUTE_BASELINE_SOURCE).features[0].geometry.coordinates, [[125, 37], [128, 37]])
  assert.deepEqual(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features[0].geometry.coordinates, [[126, 37], [127, 37]])
  assert.deepEqual(map.sourceData.get(ROUTE_PENDING_SOURCE).features[0].geometry.coordinates, [[126, 38], [127, 38]])
})

test('comparison VFR draft exposes no plus handles because line drag inserts waypoints', () => {
  const map = createMockMap()
  const line = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36], [128, 35]] } }
  syncRoutePreviewLayers(map, {
    routeDesigns: [
      { id: 'base', kind: 'base', routeResult: { previewGeojson: { type: 'FeatureCollection', features: [line] } } },
      { id: 'a', kind: 'alternative', routeResult: { previewGeojson: { type: 'FeatureCollection', features: [line] } }, draftEditor: { preview: { flightRule: 'VFR', previewGeojson: { type: 'FeatureCollection', features: [line] } } } },
    ], selectedRouteDesignId: 'a', selectedIap: null,
  })
  const handles = map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.filter((feature) => feature.properties.handleKind === 'insert')
  assert.equal(handles.length, 0)
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.filter((feature) => feature.properties.role === 'route-design-line' && feature.properties.selected).length, 1)
  assert.equal(map.sourceData.get(ROUTE_PENDING_SOURCE).features.length, 0)
})

test('comparison IFR exposes only selected manual points as draggable', () => {
  const map = createMockMap()
  const line = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36], [128, 35]] } }
  const point = { type: 'Feature', properties: { role: 'route-preview-point', sequence: 1, editable: 1, label: 'GONAX' }, geometry: { type: 'Point', coordinates: [127, 36] } }
  syncRoutePreviewLayers(map, {
    routeDesigns: [
      { id: 'base', kind: 'base', routeResult: { previewGeojson: { type: 'FeatureCollection', features: [line] } } },
      { id: 'a', kind: 'alternative', routeResult: { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [line, point] } } },
    ], selectedRouteDesignId: 'a', selectedIap: null,
  })
  const points = map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.filter((feature) => feature.properties.role === 'route-preview-point')
  assert.deepEqual(points.map((feature) => [feature.properties.designId, feature.properties.editable, feature.properties.waypointIndex]), [['a', true, 0]])
})

test('syncRoutePreviewLayers keeps the legacy route and procedures when only the base design exists', () => {
  const map = createMockMap()
  const routeLine = { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
  const routeResult = { flightRule: 'IFR', previewGeojson: { type: 'FeatureCollection', features: [routeLine] }, navpointIds: [] }

  syncRoutePreviewLayers(map, {
    routeResult,
    routeDesigns: [{ id: 'base', routeResult }], selectedRouteDesignId: 'base',
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
    routeResult: { flightRule: 'VFR' },
    vfrWaypoints: [{ id: 'RKSI', lon: 126, lat: 37 }, { id: 'RKPC', lon: 127, lat: 36 }],
  })
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 3)

  syncVfrWaypointData(map, { routeResult: { flightRule: 'VFR' }, vfrWaypoints: [{ id: 'RKSI', lon: 126, lat: 37 }] })
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 0)
})

test('syncVfrWaypointData keeps an applied VFR base in baseline while draft stays draggable in preview', () => {
  const map = createMockMap()
  const applied = [{ id: 'RKSI', lon: 126, lat: 37 }, { id: 'RKPK', lon: 129, lat: 35 }]
  const draft = [{ id: 'RKSI', lon: 126, lat: 37 }, { id: 'GONAX', lon: 127, lat: 36 }, { id: 'RKPK', lon: 129, lat: 35 }]

  syncVfrWaypointData(map, { routeResult: { flightRule: 'VFR' }, appliedVfrWaypoints: applied, draftVfrWaypoints: draft })

  assert.equal(map.sourceData.get('briefing-route-baseline').features.length, 3)
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 4)
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

test('clearRoutePreviewLayers clears every route presentation source and highlight', () => {
  const map = createMockMap()

  clearRoutePreviewLayers(map)

  assert.equal(map.sourceData.get(ROUTE_BASELINE_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(ROUTE_PREVIEW_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(ROUTE_PENDING_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(ROUTE_DRAW_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(PROC_PREVIEW_SOURCE).features.length, 0)
  assert.equal(map.sourceData.get(BOUNDARY_FIX_PREVIEW_SOURCE).features.length, 0)
  assert.ok(map.layout.every((entry) => entry.prop === 'visibility' && entry.value === 'none'))
})
