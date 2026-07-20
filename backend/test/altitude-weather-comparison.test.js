import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAltitudeCandidates, buildAltitudeWeatherComparison } from '../src/briefing/altitude-weather-comparison.js'

const matched = (id, series = 'Odd', upperLimit = { value: 30000, unit: 'FT' }) => ({
  id, status: 'matched', constraints: {
    minimumFlightAltitude: { value: 20000, unit: 'FT' }, upperLimit,
    cruisingLevelSeries: { series },
  },
})

test('buildAltitudeCandidates expands published Odd/Even series, applies FL bounds, and marks below-transition labels as altitude', () => {
  const result = buildAltitudeCandidates({ routeSegments: [matched('A', 'Odd', { value: 290, unit: 'FL' })], plannedCruiseAltitudeFt: 22000 })
  assert.equal(result.constraints.status, 'matched')
  assert.deepEqual(result.candidates.map((row) => row.altitudeFt), [21000, 22000, 23000, 25000])
  assert.equal(result.candidates.find((row) => row.altitudeFt === 22000).status, 'input_invalid')
  assert.equal(result.candidates[0].label, 'FL210')
  const low = buildAltitudeCandidates({ routeSegments: [matched('B', 'Even')], plannedCruiseAltitudeFt: 12000 })
  assert.equal(low.candidates.find((row) => row.altitudeFt === 12000).displayMode, 'altitude')
  assert.equal(low.candidates.find((row) => row.altitudeFt === 12000).label, '12,000 ft')
})

test('buildAltitudeCandidates keeps the ENR 1.7 RVSM gap explicit', () => {
  const odd = buildAltitudeCandidates({ routeSegments: [matched('A', 'Odd', { value: null, unit: 'FT' })], plannedCruiseAltitudeFt: 30000 })
  assert.equal(odd.candidates.find((row) => row.altitudeFt === 30000).status, 'input_invalid')
})

test('buildAltitudeCandidates retains ENR 1.7 non-RVSM levels above FL410 when route bounds allow them', () => {
  const odd = buildAltitudeCandidates({ routeSegments: [matched('A', 'Odd', { value: 50000, unit: 'FT' })], plannedCruiseAltitudeFt: 45000 })
  assert.equal(odd.candidates.find((row) => row.altitudeFt === 45000).status, 'valid')
  assert.equal(odd.candidates.find((row) => row.altitudeFt === 45000).label, 'FL450')
})

test('buildAltitudeCandidates keeps an UNL upper limit unbounded for RKSI-style Odd constraints', () => {
  const result = buildAltitudeCandidates({ routeSegments: [matched('RKSI', 'Odd', { value: null, reference: 'UNL' })], plannedCruiseAltitudeFt: 21000 })
  assert.equal(result.constraints.routeCeilingFt, null)
  assert.equal(result.candidates.find((row) => row.altitudeFt === 21000).status, 'valid')
})

test('buildAltitudeCandidates with missing AIP constraints does not create weather-comparison rows', () => {
  const result = buildAltitudeCandidates({ routeSegments: [{ id: 'A', status: 'unavailable', constraints: null }], plannedCruiseAltitudeFt: 23000 })
  assert.equal(result.constraints.status, 'unavailable')
  assert.deepEqual(result.candidates, [])
})

test('comparison interpolates sample-level KIM heights and keeps unknown-time NOTAM undetermined', () => {
  const axis = { samples: [{ distanceNm: 0, bearingDeg: 90, lon: 0, lat: 0 }, { distanceNm: 2, bearingDeg: 90, lon: 0.2, lat: 0 }, { distanceNm: 10, bearingDeg: 90, lon: 1, lat: 0 }] }
  const crossSection = { levels: [
    { values: [{ distanceNm: 0, altFt: 20000, u: 10, v: 0, icing: 1 }, { distanceNm: 2, altFt: 20000, u: 20, v: 0, icing: 1 }, { distanceNm: 10, altFt: 20000, u: 30, v: 0, icing: 1 }] },
    { values: [{ distanceNm: 0, altFt: 24000, u: 10, v: 0, icing: 2 }, { distanceNm: 2, altFt: 24000, u: 20, v: 0, icing: 2 }, { distanceNm: 10, altFt: 24000, u: 30, v: 0, icing: 2 }] },
  ] }
  const polygon = { type: 'Polygon', coordinates: [[[0, -1], [1, -1], [1, 1], [0, 1], [0, -1]]] }
  const rows = buildAltitudeWeatherComparison({
    candidates: [{ altitudeFt: 22000, status: 'valid' }], crossSection,
    turbulence: { levels: [{ altFt: 22000, values: [{ distanceNm: 0, ktg: 2 }, { distanceNm: 2, ktg: 3 }, { distanceNm: 10, ktg: 3 }] }] }, axis,
    hazards: [{ source: 'SIGMET', item: { id: 'S1', phenomenon_label: 'Embedded Thunderstorm', geometry: polygon, altitude: { lower_fl: null, upper_fl: 450 }, valid_from: '2026-07-17T00:00:00Z', valid_to: '2026-07-17T12:00:00Z' } }],
    notams: [{ id: 'N1', category: 'danger', geometry: polygon, altitude: { lower: 200, upper: 240, unit: 'FL' } }],
    etd: '2026-07-17T01:00:00Z', eta: '2026-07-17T02:00:00Z',
  })
  assert.equal(rows[0].weatherStatus, 'available')
  assert.equal(rows[0].wind.averageKt, 35)
  assert.equal(rows[0].wind.minKt, 19)
  assert.equal(rows[0].wind.maxKt, 58)
  assert.equal(rows[0].icing.summary.status, 'available')
  assert.equal(rows[0].icing.summary.highestGrade, 1)
  assert.equal(rows[0].turbulence.summary.highestGrade, 3)
  assert.deepEqual(rows[0].hazards[0], {
    source: 'SIGMET', sourceId: 'S1', label: 'Embedded Thunderstorm', altitude: { lower_fl: null, upper_fl: 450 },
    validFrom: '2026-07-17T00:00:00Z', validTo: '2026-07-17T12:00:00Z', encounter: 'on', timeStatus: 'matched', verticalStatus: 'intersects',
    horizontalExposure: { status: 'intersects', intervals: [{ startNm: 0, endNm: 2 }] },
  })
  assert.ok(rows[0].hazards[0].horizontalExposure.intervals.length >= 1)
  assert.deepEqual(rows[0].notams, [{ id: 'N1', status: 'undetermined' }])
})
