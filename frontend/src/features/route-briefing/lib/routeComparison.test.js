import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteComparison, getFinalRouteGeometry } from './routeComparison.js'

const exposure = (version, hazards) => ({ snapshot: { version }, hazards })
const hazard = (source, phenomenon, startNm, endNm) => ({ source, phenomenon, horizontalExposure: { intervals: [{ startNm, endNm }] } })
const design = (id, distanceNm, routeExposure) => ({ id, routeResult: { totalDistanceNm: distanceNm }, routeExposure })

test('comparison keeps base inputs untouched and calculates distance and ETA deltas', () => {
  const base = design('base', 120, exposure('same', [hazard('SIGMET', 'TS', 10, 20)]))
  const alternative = design('a', 150, exposure('same', [hazard('SIGMET', 'TS', 5, 8)]))
  const result = buildRouteComparison(base, [alternative], { etd: '2026-01-01T00:00:00Z', tasKt: 120, weatherSnapshot: { version: 'same' } })[0]

  assert.equal(result.distanceDeltaNm, 30)
  assert.equal(result.etaDeltaMinutes, 15)
  assert.deepEqual(result.exposures[0], { key: 'SIGMET:TS', baseNm: 10, alternativeNm: 3, deltaNm: -7, unavailable: false })
  assert.equal(base.routeResult.totalDistanceNm, 120)
})

test('comparison gives zero to a phenomenon absent on one route and hides mismatched snapshots', () => {
  const base = design('base', 100, exposure('same', [hazard('AIRMET', 'TURB', 1, 4)]))
  const presentElsewhere = design('zero', 100, exposure('same', [hazard('SIGMET', 'TS', 1, 2)]))
  const zeroResult = buildRouteComparison(base, [presentElsewhere], { weatherSnapshot: { version: 'same' } })[0]
  const alternative = design('a', 100, exposure('other', [hazard('SIGMET', 'TS', 1, 2)]))
  const result = buildRouteComparison(base, [alternative], { weatherSnapshot: { version: 'same' } })[0]

  assert.deepEqual(zeroResult.exposures.find((row) => row.key === 'AIRMET:TURB'), { key: 'AIRMET:TURB', baseNm: 3, alternativeNm: 0, deltaNm: -3, unavailable: false })
  assert.equal(result.comparisonUnavailable, true)
  assert.ok(result.exposures.every((row) => row.unavailable && row.deltaNm === null))
})

test('final geometry uses each design procedure selection', () => {
  const routeResult = { previewGeojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] } }] } }
  const designA = { routeResult, procedures: { sid: { id: 'A', fixes: [{ id: 'D', lon: 0, lat: 0 }, { id: 'A', lon: 0.5, lat: 0 }] } } }
  const designB = { routeResult, procedures: { sid: { id: 'B', fixes: [{ id: 'D', lon: 0, lat: 0 }, { id: 'B', lon: 0.75, lat: 0 }] } } }

  assert.deepEqual(getFinalRouteGeometry(designA).coordinates, [[0, 0], [0.5, 0], [1, 0], [2, 0]])
  assert.deepEqual(getFinalRouteGeometry(designB).coordinates, [[0, 0], [0.75, 0], [1, 0], [2, 0]])
})
