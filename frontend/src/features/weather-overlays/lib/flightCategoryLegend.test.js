import test from 'node:test'
import assert from 'node:assert/strict'
import { legendStamps } from './flightCategoryLegend.js'

const sources = { kim: { run: '2026080106', hf: 0 }, stations: { asos: 4, amos: 1, tm: '202608012200' } }

test('층마다 다른 시각을 준다', () => {
  // 시정 20분, 운고 하루 네 번, 지점 매시. 하나로 뭉치면 여섯 시간 묵은
  // 운고를 방금 것으로 착각한다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.notEqual(out.visibility, out.ceiling)
  assert.notEqual(out.ceiling, out.stations)
})

test('세 시각이 같은 시간대로 나온다', () => {
  // computed_at은 UTC, kim.run도 UTC, stations.tm은 KST다. 그대로 늘어놓으면
  // 9시간 어긋난 값이 나란히 보인다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.equal(out.visibility, '00:22')   // 15:22Z = 익일 00:22 KST
  assert.equal(out.ceiling, '15:00')      // 2026080106Z = 15:00 KST
  assert.equal(out.stations, '22:00')     // 이미 KST
})

test('자료를 한 번도 못 받았으면 자료 없음이다', () => {
  const out = legendStamps(null, false, null, 'Asia/Seoul')
  assert.equal(out.visibility, '자료 없음')
  assert.equal(out.ceiling, '자료 없음')
  assert.equal(out.stations, '자료 없음')
})

test('지점 수를 센다', () => {
  // 맑은 날 97곳 중 4곳뿐인 것이 정상이다. 숫자가 없으면 고장으로 오해한다.
  assert.equal(legendStamps(sources, true, null, 'Asia/Seoul').stationCount, 5)
})
