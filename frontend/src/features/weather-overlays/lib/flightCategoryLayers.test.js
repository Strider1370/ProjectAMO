import test from 'node:test'
import assert from 'node:assert/strict'
import { filterMissing, esc } from './flightCategoryLayers.js'

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

test('esc는 관측소 이름 같은 자유 텍스트의 HTML 특수문자를 이스케이프한다', () => {
  // fix round 1: station.name이 innerHTML로 그대로 들어가면 안 된다 — 신뢰 경계.
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
  assert.equal(esc('AT&T "구역"'), 'AT&amp;T &quot;구역&quot;')
})
