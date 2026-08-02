import test from 'node:test'
import assert from 'node:assert/strict'
import { filterMissing } from './flightCategoryLayers.js'

const fc = { type: 'FeatureCollection', features: [
  { properties: { band: 'severe' } }, { properties: { band: 'missing' } } ] }

test('꺼져 있으면 결측 밴드를 뺀다', () => {
  assert.deepEqual(filterMissing(fc, false).features.map((f) => f.properties.band), ['severe'])
})
test('켜져 있으면 그대로 둔다', () => {
  assert.equal(filterMissing(fc, true).features.length, 2)
})
test('값을 안 넘기면 빼는 쪽이 기본이다', () => {
  // 스펙 §3.4 기본 꺼짐. 실수로 빠뜨려도 안전한 쪽으로 떨어진다.
  assert.equal(filterMissing(fc).features.length, 1)
})
