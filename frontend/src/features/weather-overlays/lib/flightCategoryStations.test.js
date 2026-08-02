import test from 'node:test'
import assert from 'node:assert/strict'
import { stationMarkerStyle, toStationFeatures } from './flightCategoryStations.js'

const stn = (over) => ({
  id: 'asos_1', name: '시험', source: 'ASOS', lat: 37, lon: 127,
  ceiling_ft: 1000, model_ceiling_ft: 2000, diff_ft: -1000, ...over,
})

test('색은 관측 운고 밴드를 따른다', () => {
  // 450 m = 1476 ft, 900 m = 2953 ft
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1000 })).fill, 'severe')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 2000 })).fill, 'caution')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 5000 })).fill, 'none')
})

test('한 밴드 이상 낮고 200 ft를 넘으면 테두리를 붙인다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })).ring, true)
})

test('밴드는 달라도 차이가 작으면 붙이지 않는다', () => {
  // 1470 ft = low, 1480 ft = mid. 경계선을 살짝 걸친 것뿐이다.
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1470, model_ceiling_ft: 1480 })).ring, false)
})

test('모델이 더 보수적이면 붙이지 않는다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 2000, model_ceiling_ft: 1200 })).ring, false)
})

test('모델이 구름 없음인데 관측이 900 m 미만이면 붙인다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: null, diff_ft: null })).ring, true)
})

test('모델이 구름 없음이어도 관측이 900 m 이상이면 붙이지 않는다', () => {
  // 어긋난 것은 맞지만 운항에 걸리는 높이가 아니다. 붙이면 경고가 흔해진다.
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 5000, model_ceiling_ft: null, diff_ft: null })).ring, false)
})

test('관측값이 없는 지점은 아예 그리지 않는다', () => {
  // 그리면 "속 빈 점"이 되어 스펙 §3.3의 "관측 900 m 초과"와 똑같이 보인다.
  // 자료 없음이 맑은 하늘로 읽히는 것 — 이 계획이 없애려는 실패 방식이다.
  assert.equal(toStationFeatures([stn({ ceiling_ft: null })]).features.length, 0)
  assert.equal(toStationFeatures([stn({ ceiling_ft: -1 })]).features.length, 0)
})

test('빈 목록도 유효한 FeatureCollection을 만든다', () => {
  const fc = toStationFeatures([])
  assert.equal(fc.type, 'FeatureCollection')
  assert.deepEqual(fc.features, [])
})

test('좌표와 표식 속성을 실어 보낸다', () => {
  const [f] = toStationFeatures([stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })]).features
  assert.deepEqual(f.geometry.coordinates, [127, 37])
  assert.equal(f.properties.fill, 'severe')
  assert.equal(f.properties.ring, true)
  assert.equal(f.properties.name, '시험')
})

test('900 m 경계값은 caution이다 (900 m 이하는 mid)', () => {
  const MID_FT = 900 * 3.28084
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: MID_FT })).fill, 'caution')
})

test('450 m 경계값은 caution이다 (하한 경계는 이미 옳음)', () => {
  const LOW_FT = 450 * 3.28084
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: LOW_FT })).fill, 'caution')
})

test('차이가 정확히 200 ft이면 테두리를 붙이지 않는다 (초과만 해당)', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1000, model_ceiling_ft: 1200 })).ring, false)
})
