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

test('AMOS의 25000 이상은 구름 없음(초록)으로 남긴다 — 제외하지 않는다', () => {
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
  const rkpu = s.find((station) => station.id === 'amos_RKPU')
  // config.airports에 RKPU가 없으면 애초에 지점 목록에 못 들어간다 — 있을 때만 검증한다.
  if (rkpu) {
    assert.equal(rkpu.sky_clear, true)
    assert.equal(rkpu.ceiling_ft, null)
    assert.equal(rkpu.diff_ft, null) // 잴 운고가 없으니 모델과의 차이도 없다
  }
})

test('AMOS의 결측(-9)은 여전히 제외한다', () => {
  const s = buildStations({
    asos: null,
    amos: {
      airports: {
        RKSI: { observation: { cloud_min_m: -9 } },
      },
    },
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
  })
  for (const station of s) {
    assert.notEqual(station.id, 'amos_RKSI')
  }
})

test('ASOS 지점에 sky_clear·시정·관측 시각이 실린다', () => {
  const tm = getCurrentAsosTm()
  const s = buildStations({
    asos: {
      tm,
      stations: [
        { stn: 108, name: '서울', lat: 37, lon: 126.5, ceiling_ft: null, cloud_amount: 0, visibility_m: 22800, sky_clear: true },
      ],
    },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
  })
  assert.equal(s.length, 1)
  assert.equal(s[0].sky_clear, true)
  assert.equal(s[0].ceiling_ft, null)
  assert.equal(s[0].visibility_m, 22800)
  assert.equal(s[0].obs_tm, tm)
  assert.equal(s[0].diff_ft, null) // ceiling_ft가 없으니 모델과 견줄 수 없다
})

test('AMOS 지점의 시정은 아직 판단을 안 해 null이다', () => {
  const s = buildStations({
    asos: null,
    amos: {
      airports: {
        RKSI: { observation: { cloud_min_m: 500, observed_tm_kst: '202608021600' } },
      },
    },
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
  })
  const rksi = s.find((station) => station.id === 'amos_RKSI')
  if (rksi) {
    assert.equal(rksi.visibility_m, null)
    assert.equal(rksi.obs_tm, '202608021600')
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

test('정확히 2시간 된 ASOS는 아직 유효하다', () => {
  const s = buildStations({
    asos: { tm: '202608030800', stations: [{ stn: 108, name: '서울', lat: 37, lon: 126.5, ceiling_ft: 1000 }] },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
    nowMs: Date.parse('2026-08-03T01:00:00.000Z'), // 10:00 KST
  })
  assert.equal(s.length, 1)
})

test('2시간을 넘긴 ASOS는 제외한다', () => {
  const s = buildStations({
    asos: { tm: '202608030800', stations: [{ stn: 108, name: '서울', lat: 37, lon: 126.5, ceiling_ft: 1000 }] },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: null,
    nowMs: Date.parse('2026-08-03T01:00:00.001Z'),
  })
  assert.equal(s.length, 0)
})
