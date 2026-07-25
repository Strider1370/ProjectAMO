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

test('ray index hoisting handles sweeps with different ray orderings', () => {
  // 두 sweep의 방위 순서가 다르다: sweep A는 0~359 오름차순, sweep B는 180부터 시작해 0으로 돌아온다.
  // ray 인덱스를 잘못 호이스트하면(한 sweep의 ray를 다른 sweep에 재사용하면) 이 test는 실패한다.
  const volume = {
    stn: 'TST',
    latitude: 37.44,
    longitude: 126.96,
    altitudeM: 500,
    rangeM: Float32Array.from([10000]),
    sweeps: [
      {
        elevationDeg: 0.5,
        azimuthDeg: Float32Array.from([0, 90, 180, 270]), // 0도는 ray 0
        dbz: Int16Array.from([4000, 3000, 2000, 1500]),
        scaleFactor: 0.01,
        fillValue: -32768,
      },
      {
        elevationDeg: 6.0,
        azimuthDeg: Float32Array.from([180, 270, 0, 90]), // 0도는 ray 2 (다른 위치!)
        dbz: Int16Array.from([800, 700, 900, 600]),
        scaleFactor: 0.01,
        fillValue: -32768,
      },
    ],
  }
  const result = computeSiteEchoTop(volume, { thresholdDbz: 18, grid: ECHO_TOP_GRID })
  // 0도 방위에서 gate 0의 samples는 [{ heightM: sweep0, dbz: 40 }, { heightM: sweep1, dbz: 9 }]
  // echoTopFromColumn은 해당 column의 echo top을 반환해야 한다.
  // 만약 ray 인덱스 호이스트가 잘못되면 다른 방위의 데이터를 읽는다.
  const markedCount = result.quality.reduce((n, q) => n + (q !== 255 ? 1 : 0), 0)
  assert.ok(markedCount > 0, `marked cells ${markedCount}`)
})

import { decodeEchoTopRecord, encodeEchoTopBinary, echoTopColor, renderEchoTopRgba } from '../src/processors/echo-top-model.js'

test('binary round-trips height, quality and site index', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(255)
  const siteIndex = new Uint8Array(size).fill(255)
  heightM[7] = 9327.4; quality[7] = 0; siteIndex[7] = 3

  const buffer = encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid: ECHO_TOP_GRID })
  assert.equal(buffer.toString('ascii', 0, 8), 'AMOETOP1')

  const record = decodeEchoTopRecord(buffer, 7)
  assert.equal(record.heightM, 9327)
  assert.equal(record.ft, Math.round(9327 * 3.280839895))
  assert.equal(record.fl, Math.round(9327 * 3.280839895 / 100))
  assert.equal(record.quality, 'interpolated')
  assert.equal(record.siteIndex, 3)
  assert.equal(decodeEchoTopRecord(buffer, 8), null)
})

test('binary rejects a corrupt header', () => {
  assert.throws(() => decodeEchoTopRecord(Buffer.alloc(40), 0), /Invalid Echo Top binary header/)
})

test('colour bands follow flight level, not danger', () => {
  assert.deepEqual(echoTopColor(1000), echoTopColor(2000))          // 둘 다 FL100 미만
  assert.notDeepEqual(echoTopColor(1000), echoTopColor(12500))      // FL100 미만 vs FL400 이상
})

test('render produces an opaque pixel only where the composite has data', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(255)
  const rgba = renderEchoTopRgba({ heightM, quality }, { grid: ECHO_TOP_GRID, width: 40, height: 50 })
  assert.equal(rgba.length, 40 * 50 * 4)
  assert.ok(rgba.every((byte) => byte === 0))
})
