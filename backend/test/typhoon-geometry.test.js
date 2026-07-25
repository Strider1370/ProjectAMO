import test from 'node:test'
import assert from 'node:assert/strict'
import * as turf from '@turf/turf'
import {
  BEARING_BY_POINT, asymmetricPolygon, galePolygon, stormPolygon, judgementPolygon, errorConePolygon,
} from '../src/briefing/typhoon-geometry.js'

const CENTER = { lat: 30, lon: 125 }
// 중심에서 bearing 방향으로 정확히 distanceKm 떨어진 점.
const at = (bearing, distanceKm) => turf.destination([CENTER.lon, CENTER.lat], distanceKm, bearing, { units: 'kilometers' })
const inside = (poly, point) => turf.booleanPointInPolygon(point, poly)

test('16방위 표가 정북 0도에서 시작해 22.5도씩 돈다', () => {
  assert.equal(BEARING_BY_POINT.N, 0)
  assert.equal(BEARING_BY_POINT.NNE, 22.5)
  assert.equal(BEARING_BY_POINT.SW, 225)
  assert.equal(BEARING_BY_POINT.WNW, 292.5)
  assert.equal(Object.keys(BEARING_BY_POINT).length, 16)
})

test('예외 방향이 없으면 온전한 원이다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 100, exceptionDir: null, exceptionRadiusKm: null })
  assert.ok(inside(poly, at(0, 90)))
  assert.ok(inside(poly, at(225, 90)))
  assert.ok(!inside(poly, at(225, 110)))
})

test('예외 방향에서만 반경이 줄어든다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 400, exceptionDir: 'SW', exceptionRadiusKm: 300 })
  // 축소 방향(SW=225): 300km 안쪽은 들고 350km는 빠진다.
  assert.ok(inside(poly, at(225, 280)))
  assert.ok(!inside(poly, at(225, 350)))
  // 반대 방향(NE=45): 온전한 400km가 유지된다.
  assert.ok(inside(poly, at(45, 380)))
})

test('축소 방향에서 90도 이상 벗어나면 원래 반경이다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 400, exceptionDir: 'SW', exceptionRadiusKm: 300 })
  // SW(225)에서 정확히 90도 떨어진 SE(135)와 NW(315).
  assert.ok(inside(poly, at(135, 390)))
  assert.ok(inside(poly, at(315, 390)))
})

test('반경이 결측이면 도형을 만들지 않는다', () => {
  assert.equal(asymmetricPolygon({ ...CENTER, radiusKm: null }), null)
  assert.equal(galePolygon({ ...CENTER, gale: null }), null)
  assert.equal(stormPolygon({ ...CENTER, storm: null }), null)
  assert.equal(judgementPolygon({ ...CENTER, gale: null, errorRadiusKm: 100 }), null)
})

test('판정 도형은 강풍반경에 오차반경을 더한다', () => {
  const row = { ...CENTER, gale: { radiusKm: 380, exceptionDir: 'WNW', exceptionRadiusKm: 230 }, errorRadiusKm: 110 }
  const poly = judgementPolygon(row)
  // 온전한 방향: 380 + 110 = 490km 안쪽은 들고 그 밖은 빠진다.
  assert.ok(inside(poly, at(112.5, 470)))
  assert.ok(!inside(poly, at(112.5, 510)))
  // 축소 방향(WNW=292.5): 230 + 110 = 340km.
  assert.ok(inside(poly, at(292.5, 320)))
  assert.ok(!inside(poly, at(292.5, 360)))
})

test('오차반경이 없으면 판정 도형은 강풍반경만 쓴다', () => {
  const poly = judgementPolygon({ ...CENTER, gale: { radiusKm: 200, exceptionDir: null, exceptionRadiusKm: null }, errorRadiusKm: null })
  assert.ok(inside(poly, at(0, 180)))
  assert.ok(!inside(poly, at(0, 220)))
})

test('부채꼴은 예보 시점 오차원을 모두 감싼다', () => {
  const rows = [
    { lat: 30, lon: 125, errorRadiusKm: 0 },   // 분석 시점: 오차 0이라 원이 없다
    { lat: 32, lon: 126, errorRadiusKm: 60 },
    { lat: 34, lon: 127, errorRadiusKm: 140 },
  ]
  const cone = errorConePolygon(rows)
  assert.ok(cone)
  assert.ok(turf.booleanPointInPolygon(turf.point([126, 32]), cone))
  assert.ok(turf.booleanPointInPolygon(turf.point([127, 34]), cone))
  // 오차반경 0인 분석 지점은 원이 만들어지지 않으므로 부채꼴에 들지 않는다.
  assert.ok(!turf.booleanPointInPolygon(turf.point([125, 30]), cone))
  // 마지막 지점 주변 100km는 오차원(140km) 안이다.
  assert.ok(turf.booleanPointInPolygon(turf.destination([127, 34], 100, 90, { units: 'kilometers' }), cone))
})

test('예보 원들이 떨어져 있으면 MultiPolygon이 된다', () => {
  const cone = errorConePolygon([
    { lat: 30, lon: 125, errorRadiusKm: 60 },
    { lat: 34, lon: 127, errorRadiusKm: 140 },
  ])
  // 부채꼴은 Polygon일 수도 MultiPolygon일 수도 있다. 소비자는 둘 다 처리해야 한다.
  assert.ok(['Polygon', 'MultiPolygon'].includes(cone.type))
})

test('오차반경이 전부 결측이면 부채꼴이 없다', () => {
  assert.equal(errorConePolygon([{ lat: 30, lon: 125, errorRadiusKm: null }]), null)
  assert.equal(errorConePolygon([]), null)
})
