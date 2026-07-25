import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_QUALITY, beamHeightMsl, echoTopFromColumn } from '../src/processors/echo-top-model.js'

test('beam height uses the 4/3 earth radius and adds radar altitude', () => {
  // 0도 앙각, 100 km: 4/3 지구반경(8,494,678 m)에서 빔은 588.6 m 상승한다(r²/2Rₑ).
  // 레이더 해발고도 100 m를 더해 688.6 m. 실제 지구반경을 쓰면 884.8 m가 나오므로
  // 이 단언은 4/3 보정이 빠진 구현을 잡아낸다.
  const height = beamHeightMsl(100000, 0, 100)
  assert.ok(Math.abs(height - 688.6) < 1, `height ${height}`)
})

test('beam height grows with elevation angle', () => {
  assert.ok(beamHeightMsl(50000, 5, 0) > beamHeightMsl(50000, 0.5, 0))
})

test('zero range returns the radar altitude itself', () => {
  assert.equal(Math.round(beamHeightMsl(0, 1.5, 250)), 250)
})

test('interpolates the 18 dBZ crossing between the top echo and the sample above it', () => {
  const result = echoTopFromColumn([
    { heightM: 1000, dbz: 40 },
    { heightM: 2000, dbz: 28 },
    { heightM: 3000, dbz: 8 },
  ], { thresholdDbz: 18 })
  // 2000 m(28 dBZ) ~ 3000 m(8 dBZ) 사이에서 18 dBZ 교차 = 2500 m.
  assert.equal(result.quality, ECHO_TOP_QUALITY.INTERPOLATED)
  assert.ok(Math.abs(result.heightM - 2500) < 1, `heightM ${result.heightM}`)
})

test('without a valid upper bracket it reports the beam-centre floor, never extrapolates', () => {
  const result = echoTopFromColumn([
    { heightM: 1000, dbz: 40 },
    { heightM: 2000, dbz: 30 },
  ], { thresholdDbz: 18 })
  assert.equal(result.quality, ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR)
  assert.equal(result.heightM, 2000)
})

test('a column with no sample at or above the threshold has no echo top', () => {
  assert.equal(echoTopFromColumn([
    { heightM: 1000, dbz: 10 },
    { heightM: 2000, dbz: 5 },
  ], { thresholdDbz: 18 }), null)
})

test('an empty column has no echo top', () => {
  assert.equal(echoTopFromColumn([], { thresholdDbz: 18 }), null)
})

test('a sample exactly at the threshold counts as an echo', () => {
  const result = echoTopFromColumn([{ heightM: 1500, dbz: 18 }], { thresholdDbz: 18 })
  assert.equal(result.quality, ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR)
  assert.equal(result.heightM, 1500)
})
