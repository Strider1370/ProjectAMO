import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fpvPointToLngLat,
  offsetSamplesFromPolygon,
  samplePolylineByDistance,
} from '../src/sigwx-low/sigwx-low-chart-geometry.js'

test('converts FPV chart points to lng/lat using normal map range', () => {
  assert.deepEqual(
    fpvPointToLngLat({ x: 0, y: 0 }, {
      map_range_mode: 'normal',
      fpv_safe_bound_width: 740,
      fpv_safe_bound_height: 730,
    }),
    [121, 39],
  )
})

test('samples polyline by offset and repeat distance with rotation', () => {
  const samples = samplePolylineByDistance([{ x: 0, y: 0 }, { x: 100, y: 0 }], {
    offset: 25,
    repeat: 50,
  })
  assert.deepEqual(samples.map((sample) => Math.round(sample.x)), [25, 75])
  assert.equal(samples[0].angle, 0)
})

test('offsets samples away from polygon interior', () => {
  const samples = offsetSamplesFromPolygon([
    { x: 50, y: 0, angle: 0 },
  ], [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ], 10)
  assert.equal(samples[0].y < 0, true)
})
