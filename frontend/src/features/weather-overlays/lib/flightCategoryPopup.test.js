import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPointLines, formatStationLines } from './flightCategoryPopup.js'

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

const station = {
  id: 'asos_93', name: '북춘천', source: 'ASOS', ceiling_ft: 6562,
  model_ceiling_ft: null, sky_clear: false, visibility_m: 20000,
  obs_tm: '202608021600', fill: 'good', ring: false,
}
const findStn = (s, label) => formatStationLines(s).find((l) => l.label === label)

test('이름과 출처를 첫 줄에 적는다', () => {
  assert.equal(formatStationLines(station)[0].value, '북춘천 (ASOS)')
})

test('운고는 100 ft 단위로 반올림하고 약을 붙인다', () => {
  assert.equal(findStn(station, '운고').value, '약 6,600 ft')
})

test('시정은 관측소 실측값이다', () => {
  assert.equal(findStn(station, '시정').value, '20,000 m')
})

test('관측 시각은 obs_tm의 KST 벽시계 HH:mm을 그대로 읽는다', () => {
  // obs_tm은 이미 KST다 — UTC로 파싱한 뒤 되돌리면 오히려 틀린다.
  assert.equal(findStn(station, '관측').value, '16:00')
})

test('sky_clear면 운고 대신 구름 없음을 적는다', () => {
  const s = { ...station, ceiling_ft: null, sky_clear: true }
  assert.equal(findStn(s, '운고').value, '구름 없음')
})

test('시정이 없으면 자료 없음이다', () => {
  const s = { ...station, visibility_m: null }
  assert.equal(findStn(s, '시정').value, '자료 없음')
})

test('관측 시각이 형식에 안 맞으면 자료 없음이다', () => {
  const s = { ...station, obs_tm: null }
  assert.equal(findStn(s, '관측').value, '자료 없음')
})

test('ring이면 운고 줄에 모델값과 차이를 함께 적고 눈에 띄게 한다', () => {
  const s = { ...station, ceiling_ft: 1200, model_ceiling_ft: 1713, ring: true }
  const line = findStn(s, '운고')
  assert.equal(line.alert, true)
  assert.equal(line.note, '약 1,700 ft · 차이 513 ft')
})

test('ring인데 모델이 구름 없음(missing band)이면 숫자 대신 문구를 적는다', () => {
  const s = { ...station, ceiling_ft: 1200, model_ceiling_ft: null, ring: true }
  assert.equal(findStn(s, '운고').note, '모델 구름 없음')
})

test('ring이 아니면 운고 줄에 note를 붙이지 않는다', () => {
  assert.equal(findStn(station, '운고').note, null)
  assert.equal(findStn(station, '운고').alert, false)
})
