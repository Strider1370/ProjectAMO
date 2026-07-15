import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfidenceWarnings } from '../src/briefing/confidence.js'

// 스펙: docs/superpowers/specs/2026-07-15-briefing-confidence-warnings.md §5
// code/severity로 검사한다(문구 label은 편의용이라 검사하지 않음 — 문구가 바뀌어도 안 깨지게).

const NOW = Date.parse('2026-06-26T15:00:00Z')
const request = { departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: 'RKPK', etd: '2026-06-26T14:00:00Z' }

// summarizeAirport가 내는 최소 shape.
const airport = (role, icao, over = {}) => ({ role, icao, category: 'VFR', observationTime: null, reportType: 'METAR', ...over })
const okAirports = () => [airport('departure', 'RKSI'), airport('arrival', 'RKPC'), airport('alternate', 'RKPK')]
const coveringDest = { category: 'IFR' } // ETA를 덮는 TAF
const arrivalTaf = { header: { icao: 'RKPC' }, timeline: [{ time: '2026-06-26T15:00:00Z' }] }

const codesOf = (w) => w.map((x) => x.code)

test('도착 공항 METAR 없음 → error/METAR_MISSING 1건', () => {
  const airports = [airport('departure', 'RKSI'), airport('arrival', 'RKPC', { category: 'UNKNOWN' }), airport('alternate', 'RKPK')]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  const missing = w.filter((x) => x.code === 'METAR_MISSING')
  assert.equal(missing.length, 1)
  assert.equal(missing[0].severity, 'error')
  assert.equal(missing[0].scope.icao, 'RKPC')
})

test('배너 판정은 불변 — 이 모듈은 category를 바꾸지 않는다', () => {
  // 신뢰도 경고는 판정(색)과 완전히 분리된 축임을 계약으로 고정.
  const airports = [airport('departure', 'RKSI'), airport('arrival', 'RKPC', { category: 'UNKNOWN' }), airport('alternate', 'RKPK')]
  const before = airports.map((a) => a.category).join(',')
  buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  assert.equal(airports.map((a) => a.category).join(','), before)
})

test('METAR가 90분 전 → warning/METAR_STALE 1건', () => {
  const airports = [airport('departure', 'RKSI', { observationTime: '2026-06-26T13:30:00Z' }), airport('arrival', 'RKPC'), airport('alternate', 'RKPK')]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  const stale = w.filter((x) => x.code === 'METAR_STALE')
  assert.equal(stale.length, 1)
  assert.equal(stale[0].severity, 'warning')
})

test('METAR가 30분 전(METAR) → 경고 없음', () => {
  const airports = [airport('departure', 'RKSI', { observationTime: '2026-06-26T14:30:00Z' }), airport('arrival', 'RKPC'), airport('alternate', 'RKPK')]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  assert.equal(w.filter((x) => x.code === 'METAR_STALE').length, 0)
})

test('SPECI가 40분 전 → METAR_STALE (SPECI 임계 30분)', () => {
  const airports = [airport('departure', 'RKSI', { observationTime: '2026-06-26T14:20:00Z', reportType: 'SPECI' }), airport('arrival', 'RKPC'), airport('alternate', 'RKPK')]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  assert.equal(w.filter((x) => x.code === 'METAR_STALE').length, 1)
})

test('TAF 존재하나 ETA 미포함 → TAF_NOT_COVERING_ETA (TAF_MISSING 아님)', () => {
  const w = buildConfidenceWarnings({ airports: okAirports(), destination: { category: null }, arrivalTaf, request, now: NOW })
  assert.deepEqual(codesOf(w), ['TAF_NOT_COVERING_ETA'])
})

test('TAF payload 자체 없음 → TAF_MISSING (TAF_NOT_COVERING_ETA 아님)', () => {
  const w = buildConfidenceWarnings({ airports: okAirports(), destination: { category: null }, arrivalTaf: null, request, now: NOW })
  assert.deepEqual(codesOf(w), ['TAF_MISSING'])
})

test('모든 자료 정상·최신 → 빈 배열', () => {
  const airports = okAirports().map((a) => ({ ...a, observationTime: '2026-06-26T14:45:00Z' }))
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  assert.deepEqual(w, [])
})

test('교체공항 METAR 없음 → severity:warning (출발·도착이면 error인 것과 대비)', () => {
  const airports = [airport('departure', 'RKSI'), airport('arrival', 'RKPC'), airport('alternate', 'RKPK', { category: 'UNKNOWN' })]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  const missing = w.find((x) => x.code === 'METAR_MISSING')
  assert.equal(missing.severity, 'warning')
})

test('정렬: error가 warning보다 먼저', () => {
  const airports = [
    airport('departure', 'RKSI', { observationTime: '2026-06-26T13:00:00Z' }), // stale = warning
    airport('arrival', 'RKPC', { category: 'UNKNOWN' }), // missing = error
    airport('alternate', 'RKPK'),
  ]
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request, now: NOW })
  assert.equal(w[0].severity, 'error')
})

test('now 미주입이어도 터지지 않는다(낡음 판정만 생략)', () => {
  const airports = okAirports().map((a) => ({ ...a, observationTime: '2026-06-26T10:00:00Z' }))
  const w = buildConfidenceWarnings({ airports, destination: coveringDest, arrivalTaf, request })
  assert.equal(w.filter((x) => x.code === 'METAR_STALE').length, 0)
})
