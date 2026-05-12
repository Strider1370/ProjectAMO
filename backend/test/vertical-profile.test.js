import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteAxis } from '../src/briefing/route-axis.js'
import { buildFlightPlanProfile } from '../src/briefing/profile-composer.js'
import { buildVerticalProfile } from '../src/briefing/vertical-profile.js'
import { getTerrainTileIndex } from '../src/terrain/terrain-cache.js'

const metadata = {
  byteOrder: 'int16be',
  bounds: { minLon: 124, maxLon: 130, minLat: 33, maxLat: 43 },
  pointsPerDegree: 1200,
  tiles: {
    E124_N33: null,
    E126_N37: null,
    E129_N42: null,
  },
}

metadata.tiles = Object.fromEntries(
  Object.keys(metadata.tiles).map((key) => [`${key}.bin`, { name: `${key}.bin`, rows: 1201, cols: 1201 }]),
)

test('buildRouteAxis samples a straight LineString with cumulative distance', () => {
  const axis = buildRouteAxis({
    type: 'LineString',
    coordinates: [[126, 37], [126.1, 37]],
  }, 5000)

  assert.equal(axis.samples[0].distanceNm, 0)
  assert.ok(axis.totalDistanceNm > 4)
  assert.ok(axis.samples.length >= 2)
  assert.equal(axis.samples[axis.samples.length - 1].distanceNm, axis.totalDistanceNm)
})

test('buildRouteAxis samples a bent LineString without dropping the final point', () => {
  const axis = buildRouteAxis({
    type: 'LineString',
    coordinates: [[126, 37], [126.1, 37], [126.1, 37.1]],
  }, 4000)

  const last = axis.samples[axis.samples.length - 1]
  assert.equal(last.lon, 126.1)
  assert.equal(last.lat, 37.1)
  assert.ok(axis.totalDistanceNm > 10)
})

test('getTerrainTileIndex maps Korea DEM coordinates to tile row and column', () => {
  const index = getTerrainTileIndex(126.5, 37.25, metadata)

  assert.equal(index.tileName, 'E126_N37.bin')
  assert.equal(index.col, 600)
  assert.equal(index.row, 300)
})

test('getTerrainTileIndex returns null outside DEM bounds', () => {
  assert.equal(getTerrainTileIndex(123.9, 37, metadata), null)
  assert.equal(getTerrainTileIndex(126, 43.1, metadata), null)
})

test('buildVerticalProfile returns null terrain samples without crashing', () => {
  const profile = buildVerticalProfile({
    routeGeometry: {
      type: 'LineString',
      coordinates: [[126, 37], [126.05, 37]],
    },
    plannedCruiseAltitudeFt: 9000,
    sampleSpacingMeters: 5000,
  }, {
    sampleAxis(axis) {
      return {
        terrain: {
          unit: 'm',
          values: axis.samples.map((sample) => ({ index: sample.index, elevationM: null })),
        },
        warnings: ['No terrain elevation for sample 0'],
      }
    },
  })

  assert.equal(profile.flightPlan.plannedCruiseAltitudeFt, 9000)
  assert.equal(profile.flightPlan.profile.points.length, 2)
  assert.deepEqual(profile.layers, {})
  assert.equal(profile.terrain.values[0].elevationM, null)
  assert.deepEqual(profile.warnings, ['No terrain elevation for sample 0'])
})

test('buildVerticalProfile returns briefing-ready VFR profile and markers', () => {
  const profile = buildVerticalProfile({
    flightRule: 'VFR',
    routeGeometry: {
      type: 'LineString',
      coordinates: [[126, 37], [126.05, 37], [126.1, 37]],
    },
    plannedCruiseAltitudeFt: 5500,
    sampleSpacingMeters: 5000,
    vfrWaypoints: [
      { id: 'RKSS', lon: 126, lat: 37, fixed: true, airportElevationFt: 60 },
      { id: 'WP1', lon: 126.05, lat: 37, altitudeFt: 3500 },
      { id: 'RKPC', lon: 126.1, lat: 37, fixed: true },
    ],
  }, {
    sampleAxis(axis) {
      return {
        terrain: {
          unit: 'm',
          values: axis.samples.map((sample) => ({ index: sample.index, elevationM: sample.index === axis.samples.length - 1 ? 10 : 0 })),
        },
        warnings: [],
      }
    },
  })

  assert.equal(profile.axis.samples[0].segmentKind, 'VFR')
  assert.equal(profile.flightPlan.profile.points[0].altitudeFt, 60)
  assert.equal(profile.flightPlan.profile.points[1].altitudeFt, 3500)
  assert.equal(profile.flightPlan.profile.points[2].altitudeFt, 33)
  assert.equal(profile.markers.length, 3)
})

