import test from 'node:test'
import assert from 'node:assert/strict'
import { stationMarkerStyle, toStationFeatures, LOW_FT, MID_FT, RING_MIN_DIFF_FT } from './flightCategoryStations.js'

const stn = (over) => ({
  id: 'asos_1', name: '시험', source: 'ASOS', lat: 37, lon: 127,
  ceiling_ft: 1000, model_ceiling_ft: 2000, diff_ft: -1000, ...over,
})

test('색은 관측 운고 밴드를 따른다', () => {
  // 450 m = 1476 ft, 900 m = 2953 ft
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1000 })).fill, 'severe')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 2000 })).fill, 'caution')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 5000 })).fill, 'good')
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

test('sky_clear 지점은 초록이고 테두리가 없다', () => {
  // ceiling_ft가 null(-9 결측)이어도 sky_clear는 "구름 없음" 확인이지 관측 실패가 아니다.
  const style = stationMarkerStyle(stn({ ceiling_ft: null, model_ceiling_ft: 1200, sky_clear: true }))
  assert.equal(style.fill, 'good')
  assert.equal(style.ring, false)
})

test('sky_clear 지점은 남는다 — 결측과 헷갈려 빠지면 안 된다', () => {
  const fc = toStationFeatures([stn({ ceiling_ft: null, sky_clear: true })])
  assert.equal(fc.features.length, 1)
  assert.equal(fc.features[0].properties.fill, 'good')
})

test('결측이고 sky_clear도 아니면 여전히 빠진다', () => {
  // 이 쌍이 스펙의 안전 규칙이다 — sky_clear와 결측을 가르는 경계가 무너지면
  // 고장난 관측소가 초록 "OK"로 뜬다.
  const fc = toStationFeatures([stn({ ceiling_ft: null, sky_clear: false })])
  assert.equal(fc.features.length, 0)
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
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: MID_FT })).fill, 'caution')
})

test('450 m 경계값은 caution이다 (하한 경계는 이미 옳음)', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: LOW_FT })).fill, 'caution')
})

test('차이가 정확히 200 ft이면 테두리를 붙이지 않는다 (초과만 해당)', () => {
  // obs는 low band, model은 mid band로 실제로 밴드가 갈리게 하여
  // 200 ft 비교가 판정을 결정하도록 만든다.
  assert.equal(
    stationMarkerStyle(stn({ ceiling_ft: LOW_FT - RING_MIN_DIFF_FT, model_ceiling_ft: LOW_FT })).ring,
    false,
  )
})
