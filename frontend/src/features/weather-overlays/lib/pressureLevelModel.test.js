import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flightLevelForPressure,
  nearestPressureLevelForAltitude,
  altitudePositionPct,
  KIM_PRESSURE_LEVELS,
  formatPressureFlightLevel,
  pressureLevelPosition,
  standardAltitudeFtForPressure,
} from './pressureLevelModel.js'

test('pressure levels use ICAO standard-atmosphere display references', () => {
  assert.ok(Math.abs(standardAltitudeFtForPressure(850) - 4781) < 80)
  assert.equal(flightLevelForPressure(700), 100)
  assert.equal(formatPressureFlightLevel(700), 'FL100')
})

test('pressure slider spaces discrete pressure levels evenly from top to bottom', () => {
  const levels = [{ value: 150 }, { value: 250 }, { value: 1000 }]
  assert.equal(pressureLevelPosition(levels[0], levels), 0)
  assert.equal(pressureLevelPosition(levels[1], levels), 50)
  assert.equal(pressureLevelPosition(levels[2], levels), 100)
})

test('고도에 가장 가까운 기압면을 표준대기 고도로 고른다', () => {
  const levels = [500, 400, 350, 300, 250, 850, 700].map((value) => ({ id: `${value}hPa`, value }))
  // 표준대기: 400hPa ≈ 23,600ft, 350hPa ≈ 26,600ft → FL250은 400hPa가 더 가깝다.
  assert.equal(nearestPressureLevelForAltitude(levels, 25000).id, '400hPa')
  assert.equal(nearestPressureLevelForAltitude(levels, 3000).id, '850hPa')
  assert.equal(nearestPressureLevelForAltitude(levels, null), null)
  assert.equal(nearestPressureLevelForAltitude([], 25000), null)
})

test('슬라이더 위 고도 위치: 눈금(기압면) 사이를 표준대기 고도로 보간, 범위 밖은 끝에 붙인다', () => {
  // 슬라이더 순서: 맨 위 = 가장 높은 고도(낮은 기압).
  const levels = [250, 300, 400, 500].map((value) => ({ id: `${value}hPa`, kind: 'pressure', value }))
  assert.equal(altitudePositionPct(levels, 60000), 0)
  assert.equal(altitudePositionPct(levels, 0), 100)
  const at400 = altitudePositionPct(levels, standardAltitudeFtForPressure(400))
  assert.ok(Math.abs(at400 - 200 / 3) < 0.01)
  const mid = altitudePositionPct(levels, (standardAltitudeFtForPressure(300) + standardAltitudeFtForPressure(400)) / 2)
  assert.ok(Math.abs(mid - 50) < 0.01)
  assert.equal(altitudePositionPct([], 1000), null)
  assert.equal(KIM_PRESSURE_LEVELS.length, 21)
  assert.deepEqual(KIM_PRESSURE_LEVELS.at(-1), { id: '150hPa', label: '150', kind: 'pressure', value: 150 })
})
