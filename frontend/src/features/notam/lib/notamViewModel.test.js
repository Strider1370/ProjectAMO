import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTimeState, formatAltitude, formatAltitudeBand, formatValidPeriod, notamSummary, sortActiveFirst, NOTAM_CATEGORIES } from './notamViewModel.js'

const SOON = 2 * 60 * 60 * 1000

test('deriveTimeState: active when now within [from,to]', () => {
  const from = Date.parse('2026-07-03T00:00:00Z')
  const to = Date.parse('2026-07-03T12:00:00Z')
  assert.equal(deriveTimeState(from, to, Date.parse('2026-07-03T06:00:00Z'), SOON), 'active')
})

test('deriveTimeState: soon when from within soon window', () => {
  const from = Date.parse('2026-07-03T06:00:00Z')
  const to = Date.parse('2026-07-03T12:00:00Z')
  const now = Date.parse('2026-07-03T05:00:00Z') // 1h before from, inside 2h window
  assert.equal(deriveTimeState(from, to, now, SOON), 'soon')
})

test('deriveTimeState: upcoming when from beyond soon window', () => {
  const from = Date.parse('2026-07-03T12:00:00Z')
  const to = Date.parse('2026-07-03T18:00:00Z')
  const now = Date.parse('2026-07-03T06:00:00Z') // 6h before
  assert.equal(deriveTimeState(from, to, now, SOON), 'upcoming')
})

test('formatAltitude: SFC to unlimited FL → 전고도', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 999, unit: 'FL', ref: null }), '전고도')
})

test('formatAltitude: FT band keeps AGL/AMSL label', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 4920, unit: 'FT', ref: 'AGL' }), 'SFC–4,920FT AGL')
  assert.equal(formatAltitude({ lower: 4000, upper: 6000, unit: 'FT', ref: 'AMSL' }), '4,000–6,000FT AMSL')
})

test('formatAltitude: FT band with null ref → no trailing label', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 4920, unit: 'FT', ref: null }), 'SFC–4,920FT')
})

test('formatAltitude: FL band', () => {
  assert.equal(formatAltitude({ lower: 100, upper: 200, unit: 'FL', ref: null }), 'FL100–FL200')
})

test('formatAltitude: 저고도 FL은 ft로 환산(장애물 등)', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 5, unit: 'FL', ref: null }), 'SFC–500FT')
  assert.equal(formatAltitude({ lower: 10, upper: 30, unit: 'FL', ref: null }), '1,000FT–3,000FT')
})

test('formatAltitude: null → empty', () => {
  assert.equal(formatAltitude(null), '')
})

test('formatAltitudeBand: 지도 라벨 차트식(상한/수평선/하한, 기준면 라벨 없음)', () => {
  assert.equal(formatAltitudeBand({ lower: 0, upper: 4920, unit: 'FT', ref: 'AGL' }), '4,920\n───\nSFC')
  assert.equal(formatAltitudeBand({ lower: 0, upper: 999, unit: 'FL', ref: null }), '전고도') // 목록/탭과 통일
  assert.equal(formatAltitudeBand({ lower: 0, upper: 5, unit: 'FL', ref: null }), '500FT\n───\nSFC') // 저고도 ft
  assert.equal(formatAltitudeBand({ lower: 60, upper: 120, unit: 'FL', ref: null }), 'FL120\n───\nFL60')
  assert.equal(formatAltitudeBand(null), '')
})

test('formatValidPeriod: B~C in KST MM/DD HH:MM + tz suffix', () => {
  // 2026-07-03T00:00Z = 07-03 09:00 KST, 2026-07-08T16:00Z = 07-09 01:00 KST
  assert.equal(formatValidPeriod('2026-07-03T00:00:00Z', '2026-07-08T16:00:00Z', 'KST'), '07/03 09:00 ~ 07/09 01:00 KST')
  assert.equal(formatValidPeriod('2026-07-03T00:00:00Z', '2026-07-08T16:00:00Z', 'UTC'), '07/03 00:00 ~ 07/08 16:00 Z')
  assert.equal(formatValidPeriod('bad', 'bad'), '— ~ — KST')
})

test('notamSummary: 실제 NOTAM 유형별 한글 요약', () => {
  assert.equal(notamSummary({ category: 'danger', summary: 'TEMPO DANGER AREA ACT AS FLW A CIRCLE RADIUS 1NM CENTERED ON 373715N1290312E RMK:THIS AREA IS ESTABLISHED FOR DRONE FLIGHT' }),
    '임시 위험구역 · 반경 1NM · 드론')
  assert.equal(notamSummary({ category: 'restricted', summary: 'TEMPO RESTRICTED AREA ACT AS FLW AREA BOUNDED BY THE FOLLOWING 331000N1243005E-331002N1254558E' }),
    '임시 제한구역 · 다각형')
  assert.equal(notamSummary({ category: 'facility', summary: 'GPS RAIM OUTAGES PREDICTED FOR NPA' }), 'GPS 신호 예측불가(NPA)')
  assert.equal(notamSummary({ category: 'obstacle', summary: 'TEMP OBST(CRANES) ERECTED AS FLW : 1.PSN:345817N... 2.PSN:345818N...' }), '임시 크레인 2기')
  assert.equal(notamSummary({ category: 'facility', summary: 'RWY 01/19 CLSD DUE TO WIP RMK : 1. EXC ...' }), '활주로 01/19 폐쇄(공사)')
  assert.equal(notamSummary({ category: 'facility', summary: 'DEP FREQ 124.700MHZ NOT AVBL DUE TO FREQ INTERFERENCE USE ALTN FREQ 120.475MHZ' }), '주파수 124.700MHz 불가 → 120.475')
  assert.equal(notamSummary({ summary: '' }), '')
})

// 'moa'는 정적 공역 데이터(airspace-zones.js)에서만 오는 카테고리 — 제한 계열 바로 뒤, 정보성 앞에 둔다.
test('NOTAM_CATEGORIES: 8 categories in mockup order', () => {
  assert.deepEqual(NOTAM_CATEGORIES.map((c) => c.id),
    ['prohibited', 'firing', 'danger', 'restricted', 'moa', 'obstacle', 'facility', 'other'])
})

test('sortActiveFirst: active before soon before upcoming', () => {
  const now = Date.parse('2026-07-03T06:00:00Z')
  const mk = (id, from, to) => ({ id, valid_from: from, valid_to: to })
  const items = [
    mk('up', '2026-07-03T12:00:00Z', '2026-07-03T18:00:00Z'),   // upcoming
    mk('act', '2026-07-03T00:00:00Z', '2026-07-03T12:00:00Z'),  // active
    mk('soon', '2026-07-03T07:00:00Z', '2026-07-03T09:00:00Z'), // soon
  ]
  assert.deepEqual(sortActiveFirst(items, now).map((i) => i.id), ['act', 'soon', 'up'])
})
