import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBoundaryFixOptions,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  buildInitialVfrWaypoints,
  buildVfrWaypointsFromRouteResult,
  buildIapCandidates,
  buildVfrRouteFromWaypoints,
  chooseIapKeyForRunway,
  getCurrentRouteLineString,
  pickBestRunwayGroup,
} from './routeBriefingModel.js'

test('buildVfrWaypointsFromRouteResult keeps airport endpoints around manual VFR fixes', () => {
  const waypoints = buildVfrWaypointsFromRouteResult({
    flightRule: 'VFR',
    departureAirport: 'RKSS',
    arrivalAirport: 'RKPC',
    previewGeojson: { type: 'FeatureCollection', features: [{
      type: 'Feature', properties: { role: 'route-preview-line' },
      geometry: { type: 'LineString', coordinates: [[126.8, 37.6], [127.2, 37.1], [126.5, 33.5]] },
    }] },
    manualRoute: { points: [{ label: 'GONAX', kind: 'published-fix', coordinates: [127.2, 37.1] }] },
  }, [{ icao: 'RKSS', elevationFt: 18 }, { icao: 'RKPC', elevationFt: 118 }])

  assert.deepEqual(waypoints.map((waypoint) => waypoint.id), ['RKSS', 'GONAX', 'RKPC'])
  assert.equal(waypoints[1].named, true)
  assert.equal(waypoints[0].fixed, true)
  assert.equal(waypoints[2].fixed, true)
})

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

test('buildIapCandidates matches RKPU STAR ids to representative IAP routes', () => {
  const selectedStar = { id: 'RKPU-STAR-LAPAL2D' }
  const iapData = {
    starToIapCandidates: {
      'RKPU-STAR-LAPAL2D': {
        candidateIapKeys: ['RKPU-IAP-MAKKY-RWY18-REP'],
        defaultIapKey: 'RKPU-IAP-MAKKY-RWY18-REP',
      },
    },
    iapRoutes: {
      'RKPU-IAP-MAKKY-RWY18-REP': {
        runways: ['18'],
      },
    },
  }

  assert.deepEqual(buildIapCandidates(selectedStar, iapData), {
    candidates: [{ key: 'RKPU-IAP-MAKKY-RWY18-REP', label: 'RWY 18' }],
    selectedIapKey: 'RKPU-IAP-MAKKY-RWY18-REP',
  })
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

  const wps = buildInitialVfrWaypoints(routeResult, airports)
  assert.ok(wps.every((w) => typeof w.uid === 'string' && w.uid.length > 0), '각 경유점에 uid 부여')
  // 랜덤 uid는 제외하고 나머지 필드 비교
  assert.deepEqual(wps.map(({ uid, ...rest }) => rest), [
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

test('buildVfrRouteFromWaypoints: 공항 둘 다 스냅됨 — fixed 끝점 + 중간 WP', () => {
  const airports = [
    { icao: 'RKSS', elevationFt: 18 },
    { icao: 'RKPK', elevationFt: 9 },
  ]
  const coords = [[126.7906, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  const { routeResult, vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: 'RKSS',
    arrivalAirport: 'RKPK',
    airports,
  })

  assert.equal(routeResult.flightRule, 'VFR')
  assert.equal(routeResult.departureAirport, 'RKSS')
  assert.equal(routeResult.arrivalAirport, 'RKPK')
  assert.ok(routeResult.distanceNm > 0)
  assert.ok(routeResult.previewGeojson?.type === 'FeatureCollection')

  assert.equal(vfrWaypoints.length, 3)
  assert.equal(vfrWaypoints[0].id, 'RKSS')
  assert.equal(vfrWaypoints[0].fixed, true)
  assert.equal(vfrWaypoints[0].airportElevationFt, 18)
  assert.equal(vfrWaypoints[2].id, 'RKPK')
  assert.equal(vfrWaypoints[2].fixed, true)
  assert.equal(vfrWaypoints[1].fixed, false)
  assert.equal(vfrWaypoints[1].id, 'WP1')
})

test('buildVfrRouteFromWaypoints: 중간 경유점에 실제 이름이 있으면 WPn 대신 그 이름을 쓴다', () => {
  // 실제 EFB(ForeFlight/SkyDemon) GPX route는 rtept마다 픽스 이름(예: AGAVO)이 실려
  // 있다 — buildVfrRouteFromWaypoints가 그걸 받으면 WP1 대신 그 이름으로 보여야 한다.
  const airports = [{ icao: 'RKSS', elevationFt: 18 }, { icao: 'RKPK', elevationFt: 9 }]
  const coords = [[126.7906, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  const { vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: 'RKSS',
    arrivalAirport: 'RKPK',
    airports,
    waypointNames: ['RKSS', 'AGAVO', 'RKPK'],
  })
  assert.equal(vfrWaypoints[1].id, 'AGAVO')
  assert.equal(vfrWaypoints[1].named, true)
  assert.equal(vfrWaypoints[1].fixed, false)
})

test('buildVfrRouteFromWaypoints: waypointNames가 없거나 빈 이름이면 기존처럼 WPn', () => {
  const airports = [{ icao: 'RKSS', elevationFt: 18 }, { icao: 'RKPK', elevationFt: 9 }]
  const coords = [[126.7906, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  const { vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: 'RKSS', arrivalAirport: 'RKPK', airports, waypointNames: [null, '', null],
  })
  assert.equal(vfrWaypoints[1].id, 'WP1')
  assert.ok(!vfrWaypoints[1].named)
})

test('buildVfrRouteFromWaypoints: 공항 폴백(스냅 안 됨) — 전부 일반 지점', () => {
  const coords = [[130.0, 40.0], [131.0, 41.0]]
  const { routeResult, vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: null,
    arrivalAirport: null,
    airports: [],
  })

  assert.equal(routeResult.flightRule, 'VFR')
  assert.equal(routeResult.departureAirport, '')
  assert.equal(routeResult.arrivalAirport, '')
  assert.equal(vfrWaypoints.length, 2)
  assert.equal(vfrWaypoints[0].fixed, false)
  assert.equal(vfrWaypoints[1].fixed, false)
})

test('buildVfrRouteFromWaypoints: 점이 2개 미만이면 에러', () => {
  assert.throws(() => buildVfrRouteFromWaypoints([[126.79, 37.5]], { airports: [] }))
})
