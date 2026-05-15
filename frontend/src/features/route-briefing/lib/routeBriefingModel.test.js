import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBoundaryFixOptions,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  buildInitialVfrWaypoints,
  chooseIapKeyForRunway,
  getCurrentRouteLineString,
  pickBestRunwayGroup,
} from './routeBriefingModel.js'

test('pickBestRunwayGroup chooses the runway group closest to wind direction', () => {
  assert.equal(pickBestRunwayGroup(['15', '33', '04'], 160), '15')
  assert.equal(pickBestRunwayGroup(['33', '15', '15'], null), '33')
})

test('chooseIapKeyForRunway preserves default behavior when runway is missing', () => {
  const iapData = {
    iapRoutes: {
      ILS15: { representativeFor: { runwayGroup: ['15'] } },
      ILS33: { representativeFor: { runwayGroup: ['33'] } },
    },
  }
  const entry = { candidateIapKeys: ['ILS15', 'ILS33'], defaultIapKey: 'ILS33' }

  assert.equal(chooseIapKeyForRunway(entry, iapData, null), 'ILS33')
  assert.equal(chooseIapKeyForRunway(entry, iapData, '15'), 'ILS15')
})

test('buildBoundaryFixOptions filters and labels FIR IN and FIR EXIT fixes', () => {
  const result = buildBoundaryFixOptions({
    routes: {
      R1: { boundaryFixes: ['AGAVO', 'BESNA', 'UNKNOWN'] },
      R2: { boundaryFixes: ['AGAVO', 'SAPRA'] },
    },
  })

  assert.deepEqual(result.firInOptions.map((option) => option.value), ['AGAVO', 'SAPRA'])
  assert.deepEqual(result.firExitOptions.map((option) => option.value), ['AGAVO', 'BESNA', 'SAPRA'])
  assert.equal(result.firInOptions[0].label, 'AGAVO (Westbound)')
})

test('buildInitialVfrWaypoints preserves fixed airport endpoints and airport elevation', () => {
  const routeResult = {
    departureAirport: 'RKSI',
    arrivalAirport: 'RKPC',
    previewGeojson: {
      features: [
        { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
        { type: 'Feature', properties: { role: 'route-preview-point' }, geometry: { type: 'Point', coordinates: [126, 37] } },
        { type: 'Feature', properties: { role: 'route-preview-point' }, geometry: { type: 'Point', coordinates: [127, 36] } },
      ],
    },
  }
  const airports = [
    { icao: 'RKSI', elevationFt: 23 },
    { id: 'RKPC', elevation_m: 36 },
  ]

  assert.deepEqual(buildInitialVfrWaypoints(routeResult, airports), [
    { id: 'RKSI', lon: 126, lat: 37, fixed: true, airportElevationFt: 23, altitudeFt: 23 },
    { id: 'RKPC', lon: 127, lat: 36, fixed: true, airportElevationFt: 118, altitudeFt: 118 },
  ])
})

test('buildIfrSequenceTokens inserts SID, STAR, and IAP tokens around enroute sequence', () => {
  const result = {
    departureAirport: 'RKSI',
    arrivalAirport: 'RKPC',
    displaySequence: ['RKSI', 'BULTI', 'Y711', 'DOTOL', 'RKPC'],
    routeIds: ['Y711'],
  }

  assert.deepEqual(buildIfrSequenceTokens(result, {
    selectedSid: { name: 'BULTI2T' },
    selectedStar: { name: 'DOTOL1A' },
    selectedIap: { sourceProcedure: 'ILS Z RWY 07' },
  }), [
    { kind: 'airport', text: 'RKSI' },
    { kind: 'sid', text: 'SID(BULTI2T)' },
    { kind: 'waypoint', text: 'BULTI' },
    { kind: 'airway', text: 'Y711' },
    { kind: 'waypoint', text: 'DOTOL' },
    { kind: 'star', text: 'STAR(DOTOL1A)' },
    { kind: 'iap', text: 'IAP(ILS Z RWY 07)' },
    { kind: 'airport', text: 'RKPC' },
  ])
})

test('buildIfrDistanceBreakdown preserves current total-distance math', () => {
  const breakdown = buildIfrDistanceBreakdown({
    routeResult: { distanceNm: 10.25 },
    selectedSid: { fixes: [{ legDistanceNm: 1.1 }, { legDistanceNm: 2.2 }] },
    selectedStar: { fixes: [{ legDistanceNm: 3.3 }] },
    selectedIap: { fixes: [{ legDistanceNm: 4.4 }] },
  })

  assert.equal(breakdown.totalDistanceNm, 21.3)
  assert.deepEqual(breakdown.items.map((item) => [item.kind, item.value]), [
    ['sid', 3.3000000000000003],
    ['enr', 10.25],
    ['star', 3.3],
    ['iap', 4.4],
  ])
})

test('getCurrentRouteLineString returns VFR waypoint geometry and IFR procedure-augmented route geometry', () => {
  const vfrGeometry = getCurrentRouteLineString({
    routeResult: { flightRule: 'VFR' },
    vfrWaypoints: [{ lon: 126, lat: 37 }, { lon: 127, lat: 36 }],
  })
  assert.deepEqual(vfrGeometry, { type: 'LineString', coordinates: [[126, 37], [127, 36]] })

  const ifrGeometry = getCurrentRouteLineString({
    routeResult: {
      flightRule: 'IFR',
      previewGeojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [126.5, 36.5], [127, 36]] } },
        ],
      },
    },
    selectedSid: {
      fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 126.2, lat: 36.8 }],
      geometry: { type: 'LineString', coordinates: [[126, 37], [126.2, 36.8]] },
    },
  })
  assert.deepEqual(ifrGeometry.coordinates[0], [126, 37])
  assert.deepEqual(ifrGeometry.coordinates[1], [126.2, 36.8])
})
