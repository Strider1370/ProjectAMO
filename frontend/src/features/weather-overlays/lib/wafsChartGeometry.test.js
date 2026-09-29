import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windParts, nearestTangent, resamplePath, createBoundaryPatterns, insideArea, nearBoundary, clipPolarRing } from './wafsChartGeometry.js'

test('jet wind symbols retain 5/10/50 kt contributions, including multiple flags', () => {
  for (const speed of [0, 5, 10, 45, 50, 95, 100, 135, 155, 200]) {
    const p = windParts(speed)
    assert.equal(p.pennants * 50 + p.full * 10 + p.half * 5, speed)
  }
  assert.deepEqual(windParts(133), { pennants: 2, full: 3, half: 1 })
  assert.equal(windParts(null), null)
  assert.equal(windParts(-10), null)
})
test('tangent follows axis direction and closest segment, ignoring duplicate points', () => {
  const path = [[{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }]]
  assert.equal(nearestTangent({ x: 60, y: 2 }, path), 0)
  assert.equal(nearestTangent({ x: 99, y: -60 }, path), -Math.PI / 2)
  assert.equal(nearestTangent({ x: 60, y: 2 }, [path[0].toReversed()]), Math.PI)
})
test('ornament spacing crosses input segments without resetting and retains endpoints', () => {
  const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 18, y: 0 }, { x: 25, y: 0 }]
  assert.deepEqual(resamplePath(points, 10), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 25, y: 0 }])
  assert.deepEqual(resamplePath([], 10), [])
})

test('boundary ornaments stay geographically anchored during zoom and reflow only after reset', () => {
  const patterns = createBoundaryPatterns()
  const line = [[0, 0], [40, 0], [60, 30]]
  let scale = 1, offset = 0
  const project = ([x, y]) => ({ x: x * scale + offset, y: y * scale })
  const unproject = ({ x, y }) => [(x - offset) / scale, y / scale]
  const initial = patterns.get(line, 10, project, unproject)
  scale = 2.5; offset = 90
  const zoomed = patterns.get(line, 10, project, unproject)
  assert.strictEqual(zoomed, initial)
  assert.ok(Math.abs(Math.hypot(...zoomed[1].map((v, i) => (v - zoomed[0][i]) * scale)) - 25) < 1e-8)
  patterns.reset()
  const settled = patterns.get(line, 10, project, unproject)
  assert.ok(settled.length > initial.length)
  assert.ok(Math.abs(Math.hypot(...settled[1].map((v, i) => (v - settled[0][i]) * scale)) - 10) < 1e-8)
  assert.deepEqual(settled[0], line[0])
  assert.deepEqual(settled.at(-1), line.at(-1))
})

test('area picking excludes holes and preserves separate polygons and unwrapped world copies', () => {
  const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]
  const polygons = [[square(100, 20, 10), square(103, 23, 4)], [square(120, 20, 5)]]
  assert.equal(insideArea([101, 21], polygons), true)
  assert.equal(insideArea([105, 25], polygons), false)
  assert.equal(insideArea([115, 25], polygons), false)
  assert.equal(insideArea([121, 21], polygons), true)
  assert.equal(insideArea([179, 25], [[square(175, 20, 10)]]), true)
  assert.equal(insideArea([105, 25], [[square(175, 20, 10)]]), false)
})

test('boundary picking tolerates ornament width without closing clipped gaps', () => {
  const paths = [[{ x: 0, y: 0 }, { x: 20, y: 0 }], [{ x: 100, y: 0 }, { x: 120, y: 0 }]]
  assert.equal(nearBoundary({ x: 10, y: 5 }, paths), true)
  assert.equal(nearBoundary({ x: 10, y: 10 }, paths), false)
  assert.equal(nearBoundary({ x: 60, y: 0 }, paths), false)
})

test('polar overshoot is clipped without changing visible intersections or holes', () => {
  const outer = [[100, 30], [150, 100], [180, 30], [100, 30]]
  const hole = [[130, 40], [150, 60], [160, 40], [130, 40]]
  const clipped = clipPolarRing(outer)
  assert.ok(clipped.every(([, lat]) => Math.abs(lat) <= 85))
  assert.ok(clipped.some(([lon, lat]) => lat === 85 && Math.abs(lon - (100 + 50 * 55 / 70)) < 1e-9))
  for (let lat = -20; lat <= 70; lat += 2) for (let lon = 75; lon <= 170; lon += 2) {
    assert.equal(insideArea([lon, lat], [[clipped, clipPolarRing(hole)]]), insideArea([lon, lat], [[outer, hole]]))
  }
  assert.deepEqual(clipPolarRing([[0, 91], [1, 92], [2, 91]]), [])
  assert.ok(clipPolarRing(outer.map(([lon, lat]) => [lon, -lat])).every(([, lat]) => lat >= -85))
})
