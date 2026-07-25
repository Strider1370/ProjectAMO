import assert from 'node:assert/strict'
import test from 'node:test'
import { createMotionInput, deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from '../src/processors/radar-motion.js'
import { MOTION_MODEL_DEFAULTS } from '../src/processors/radar-motion-model.js'

test('no-data(-25000)는 0으로 클램프된다', () => {
  // 4x4 블록 하나는 전부 no-data, 하나는 에코.
  const nx = 8, ny = 4
  const refl = new Int16Array(nx * ny).fill(-25000)
  for (let y = 0; y < 4; y += 1) for (let x = 4; x < 8; x += 1) refl[y * nx + x] = 3000

  const input = createMotionInput(refl, { nx, ny }, { stride: 4 })
  assert.equal(input.values[0], 0, 'no-data 블록은 0이어야 한다')
  assert.equal(input.values[1], 3000, '에코 블록은 그대로여야 한다')
})

test('경계값: 블록 최댓값이 정확히 -25000이면 0, 약한 에코가 섞이면 에코 값을 쓴다', () => {
  // 블록 0(0~3열)은 전부 no-data라 최댓값이 정확히 -25000 — 클램프가 없으면 -25000이 그대로 나온다.
  // 블록 1(4~7열)은 no-data 사이에 약한 에코 하나 — 최댓값이 -25000보다 크므로 클램프와 무관하게 800이어야 한다.
  const nx = 8, ny = 4
  const refl = new Int16Array(nx * ny).fill(-25000)
  refl[4] = 800
  const input = createMotionInput(refl, { nx, ny }, { stride: 4 })
  assert.equal(input.values[0], 0, '전부 no-data인 블록은 0이어야 한다')
  assert.equal(input.values[1], 800, '약한 에코가 섞인 블록은 에코 값을 그대로 써야 한다')
})

const SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 1, patchRadiusKm: 3, spacingKm: 2,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
  edgeLookaheadKm: 2, minSpeedKt: 3,
}
const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.01, lat: 38 - y * 0.01 })

function shifted(offsetX, offsetY) {
  const width = 80, height = 80
  const refl = new Int16Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d2 = (x - offsetX - 40) ** 2 + (y - offsetY - 40) ** 2
      refl[y * width + x] = Math.round(6000 * Math.exp(-d2 / 200))
    }
  }
  return createMotionInput(refl, { nx: width, ny: height }, { stride: 1 })
}

test('동쪽으로 옮긴 에코는 과반이 동쪽 방위를 낸다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), { settings: SETTINGS, gridToLatLon })
  assert.ok(geojson.features.length > 0, '화살표가 하나도 없으면 안 된다')
  const east = geojson.features.filter((f) => f.properties.bearingDeg > 45 && f.properties.bearingDeg < 135)
  assert.ok(east.length / geojson.features.length > 0.6, `동쪽 비율 ${east.length}/${geojson.features.length}`)
})

test('모든 Feature는 Point이고 필수 속성을 갖는다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), { settings: SETTINGS, gridToLatLon })
  for (const f of geojson.features) {
    assert.equal(f.geometry.type, 'Point')
    assert.ok(Number.isInteger(f.properties.bearingDeg))
    assert.ok(f.properties.bearingDeg >= 0 && f.properties.bearingDeg < 360)
    assert.ok(Number.isInteger(f.properties.speedKt))
    assert.equal(typeof f.properties.matchScore, 'number')
    assert.equal(typeof f.properties.neighbourAgreement, 'number')
  }
})

test('격자 규격이 다르면 빈 FeatureCollection', () => {
  const a = shifted(0, 0)
  assert.deepEqual(deriveMotionGeoJSON(a, { ...a, width: a.width + 1 }, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('에코가 없으면 빈 FeatureCollection', () => {
  const empty = createMotionInput(new Int16Array(6400), { nx: 80, ny: 80 }, { stride: 1 })
  assert.deepEqual(deriveMotionGeoJSON(empty, empty, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('마감시한이 지났으면 빈 FeatureCollection', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), {
    settings: SETTINGS, gridToLatLon, deadlineAtMs: Date.now() - 1,
  })
  assert.deepEqual(geojson.features, [])
})

test('직렬화는 왕복한다', () => {
  const input = shifted(0, 0)
  const restored = deserializeMotionInput(serializeMotionInput({ ...input, tm: '202607261200' }))
  assert.equal(restored.width, input.width)
  assert.equal(restored.stride, input.stride)
  assert.equal(restored.tm, '202607261200')
  assert.deepEqual(Array.from(restored.values.slice(0, 50)), Array.from(input.values.slice(0, 50)))
})
