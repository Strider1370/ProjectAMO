import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProcedureContextPayload,
  buildProcedurePayload,
  buildCrossSectionRequest,
  buildRouteProfileMarkersPayload,
  buildVerticalProfileRequest,
} from './verticalProfileRequest.js'

test('buildProcedurePayload normalizes procedure fixes', () => {
  const result = buildProcedurePayload({
    id: 'SID1',
    label: 'SID 1',
    fixes: [
      { id: 'A', lon: 126, lat: 37, legDistanceNm: 3.2, altitude: '5000' },
      { id: 'B', coordinates: { lon: 127, lat: 38 } },
    ],
  }, 'SID')

  assert.equal(result.type, 'SID')
  assert.equal(result.id, 'SID1')
  assert.equal(result.fixes.length, 2)
  assert.deepEqual(result.fixes[0], {
    id: 'A',
    lon: 126,
    lat: 37,
    legDistanceNm: 3.2,
    altitude: '5000',
  })
})

test('buildProcedureContextPayload omits empty procedures and preserves route fixes', () => {
  const result = buildProcedureContextPayload({
    routeResult: { flightRule: 'IFR', entryFix: 'AGAVO', exitFix: 'SAPRA' },
    selectedSid: { id: 'SID1', fixes: [] },
    selectedStar: null,
    selectedIap: { id: 'IAP1', fixes: [] },
  })

  assert.equal(result.entryFix, 'AGAVO')
  assert.equal(result.exitFix, 'SAPRA')
  assert.deepEqual(result.procedures.map((procedure) => procedure.type), ['SID', 'IAP'])
})

test('buildProcedureContextPayload returns null for VFR routes', () => {
  assert.equal(buildProcedureContextPayload({
    routeResult: { flightRule: 'VFR' },
    selectedSid: { id: 'SID1', fixes: [] },
    selectedStar: null,
    selectedIap: null,
  }), null)
})

test('buildVerticalProfileRequest includes VFR waypoints only for VFR routes', () => {
  const vfrWaypoints = [{ id: 'WP1', lon: 126, lat: 37, fixed: false }]
  const result = buildVerticalProfileRequest({
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
    routeResult: { flightRule: 'VFR' },
    selectedSid: null,
    selectedStar: null,
    selectedIap: null,
    vfrWaypoints,
    plannedCruiseAltitudeFt: 5500,
  })

  assert.equal(result.flightRule, 'VFR')
  assert.equal(result.plannedCruiseAltitudeFt, 5500)
  assert.equal(result.vfrWaypoints, vfrWaypoints)
  assert.deepEqual(result.routeMarkers[0], {
    id: 'marker:WAYPOINT:WP1:126.000000:37.000000:0',
    label: 'WP1',
    named: false,
    lon: 126,
    lat: 37,
    kind: 'WAYPOINT',
  })
  assert.equal(result.sampleSpacingMeters, 250)
  assert.equal(result.routeModel.graphConnectionStatus, 'not_applicable')
})

test('buildVerticalProfileRequest preserves IFR route marker payload shape', () => {
  const result = buildVerticalProfileRequest({
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
    routeResult: {
      flightRule: 'IFR',
      routeIds: ['A1'],
      displaySequence: ['RKSI', 'A1', 'AGAVO', 'RKSS'],
      previewGeojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { role: 'route-preview-line' },
            geometry: { type: 'LineString', coordinates: [[126, 37], [127, 38], [128, 39]] },
          },
        ],
      },
    },
    selectedSid: null,
    selectedStar: null,
    selectedIap: null,
    vfrWaypoints: [],
    plannedCruiseAltitudeFt: 10000,
  })

  assert.equal(result.vfrWaypoints, undefined)
  assert.deepEqual(result.routeMarkers, [
    { id: 'marker:AIRPORT:RKSI:126.000000:37.000000:0', label: 'RKSI', lon: 126, lat: 37, kind: 'AIRPORT' },
    { id: 'marker:FIX:AGAVO:127.000000:38.000000:0', label: 'AGAVO', lon: 127, lat: 38, kind: 'FIX' },
    { id: 'marker:AIRPORT:RKSS:128.000000:39.000000:0', label: 'RKSS', lon: 128, lat: 39, kind: 'AIRPORT' },
  ])
  assert.equal(result.routeModel.graphConnectionStatus, 'unavailable')
})

test('buildRouteProfileMarkersPayload keeps manual IFR waypoint coordinates when preview geometry expands an airway', () => {
  const markers = buildRouteProfileMarkersPayload({
    routeResult: {
      flightRule: 'IFR',
      routeIds: ['A1'],
      displaySequence: ['RKSI', 'A1', 'AGAVO', 'RKSS'],
      manualRoute: {
        points: [
          { label: 'AGAVO', kind: 'FIX', coordinates: [126.8, 37.1] },
        ],
      },
      previewGeojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { role: 'route-preview-line' },
            geometry: {
              type: 'LineString',
              coordinates: [[126, 37], [126.2, 37.2], [126.8, 37.1], [128, 39]],
            },
          },
        ],
      },
    },
  })

  assert.deepEqual(markers, [
    { id: 'marker:AIRPORT:RKSI:126.000000:37.000000:0', label: 'RKSI', lon: 126, lat: 37, kind: 'AIRPORT' },
    { id: 'marker:FIX:AGAVO:126.800000:37.100000:0', label: 'AGAVO', lon: 126.8, lat: 37.1, kind: 'FIX' },
    { id: 'marker:AIRPORT:RKSS:128.000000:39.000000:0', label: 'RKSS', lon: 128, lat: 39, kind: 'AIRPORT' },
  ])
})

test('buildCrossSectionRequest keeps ETD as the forecast selection reference', () => {
  const routeGeometry = { type: 'LineString', coordinates: [[126, 37], [127, 38]] }
  assert.deepEqual(buildCrossSectionRequest({
    routeGeometry,
    etd: '2026-07-22T10:00:00.000Z',
    tmfc: '2026072200',
    hf: 9,
  }), {
    routeGeometry,
    etd: '2026-07-22T10:00:00.000Z',
    tmfc: '2026072200',
    hf: 9,
  })
  assert.deepEqual(buildCrossSectionRequest({
    routeGeometry,
    etd: '2026-07-22T10:00:00.000Z',
    hf: null,
  }), {
    routeGeometry,
    etd: '2026-07-22T10:00:00.000Z',
  })
})

test('buildCrossSectionRequest includes stable markers and NWP selection without weather payloads', () => {
  const routeGeometry = { type: 'LineString', coordinates: [[126, 37], [127, 38]] }
  const routeMarkers = [{ id: 'marker:FIX:WP1:126.000000:37.000000:0', label: 'WP1', lon: 126, lat: 37, kind: 'FIX' }]
  const nwpTimeSelection = {
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [{ waypointId: routeMarkers[0].id, offsetHours: 1 }],
  }

  assert.deepEqual(buildCrossSectionRequest({ routeGeometry, etd: '2026-08-19T10:00:00.000Z', routeMarkers, nwpTimeSelection }), {
    routeGeometry,
    etd: '2026-08-19T10:00:00.000Z',
    routeMarkers,
    nwpTimeSelection,
  })
})
