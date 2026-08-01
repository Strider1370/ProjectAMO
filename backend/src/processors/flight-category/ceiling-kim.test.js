import test from 'node:test'
import assert from 'node:assert/strict'
import { ceilingFromLevels, CLD_THRESHOLD, buildCeilingGeoJson } from './ceiling-kim.js'

const lv = (id, cld, hgt) => ({ id, cld: Float32Array.from([cld]), hgt: Float32Array.from([hgt]) })

test('임계값을 처음 넘는 층의 고도를 운저로 삼는다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.1, 261), lv('950hPa', 0.7, 491)], 0), 491)
})

test('모든 층이 미달이면 운저 없음', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.0, 261), lv('950hPa', 0.2, 491)], 0), null)
})

test('임계값 경계는 이상(>=)으로 판정한다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', CLD_THRESHOLD, 261)], 0), 261)
})

test('결측 층은 건너뛴다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', Number.NaN, 261), lv('950hPa', 0.8, 491)], 0), 491)
})

test('위성이 구름 없다고 하면 그 격자는 운저를 지운다', () => {
  const kim = {
    run: '2026080100',
    grid: { nx: 2, ny: 1, lonMin: 126, latMin: 37, lonMax: 127, latMax: 37 },
    ceilingM: Float32Array.from([300, 300]),
  }
  const alwaysClear = { frameTm: 'x', isClearAt: () => true }
  const fc = buildCeilingGeoJson(kim, alwaysClear)
  assert.equal(fc.features.length, 0)
})
