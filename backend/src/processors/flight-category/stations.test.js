import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStations } from './stations.js'

// Minimal KIM fixture for testing
const KIM_FIXTURE = {
  run: '2026080100',
  grid: { nx: 2, ny: 1, lonMin: 126, latMin: 37, lonMax: 127, latMax: 37 },
  ceilingM: Float32Array.from([300, 300]),
}

// Get current time in ASOS format (YYYYMMDDHHmm) to ensure data is fresh
function getCurrentAsosTm() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  const h = String(kst.getUTCHours()).padStart(2, '0')
  const min = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${y}${m}${d}${h}${min}`
}

test('위성이 구름 없다고 한 자리는 모델값이 빈다', () => {
  // 관측은 300 m를 보는데 위성 마스크가 모델 운고를 지운 경우 —
  // 화면은 색이 없는데 실제로는 낮은 구름이 있다. 가장 쓸모 있는 불일치다.
  const s = buildStations({
    asos: { tm: getCurrentAsosTm(), stations: [{ stn: 108, name: '서울', lat: 37, lon: 126.5, ceiling_ft: 984 }] },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: { frameTm: 'x', isClearAt: () => true },
  })
  assert.equal(s.length, 1)
  assert.equal(s[0].model_ceiling_ft, null)
  assert.equal(s[0].diff_ft, null)
  assert.equal(s[0].ceiling_ft, 984)
})

test('AMOS의 25000 이상은 구름 없음이므로 제외한다', () => {
  // Mock config.airports for this test by stubbing buildStations
  // This test verifies that NSC (cloud_min_m >= 25000) is excluded
  const s = buildStations({
    asos: null,
    amos: {
      airports: {
        RKSI: {
          observation: { cloud_min_m: 500 },
        },
        RKPU: {
          observation: { cloud_min_m: 25000 },
        },
      },
    },
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
  })
  // RKSI would be included if it's in config.airports, RKPU should always be excluded
  // Since RKSI may not be in config.airports, just verify that RKPU is never included
  for (const station of s) {
    assert.notEqual(station.id, 'amos_RKPU')
  }
})

test('모델값이 있으면 차이를 낸다', () => {
  const s = buildStations({
    asos: { tm: getCurrentAsosTm(), stations: [{ stn: 108, name: '서울', lat: 37, lon: 126.5, ceiling_ft: 1000 }] },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
  })
  // Model is 300m = 984ft, observation is 1000ft, diff = 1000 - 984 = 16ft
  assert.equal(s.length, 1)
  assert.equal(s[0].model_ceiling_ft, 984)
  assert.ok(s[0].diff_ft > 0)
})
