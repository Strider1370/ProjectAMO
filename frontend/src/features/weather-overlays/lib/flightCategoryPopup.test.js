import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPointLines } from './flightCategoryPopup.js'

const point = {
  vis_m: 4200, vis_band: 'below', ceil_ft: 1713, ceil_band: 'mid', vis_trend: -2100,
  nearest_station: { name: '청주', distance_km: 12.3, ceiling_ft: 1200, model_ceiling_ft: 1713, diff_ft: -513 },
}
const find = (p, label) => formatPointLines(p).find((l) => l.label === label)

test('운고는 100 ft 단위로 반올림하고 약을 붙인다', () => {
  // 모델 층 간격이 200~250 m라 1,713 ft라고 적으면 없는 정밀도를 주장하게 된다.
  assert.equal(find(point, '운고').value, '약 1,700 ft')
})

test('추세는 미터로 적는다', () => {
  // 스펙 §4.2가 정한 형식이다.
  assert.equal(find(point, '추세').value, '지난 3시간 −2,100 m')
})

test('시정에는 관측소 줄을 붙이지 않는다', () => {
  // 시정 격자가 이미 ASOS 관측을 객관분석한 결과물이라 중복이다(선행 스펙 §5.1).
  assert.equal(formatPointLines(point).filter((l) => l.note?.includes('청주')).length, 1)
  assert.equal(formatPointLines(point).findIndex((l) => l.note?.includes('청주')), 2)
})

test('관측소 줄에 거리를 항상 적는다', () => {
  assert.ok(formatPointLines(point).find((l) => l.note?.includes('청주')).note.includes('12.3 km'))
})

test('관측이 모델보다 낮으면 그 줄을 눈에 띄게 한다', () => {
  assert.equal(formatPointLines(point).find((l) => l.note?.includes('청주')).alert, true)
})

test('모델이 구름 없음이어도 관측이 높으면 눈에 띄게 하지 않는다', () => {
  // 지도의 테두리 규칙과 같아야 한다. 다르면 점은 조용한데 말풍선만 빨개진다.
  const p = { ...point, nearest_station: { name: '영천', distance_km: 97.7, ceiling_ft: 19358, model_ceiling_ft: null, diff_ft: null } }
  assert.equal(formatPointLines(p).find((l) => l.note?.includes('영천')).alert, false)
})

test('자료가 없는 줄은 자료 없음으로 적는다', () => {
  // 빈칸은 0이나 "문제없음"으로 읽힌다.
  const p = { vis_m: null, ceil_ft: null, vis_trend: null, nearest_station: null }
  assert.equal(find(p, '시정').value, '자료 없음')
  assert.equal(find(p, '운고').value, '자료 없음')
  assert.equal(find(p, '추세').value, '자료 없음')
})

test('관측이 없는 인근 관측소는 줄 자체를 빼지만 다른 줄은 그대로 있다', () => {
  // 스펙 §4.2의 "거리를 항상 같이 적는다"는 값이 있을 때 거리를 붙이라는 뜻이지,
  // 값 없이 거리만 적힌 줄을 항상 보이라는 뜻이 아니다. 비교 대상이 없는데
  // "청주 12.3 km"만 뜨면 그 결측을 "괜찮다"로 읽게 된다.
  const p = { ...point, nearest_station: { ...point.nearest_station, ceiling_ft: null } }
  const lines = formatPointLines(p)
  assert.equal(lines.some((l) => l.note?.includes('청주')), false)
  assert.equal(find(p, '시정').value, '4,200 m')
  assert.equal(find(p, '운고').value, '약 1,700 ft')
  assert.equal(find(p, '추세').value, '지난 3시간 −2,100 m')
})

test('음수 결측 센티널도 자료 없음으로 다룬다 (band()와 같은 정의)', () => {
  const p = { ...point, ceil_ft: -1, nearest_station: { ...point.nearest_station, ceiling_ft: -1 } }
  assert.equal(find(p, '운고').value, '자료 없음')
  assert.equal(formatPointLines(p).some((l) => l.note?.includes('청주')), false)
})