test('buildFlightPlanProfile composes IFR climb, cruise, descent, and TOD', () => {
  const routeGeometry = {
    type: 'LineString',
    coordinates: [[126, 37], [126.2, 37], [127, 37], [127.6, 37], [128, 37]],
  }
  const axis = buildRouteAxis(routeGeometry, 10000)
  const terrainResult = {
    terrain: {
      unit: 'm',
      values: axis.samples.map((sample) => ({ index: sample.index, elevationM: 0 })),
    },
    warnings: [],
  }
  const flightPlan = buildFlightPlanProfile({
    flightRule: 'IFR',
    routeGeometry,
    plannedCruiseAltitudeFt: 12000,
    procedureContext: {
      exitFix: 'EXIT',
      procedures: [
        {
          id: 'SID1',
          type: 'SID',
          fixes: [
            { id: 'DEP', lon: 126, lat: 37, altitude: null },
            { id: 'CLB', lon: 126.2, lat: 37, altitude: { maxFt: 5000, minFt: null, raw: '-5000' } },
          ],
        },
        {
          id: 'STAR1',
          type: 'STAR',
          fixes: [
            { id: 'EXIT', lon: 127.6, lat: 37, altitude: { minFt: 7000, maxFt: null, raw: '+7000' } },
            { id: 'ARR', lon: 128, lat: 37, altitude: { minFt: 0, maxFt: 0, raw: '@0' } },
          ],
        },
      ],
    },
  }, axis, terrainResult)

  assert.equal(flightPlan.profile.model.climbGradientFtPerNm, 600)
  assert.equal(flightPlan.profile.model.descentGradientFtPerNm, 300)
  assert.ok(flightPlan.profile.points.some((point) => point.altitudeFt === 5000))
  assert.ok(flightPlan.profile.points.some((point) => point.altitudeFt === 12000))
  assert.ok(flightPlan.profile.tod.distanceNm >= 0)
  assert.equal(flightPlan.profile.tod.referenceFixLabel, 'EXIT')
})

test('buildFlightPlanProfile allows low-cruise TOD after enroute end when descent distance permits', () => {
  const routeGeometry = {
    type: 'LineString',
    coordinates: [[126, 37], [126.4, 37], [126.8, 37], [127.2, 37], [127.6, 37], [128, 37]],
  }
  const axis = buildRouteAxis(routeGeometry, 10000)
  const terrainResult = {
    terrain: {
      unit: 'm',
      values: axis.samples.map((sample) => ({ index: sample.index, elevationM: 0 })),
    },
    warnings: [],
  }
  const flightPlan = buildFlightPlanProfile({
    flightRule: 'IFR',
    routeGeometry,
    plannedCruiseAltitudeFt: 9000,
    procedureContext: {
      exitFix: 'EXIT',
      procedures: [
        {
          id: 'STAR1',
          type: 'STAR',
          fixes: [
            { id: 'EXIT', lon: 126.8, lat: 37, altitude: null },
            { id: 'IAF', lon: 127.4, lat: 37, altitude: { minFt: 4000, maxFt: null, raw: '+4000' } },
            { id: 'THR', lon: 128, lat: 37, altitude: { minFt: 80, maxFt: null, raw: 'THR ELEV 80' } },
          ],
        },
      ],
    },
  }, axis, terrainResult)

  const exitDistanceNm = axis.totalDistanceNm * 0.4
  assert.ok(flightPlan.profile.tod.distanceNm > exitDistanceNm)
})
