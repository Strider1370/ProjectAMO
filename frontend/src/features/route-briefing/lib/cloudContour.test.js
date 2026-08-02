import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCloudContourModel } from './cloudContour.js'

const levelsFrom = (matrix, altitudes = [1000, 3000, 5000]) => matrix.map((row, y) => ({
  pressure: [975, 925, 850][y],
  values: row.map((cld, x) => ({ distanceNm: x * 10, altFt: altitudes[y], cld })),
}))

test('builds one closed outline around an isolated CLD region', () => {
  const model = buildCloudContourModel(levelsFrom([[.1, .1, .1], [.1, .9, .1], [.1, .1, .1]]), .6)
  assert.equal(model.status, 'detected'); assert.equal(model.partial, false); assert.equal(model.chains.length, 1)
  assert.deepEqual(model.chains[0][0], model.chains[0].at(-1))
})
test('does not bridge disconnected clouds across missing CLD', () => {
  const model = buildCloudContourModel(levelsFrom([[.1,.1,null,.1,.1],[.1,.9,null,.9,.1],[.1,.1,null,.1,.1]]), .6)
  assert.equal(model.chains.length, 2); assert.equal(model.partial, true)
})
test('reports unavailable and not detected distinctly', () => {
  assert.equal(buildCloudContourModel(levelsFrom([[null,null],[null,null]]), .6).status, 'unavailable')
  assert.equal(buildCloudContourModel(levelsFrom([[.1,.2],[.2,.5]]), .6).status, 'not_detected')
})
test('interpolates using actual per-sample altitude', () => {
  const levels = levelsFrom([[.1,.1,.1],[.1,.9,.1],[.1,.1,.1]])
  levels[1].values[1].altFt = 3600
  assert.ok(buildCloudContourModel(levels, .6).chains.flat().some(({ altFt }) => altFt > 3000 && altFt < 3600))
})
test('handles exact-threshold vertices without degenerate segments', () => {
  const model = buildCloudContourModel(levelsFrom([[.1,.1,.1],[.1,.6,.1],[.1,.1,.1]]), .6)
  assert.ok(model.chains.every((chain) => chain.every((point, index) => index === 0 || point.distanceNm !== chain[index - 1].distanceNm || point.altFt !== chain[index - 1].altFt)))
})
test('keeps monotone crossings and saddles deterministic', () => {
  assert.equal(buildCloudContourModel(levelsFrom([[.1,.9],[.1,.9]]), .6).chains.length, 1)
  assert.equal(buildCloudContourModel(levelsFrom([[.9,.1],[.1,.9]]), .6).chains.length, 2)
})
