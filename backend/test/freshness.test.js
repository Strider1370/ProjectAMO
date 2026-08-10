// backend/test/freshness.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judge, isQuiet } from '../src/admin/freshness.js'

const row = { normalMs: 300000, lateMs: 1200000, stoppedMs: 2400000, quiet: null }
const now = Date.parse('2026-08-10T10:00:00Z')

test('기준 미만이면 정상', () => {
  assert.equal(judge({ row, lastSuccessMs: now - 600000, nowMs: now }), 'ok')
})

test('지연 기준 이상이면 지연, 멈춤 기준 이상이면 멈춤', () => {
  assert.equal(judge({ row, lastSuccessMs: now - 1200000, nowMs: now }), 'late')
  assert.equal(judge({ row, lastSuccessMs: now - 2400000, nowMs: now }), 'stopped')
})

test('성공 기록이 없으면 never', () => {
  assert.equal(judge({ row, lastSuccessMs: null, nowMs: now }), 'never')
})

test('운항편은 새벽 00–04시 KST에 판정하지 않는다', () => {
  const quietRow = { ...row, quiet: { kind: 'hours', fromHourKst: 0, toHourKst: 4 } }
  // 2026-08-10T17:00:00Z = KST 02:00 → 쉬는 시간
  const kst2am = Date.parse('2026-08-10T17:00:00Z')
  assert.equal(judge({ row: quietRow, lastSuccessMs: kst2am - 99999999, nowMs: kst2am }), 'quiet')
  // KST 10:00 → 판정한다
  const kst10am = Date.parse('2026-08-10T01:00:00Z')
  assert.equal(judge({ row: quietRow, lastSuccessMs: kst10am - 99999999, nowMs: kst10am }), 'stopped')
})

test('위성 가시는 일몰~일출 사이에 판정하지 않는다', () => {
  const nightRow = { ...row, quiet: { kind: 'night' } }
  const sunset = Date.parse('2026-08-10T10:20:00Z')
  const sunrise = Date.parse('2026-08-10T20:30:00Z')
  const afterSunset = sunset + 3600000
  assert.equal(judge({ row: nightRow, lastSuccessMs: sunset, nowMs: afterSunset, sunsetMs: sunset, sunriseMs: sunrise }), 'quiet')
})

test('밤 정보가 없으면 night 규칙은 무시하고 평소대로 판정한다', () => {
  const nightRow = { ...row, quiet: { kind: 'night' } }
  assert.equal(judge({ row: nightRow, lastSuccessMs: now - 2400000, nowMs: now }), 'stopped')
})

test('isQuiet은 경계 시각을 포함/제외로 나눈다', () => {
  const q = { kind: 'hours', fromHourKst: 0, toHourKst: 4 }
  assert.equal(isQuiet(q, Date.parse('2026-08-09T15:00:00Z')), true)  // KST 00:00 포함
  assert.equal(isQuiet(q, Date.parse('2026-08-09T19:00:00Z')), false) // KST 04:00 제외
})
