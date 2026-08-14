import test from 'node:test'
import assert from 'node:assert/strict'
import { describeMapFile, MAP_FILE_LIMITS } from './mapFileGuard.js'

const fc = (...features) => ({ type: 'FeatureCollection', features })
const line = (n = 2) => ({ type: 'Feature', properties: {},
  geometry: { type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [127 + i * 0.01, 37]) } })
const point = () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [127, 37] } })
const poly = () => ({ type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]] } })

test('선 하나짜리 경로 파일은 지도가 아니다', () => {
  const r = describeMapFile(fc(line()))
  assert.equal(r.isMap, false)
  assert.equal(r.lines, 1)
})

test('선이 몇 개 있는 것만으로는 막지 않는다', () => {
  // 지금도 여러 경로 중 하나를 고르게 하는 화면이 있다. 그 동작을 뺏으면 안 된다.
  assert.equal(describeMapFile(fc(line(), line(), line())).isMap, false)
})

test('경유점만 있는 파일도 지도가 아니다', () => {
  assert.equal(describeMapFile(fc(point(), point(), point())).isMap, false)
})

test('면이 하나라도 있으면 지도다', () => {
  const r = describeMapFile(fc(line(), poly()))
  assert.equal(r.isMap, true)
  assert.equal(r.polygons, 1)
})

test('선이 아주 많으면 지도다', () => {
  const many = Array.from({ length: MAP_FILE_LIMITS.maxLines + 1 }, () => line())
  assert.equal(describeMapFile(fc(...many)).isMap, true)
})

test('지점이 아주 많으면 지도다', () => {
  const many = Array.from({ length: MAP_FILE_LIMITS.maxPoints + 1 }, () => point())
  assert.equal(describeMapFile(fc(...many)).isMap, true)
})

test('도형 묶음 안의 면도 센다', () => {
  const bundle = { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [
    { type: 'LineString', coordinates: [[127, 37], [128, 37]] },
    { type: 'Polygon', coordinates: [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]] },
  ] } }
  const r = describeMapFile(fc(bundle))
  assert.equal(r.polygons, 1)
  assert.equal(r.isMap, true)
})

test('여러 갈래 도형도 갈래마다 센다', () => {
  const multi = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
    [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]],
    [[[128, 38], [128.1, 38], [128.1, 38.1], [128, 38]]],
  ] } }
  assert.equal(describeMapFile(fc(multi)).polygons, 2)
})

test('빈 파일이나 깨진 값에도 던지지 않는다', () => {
  assert.equal(describeMapFile(null).isMap, false)
  assert.equal(describeMapFile(fc()).features, 0)
  assert.equal(describeMapFile({ type: 'FeatureCollection' }).features, 0)
})

test('개수를 그대로 돌려준다 — 사용자에게 보여줄 값이다', () => {
  const r = describeMapFile(fc(line(), poly(), point()))
  assert.equal(r.features, 3)
  assert.deepEqual([r.polygons, r.lines, r.points], [1, 1, 1])
})
