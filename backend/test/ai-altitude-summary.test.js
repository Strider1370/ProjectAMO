import test from 'node:test'
import assert from 'node:assert/strict'
import { altitudeComparisonSummary } from '../src/ai/digests/altitude-summary.js'
import { modelToolResult } from '../src/ai/model-context.js'

const exposure = (byGrade) => ({ summary: { status: 'available', highestGrade: Math.max(...Object.keys(byGrade).map(Number)), exposureNmByGrade: byGrade } })
const row = (altitudeFt, icing, turbulence, wind, extra = {}) => ({ altitudeFt, status: 'valid', label: `FL${altitudeFt / 100}`, weatherStatus: 'available',
  profileStatus: 'applied', wind, icing: exposure(icing), turbulence: exposure(turbulence),
  hazards: { items: [], total: 0 }, notams: { items: [], total: 2 }, ...extra })
// Production KIM run 2026092618 hf12, 김포→제주 Y711 (rounded).
const rows = [
  row(22000, { 0: 286, 1: 19.84 }, { 0: 287, 1: 10.26, 2: 13.94 }, { averageKt: -3, minKt: -54, maxKt: 64, directionDeg: 266, speedKt: 54 }),
  row(24000, { 0: 286, 1: 24.84 }, { 0: 287, 1: 10.26, 2: 13.94 }, { averageKt: -8, minKt: -58, maxKt: 63, directionDeg: 260, speedKt: 57 }),
  row(28000, { 0: 286, 1: 21.73 }, { 0: 287, 1: 10.26, 2: 13.94 }, { averageKt: -8, minKt: -60, maxKt: 57, directionDeg: 261, speedKt: 65 }),
]

test('code states per-hazard differences, identical exposures once, and a neutral wind range', () => {
  const s = altitudeComparisonSummary({ rows, modelTimeCoverage: { status: 'within_available_frames' } }, { crossSectionRun: { tmfc: '2026092618', hf: 12 } })
  assert.deepEqual(s.착빙.perAltitude, ['FL220: LIGHT 20NM', 'FL240: LIGHT 25NM', 'FL280: LIGHT 22NM'])
  assert.equal(s.착빙.comparison, 'FL220이 가장 짧음(20NM), FL240보다 5NM 짧음')
  assert.equal(s.난류.comparison, '모든 고도 같음(MODERATE 14NM, LIGHT 10NM)')
  assert.equal(s.바람.comparison, '항로 방향 평균 바람: FL220 맞바람 3kt ~ FL240·FL280 맞바람 8kt')
  assert.equal(s.statusForAll, '공시 항로고도와 일치')
  assert.deepEqual(s.notams, ['모든 고도: 경로 관련 NOTAM 2건'])
  assert.equal(s.gaps, undefined)
  assert.equal(s.advisories, '겹치는 SIGMET·AIRMET 없음')
})

test('invalid or weatherless altitudes are listed with their status and gaps, never compared', () => {
  const s = altitudeComparisonSummary({ rows: [
    { altitudeFt: 25000, status: 'input_invalid', label: 'FL250', weatherStatus: 'unavailable' },
    row(24000, { 0: 290, 1: 20 }, { 0: 300 }, { averageKt: 5, minKt: -10, maxKt: 20, directionDeg: 250, speedKt: 30 }, { profileStatus: 'cruise_fallback' }),
    { altitudeFt: 29000, status: 'input_only', label: 'FL290', weatherStatus: 'weather_unavailable', profileStatus: 'applied' },
  ], modelTimeCoverage: { status: 'outside_available_frames' } })
  assert.deepEqual(s.altitudes.map((a) => [a.altitude, a.status]), [
    ['FL250', '공시 항로고도 아님, 기상 비교 제외'], ['FL240', '공시 항로고도와 일치'], ['FL290', '공시 항로고도와 대조 안 됨']])
  assert.equal(s.착빙.comparison, '비교할 고도가 하나뿐')
  assert.equal(s.난류.perAltitude[0], 'FL240: 없음')
  assert.deepEqual(s.gaps, ['모델 예보 시각이 비행 시간을 모두 덮지 않음', 'FL290 기상 자료 없음', '일부 고도는 상승·강하 없이 순항고도만 적용'])
})

test('app altitude results give the model the summary instead of raw rows', () => {
  const result = { schemaVersion: '1', status: 'partial', reference: { briefingRef: 'b1', crossSectionRun: { tmfc: '2026092618', hf: 12, validTime: '2026-09-27T06:00:00Z' } },
    issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED' }, { code: 'AIP_INCOMPLETE' }], data: { rows, detailSections: ['altitudes'] } }
  const projected = modelToolResult('compare_route_altitudes', result, 'Asia/Seoul')
  assert.equal(projected.data.rows, undefined)
  assert.equal(projected.data.summary.착빙.comparison, 'FL220이 가장 짧음(20NM), FL240보다 5NM 짧음')
  assert.equal(projected.data.summary.modelRun.validTime, '2026-09-27 15:00:00 KST')
  assert.equal(projected.reference.briefingRef, 'b1')
  assert.deepEqual(projected.issues.map((i) => i.code), ['AIP_INCOMPLETE'])
})
