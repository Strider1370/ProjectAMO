import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteWeatherLegs } from '../src/briefing/route-weather-legs.js'

const axis = {
  totalDistanceNm: 20,
  samples: [
    { distanceNm: 0, bearingDeg: 90 },
    { distanceNm: 10, bearingDeg: 90 },
    { distanceNm: 20, bearingDeg: 90 },
  ],
}

const values = (field, entries) => ({
  altFt: 9000,
  values: entries.map((value, index) => ({ distanceNm: index * 10, altFt: 9000, [field]: value })),
})

test('buildRouteWeatherLegs keeps every aligned segment and aggregates its selected-altitude facts', () => {
  const result = buildRouteWeatherLegs({
    routeModel: {
      enRouteSegments: [
        { id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 10, alignmentStatus: 'aligned' },
        { id: 'B-C', fromFix: 'B', toFix: 'C', startNm: 10, endNm: 20, alignmentStatus: 'aligned' },
      ],
    },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
    crossSection: {
      levels: [
        values('u', [10, 20, 30]),
        values('v', [0, 0, 0]),
        values('T', [273.15, 274.15, 275.15]),
        values('icing', [1, 2, 3]),
      ],
    },
    turbulence: { levels: [values('ktg', [0.2, 0.6, 0.8])] },
    hazards: [{
      source: 'SIGMET', code: 'SEV_TURB', label: 'Severe turbulence', airportScope: null,
      routeIntervalNm: { startNm: 11, endNm: 19 }, altitudeExposure: { status: 'unknown' }, timeStatus: 'unavailable',
    }],
    routeNotams: [{
      id: 'N1', summary: 'Restricted area', routeIntervalNm: { startNm: 11, endNm: 19 }, comparisonStatus: 'undetermined',
    }],
    aipConstraints: {
      status: 'matched',
      provenance: { publicationId: 'AIP-2026-07' },
      segments: [{ id: 'B-C', status: 'matched', constraints: { minimumFlightAltitude: { value: 8000, unit: 'FT' } } }],
    },
  })

  assert.deepEqual(result.legs.map(({ from, to, distanceNm }) => ({ from, to, distanceNm })), [
    { from: 'A', to: 'B', distanceNm: 10 },
    { from: 'B', to: 'C', distanceNm: 10 },
  ])
  assert.deepEqual(result.legs[1].wind, { meanComponentKt: 39, minComponentKt: 39, maxComponentKt: 39 })
  assert.deepEqual(result.legs[1].icing, { peakLevel: 2, exposures: [{ level: 2, distanceNm: 10 }] })
  assert.equal(result.legs[1].turbulence.peakLevel, 'moderate')
  assert.deepEqual(result.legs[1].hazards.map(({ code, verticalStatus }) => ({ code, verticalStatus })), [{ code: 'SEV_TURB', verticalStatus: 'unknown' }])
  assert.deepEqual(result.legs[1].notams, [{ id: 'N1', summary: 'Restricted area', effect: 'undetermined' }])
  assert.equal(result.legs[1].altitudeConstraint.status, 'matched')
  assert.equal(result.legs[1].altitudeConstraint.sourceCycle, 'AIP-2026-07')
  assert.equal('eta' in result.legs[1], false)
  assert.equal('headingDeg' in result.legs[1], false)
})
