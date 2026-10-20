import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEnrouteConvection } from '../src/briefing/enroute-convection.js'
import { ACI_MISSING } from '../../shared/aci.js'

// 3x1 격자(경도 120·121·122, 위도 35). 점수 0.2 / 0.6 / 0.8 (×10000 저장).
const grid = { nx: 3, ny: 2, lonMin: 120, lonMax: 122, latMin: 35, latMax: 36 }
const field = (scores) => ({ grid, score: [...scores, ACI_MISSING, ACI_MISSING, ACI_MISSING] })
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

test('splits ACI score into MOD (>=0.5) and SEV (>=0.75) intervals at the time nearest ETD', () => {
  const seen = []
  const result = buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T02:10:00Z', ...read([2000, 6000, 8000], seen) })
  assert.equal(seen[0].hf, 3)
  assert.equal(result.status, 'found')
  assert.deepEqual(result.intervals, [{ startNm: 10, endNm: 20, level: '심' }])
  assert.equal(result.run.validTime, '2026-10-20T03:00:00Z')
})

test('none when below threshold, unavailable when missing, outside or unreadable', () => {
  assert.equal(buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([1000, 2000, 4000]) }).status, 'none')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, etd: '2026-10-20T00:00:00Z', ...read([ACI_MISSING, ACI_MISSING, ACI_MISSING]) }).status, 'unavailable')
  const outside = { samples: [{ distanceNm: 0, lon: 130, lat: 40 }] }
  assert.equal(buildEnrouteConvection({ root: '/data', axis: outside, etd: '2026-10-20T00:00:00Z', ...read([9000, 9000, 9000]) }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, readIndex: () => null }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: '/data', axis, readIndex: () => ({ times }), readField: () => { throw new Error('corrupt') } }).status, 'unavailable')
  assert.equal(buildEnrouteConvection({ root: null, axis }).status, 'unavailable')
})
