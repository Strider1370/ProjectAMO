import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectThresholds } from './taf-risk.js'
import { findWorsening, findTailRisk } from './taf-change.js'

const T = collectThresholds({
  taf_adverse_weather: { params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { params: { speed_threshold: 25, gust_threshold: 35 } },
})

const NOW = new Date('2026-07-28T12:00:00Z')

const slot = (hour, over = {}) => ({
  time: `2026-07-28T${String(hour).padStart(2, '0')}:00:00Z`,
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

const taf = (issued, start, end, timeline, status = 'NORMAL') => ({
  header: { issued, valid_start: start, valid_end: end, report_status: status },
  timeline,
})

const DAY = '2026-07-28'
const at = (h) => `${DAY}T${String(h).padStart(2, '0')}:00:00Z`

test('안 위험하던 시각이 위험해지면 악화다 (규칙 ①)', () => {
  const prev = taf('a', at(6), at(20), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'visibility')
  assert.equal(out[0].rule, 'new')
  assert.equal(out[0].to, 1500)
  assert.equal(out[0].time, at(14))
})

test('위험하던 시각이 500m 미만으로 내려가면 악화다 (규칙 ②)', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 400, cavok: false } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule, 'worse')
  assert.equal(out[0].from, 1500)
  assert.equal(out[0].to, 400)
})

test('위험하지만 경계를 새로 넘지 않으면 악화가 아니다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 2500, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [],
    '값이 조금 나빠진 것까지 잡으면 소음이 된다')
})

test('운고가 200ft 미만으로 내려가면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { clouds: [{ amount: 'OVC', base: 400 }] })])
  const next = taf('b', at(12), at(20), [slot(14, { clouds: [{ amount: 'OVC', base: 100 }] })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'ceiling')
  assert.equal(out[0].rule, 'worse')
})

test('거스트가 50kt 이상으로 올라가면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { wind: { speed: 12, gust: 40 } })])
  const next = taf('b', at(12), at(20), [slot(14, { wind: { speed: 12, gust: 55 } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'wind')
  assert.equal(out[0].rule, 'worse')
})

test('TS가 새로 등장하면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { weather: [{ raw: 'FG', descriptor: '', phenomena: ['FG'] }] })])
  const next = taf('b', at(12), at(20), [slot(14, { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'weather')
  assert.equal(out[0].rule, 'worse')
})

test('위험이 줄어들면 발동하지 않는다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 800, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14)])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('현재 시각 이전은 보지 않는다', () => {
  const prev = taf('a', at(6), at(20), [slot(9)])
  const next = taf('b', at(6), at(20), [slot(9, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [],
    '이미 지난 시각의 예보 변화는 알릴 것이 없다')
})

test('유효기간이 겹치지 않으면 악화 판정을 생략한다', () => {
  const prev = taf('a', at(6), at(11), [slot(9)])
  const next = taf('b', at(13), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('시정·운고·바람이 동시에 악화하면 항목이 셋이다', () => {
  const prev = taf('a', at(6), at(20), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, {
    visibility: { value: 1500, cavok: false },
    clouds: [{ amount: 'OVC', base: 300 }],
    wind: { speed: 30 },
  })])

  const out = findWorsening(prev, next, T, NOW)
  assert.deepEqual(out.map((a) => a.field).sort(), ['ceiling', 'visibility', 'wind'])
})

test('previous가 없으면 빈 배열', () => {
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])
  assert.deepEqual(findWorsening(null, next, T, NOW), [])
})

test('이전 시간표에 없는 시각은 악화로 세지 않는다', () => {
  // 짝이 없으면 비교할 수 없다. 신규로 단정하면 격자가 어긋난 발표에서
  // 시간표 전체가 가짜 악화가 된다.
  const prev = taf('a', at(6), at(20), [slot(15)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('이전 TAF의 valid_end 시각 칸은 악화로 세지 않는다', () => {
  // 파서의 hourRange가 `cursor < end`라 이전 TAF에는 valid_end 칸이 없다.
  // 겹침 끝을 포함으로 두면 정규 발표마다 가짜 악화가 1건씩 난다.
  const prev = taf('a', at(6), at(18), [slot(14), slot(17)])
  const next = taf('b', at(12), at(23), [slot(14), slot(17), slot(18, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('꼬리 구간과 악화 구간이 같은 칸을 두 번 세지 않는다', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(18, { visibility: { value: 500, cavok: false } })])

  const worsened = findWorsening(prev, next, T, NOW)
  const tail = findTailRisk(prev, next, T, NOW)
  const overlap = worsened.filter((w) => tail.some((r) => r.time === w.time))
  assert.deepEqual(overlap, [], '한 칸이 두 알람에 동시에 실리면 안 된다')
})

test('꼬리 구간에 위험이 있으면 잡는다', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(21, { visibility: { value: 1000, cavok: false } })])

  const out = findTailRisk(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].time, at(21))
  assert.equal(out[0].field, 'visibility')
})

test('꼬리 구간이 없으면 빈 배열', () => {
  const prev = taf('a', at(6), at(23), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findTailRisk(prev, next, T, NOW), [])
})

test('꼬리 구간이 있어도 위험이 없으면 빈 배열', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(21)])

  assert.deepEqual(findTailRisk(prev, next, T, NOW), [])
})
