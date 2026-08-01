import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyVisibility, buildVisibilityGeoJson } from './flight-category-processor.js'
import { SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'

test('시정 밴드 경계값', () => {
  assert.equal(classifyVisibility(2999), 'severe')
  assert.equal(classifyVisibility(3000), 'below')
  assert.equal(classifyVisibility(4999), 'below')
  assert.equal(classifyVisibility(5000), 'marginal')
  assert.equal(classifyVisibility(6999), 'marginal')
  assert.equal(classifyVisibility(7000), 'clear')
})

test('결측은 missing이며 절대 clear가 아니다', () => {
  assert.equal(classifyVisibility(-1), 'missing')
})

test('clear 구역은 폴리곤을 만들지 않는다', () => {
  const grid = new Float32Array(SFC_W * SFC_H).fill(9000)
  grid[SFC_W * 100 + 100] = 1000
  const bands = buildVisibilityGeoJson(grid).features.map((f) => f.properties.band)
  assert.ok(bands.includes('severe'))
  assert.ok(!bands.includes('clear'))
})
