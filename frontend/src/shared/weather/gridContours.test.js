import test from 'node:test'
import assert from 'node:assert/strict'
import { cellRegionRings, ringsToPolygons, signedArea, isothermSegments } from './gridContours.js'

test('mixed icing grades share one outer contour with no internal grade boundary', () => {
  const grades = [1, 2, 3, 1, 3, 2]
  const result = cellRegionRings(3, 2, (x, y) => grades[y * 3 + x] > 0)
  assert.deepEqual(result.outerRings, [[[0, 0], [3, 0], [3, 2], [0, 2], [0, 0]]])
})

test('holes remain empty in fills but are not outlined; diagonal islands stay separate', () => {
  const donut = cellRegionRings(3, 3, (x, y) => !(x === 1 && y === 1))
  assert.equal(donut.outerRings.length, 1)
  assert.equal(donut.rings.length, 2)
  assert.equal(ringsToPolygons(donut.rings)[0].length, 2)
  assert.equal(donut.rings.reduce((sum, r) => sum + signedArea(r), 0), 8)
  assert.equal(cellRegionRings(2, 2, (x, y) => x === y).outerRings.length, 2)
  assert.equal(cellRegionRings(2, 2, () => false).outerRings.length, 0)
})

test('isotherms handle exact zero, holes and saddles without joining missing cells', () => {
  const grid = { nx: 2, ny: 2, xs: [0, 1], ys: [0, 1] }
  assert.deepEqual(isothermSegments({ ...grid, values: [-1, 0, -1, 0] }, 0), [[{ x: 1, y: 0 }, { x: 1, y: 1 }]])
  assert.deepEqual(isothermSegments({ ...grid, values: [-1, 1, null, 1] }, 0), [])
  assert.equal(isothermSegments({ ...grid, values: [1, -1, -1, 1] }, 0).length, 2)
  assert.deepEqual(isothermSegments({ ...grid, values: [0, 0, 0, 0] }, 0), [])
})
