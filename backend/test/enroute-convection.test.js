import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEnrouteConvection } from '../src/briefing/enroute-convection.js'

// 3x1 격자(경도 120·121·122, 위도 35). 값은 ACIM 예상 운정고도(FL).
const grid = { nx: 3, ny: 2, lonMin: 120, lonMax: 122, latMin: 35, latMax: 36 }
// 찬 운정(OLR 150)·대류성 강수(1 mm)로 표시 조건을 만족시킨다. 가을(SON) 기준.
const field = (tops, { olr = 150, precc = 1 } = {}) => ({ grid, season: 'SON', topFl: [...tops, null, null, null], olr: Array(6).fill(olr), precc: Array(6).fill(precc) })
const axis = { samples: [
  { distanceNm: 0, lon: 120, lat: 35 },
  { distanceNm: 10, lon: 121, lat: 35 },
  { distanceNm: 20, lon: 122, lat: 35 },
] }
const times = [
  { tmfc: '2026102000', hf: 0, validTime: '2026-10-20T00:00:00Z', revision: 'a' },
  { tmfc: '2026102000', hf: 3, validTime: '2026-10-20T03:00:00Z', revision: 'a' },
]
const read = (scores, seen = []) => ({
  readIndex: () => ({ times }),
  readField: (selection) => { seen.push(selection); return field(scores) },
})

test('splits ACIM into actual cloud-top FL bands at the time nearest ETD', () => {
  const seen = []
  const result = buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T02:10:00Z', ...read([150, 250, 300], seen) })
  assert.equal(seen[0].hf, 3)
  assert.equal(result.status, 'found')
  assert.deepEqual(result.intervals, [{ startNm: 5, endNm: 15, topFl: 250 }, { startNm: 15, endNm: 20, topFl: 300 }])
  assert.equal(result.run.validTime, '2026-10-20T03:00:00Z')
})

test('preserves FL250 and FL275 as separate bands and never fills missing samples', () => {
  const result = buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([250, null, 275]) })
  assert.deepEqual(result.intervals, [{ startNm: 0, endNm: 5, topFl: 250 }, { startNm: 15, endNm: 20, topFl: 275 }])
})

test('none when below threshold, unavailable when missing, outside or unreadable', () => {
  assert.equal(buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([0, 100, 175]) }).status, 'none')
  // FL225는 지도에 칠하지 않으므로 경로 막대에도 없다.
  assert.equal(buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([225, 225, 225]) }).status, 'none')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([null, null, null]) }).status, 'unavailable')
  const outside = { samples: [{ distanceNm: 0, lon: 130, lat: 40 }] }
  assert.equal(buildEnrouteConvection({ root: '/data', axis: outside, etd: '2026-10-20T00:00:00Z', ...read([350, 350, 350]) }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, readIndex: () => null }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, readIndex: () => ({ times }), readField: () => { throw new Error('corrupt') } }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: null, axis }).status, 'unavailable')
})
