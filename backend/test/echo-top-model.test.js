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

import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'
import { computeSiteEchoTop, mergeSiteEchoTops } from '../src/processors/echo-top-model.js'

// 관악산 부근에 가상 레이더 하나. 2개 sweep, 1개 방위, 2개 range gate.
function fakeVolume({ stn = 'TST', dbzHigh = 4000, dbzLow = 800 } = {}) {
  return {
    stn,
    latitude: 37.44,
    longitude: 126.96,
    altitudeM: 500,
    rangeM: Float32Array.from([10000, 20000]),
    sweeps: [
      { elevationDeg: 0.5, azimuthDeg: Float32Array.from([0]), dbz: Int16Array.from([dbzHigh, dbzHigh]), scaleFactor: 0.01, fillValue: -32768 },
      { elevationDeg: 6.0, azimuthDeg: Float32Array.from([0]), dbz: Int16Array.from([dbzLow, dbzLow]), scaleFactor: 0.01, fillValue: -32768 },
    ],
  }
}

test('site echo top marks cells along the observed ray and leaves the rest invalid', () => {
  const result = computeSiteEchoTop(fakeVolume(), { thresholdDbz: 18, grid: ECHO_TOP_GRID })
  assert.equal(result.heightM.length, ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny)
  const marked = result.quality.reduce((n, q) => n + (q !== 255 ? 1 : 0), 0)
  assert.ok(marked > 0 && marked < 50, `marked ${marked}`)
})

test('fill values are excluded from the echo top', () => {
  const volume = fakeVolume()
  volume.sweeps[0].dbz = Int16Array.from([-32768, -32768])
  volume.sweeps[1].dbz = Int16Array.from([-32768, -32768])
  const result = computeSiteEchoTop(volume, { thresholdDbz: 18, grid: ECHO_TOP_GRID })
  assert.equal(result.quality.reduce((n, q) => n + (q !== 255 ? 1 : 0), 0), 0)
})

test('merge keeps the higher echo top and records which site produced it', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const low = { stn: 'AAA', heightM: new Float32Array(size), quality: new Uint8Array(size).fill(255) }
  const high = { stn: 'BBB', heightM: new Float32Array(size), quality: new Uint8Array(size).fill(255) }
  const index = echoTopIndexForLatLon(37.5, 127.0)
  low.heightM[index] = 5000; low.quality[index] = 1
  high.heightM[index] = 9000; high.quality[index] = 0

  const merged = mergeSiteEchoTops([low, high], { grid: ECHO_TOP_GRID })
  assert.equal(merged.heightM[index], 9000)
  assert.equal(merged.quality[index], 0)
  assert.equal(merged.siteIndex[index], 1)
})

test('merging zero sites yields an entirely invalid composite', () => {
  const merged = mergeSiteEchoTops([], { grid: ECHO_TOP_GRID })
  assert.ok(merged.quality.every((q) => q === 255))
})
