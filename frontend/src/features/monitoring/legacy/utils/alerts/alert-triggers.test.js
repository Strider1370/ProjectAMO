import { test } from 'node:test'
import assert from 'node:assert/strict'

import triggers from './alert-triggers.js'

const byId = (id) => triggers.find((t) => t.id === id)

test('트리거는 8종이고 공항경보는 없다', () => {
  assert.equal(triggers.length, 8)
  assert.equal(byId('warning_issued'), undefined)
})

test('low_visibility: 시정 칸을 강조 대상으로 낸다', () => {
  const result = byId('low_visibility').evaluate(
    { observation: { visibility: { value: 800 } } },
    null,
    { threshold: 1500 }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'visibility' })
})

test('low_ceiling: 운고 칸을 강조 대상으로 낸다', () => {
  const result = byId('low_ceiling').evaluate(
    { observation: { clouds: [{ amount: 'OVC', base: 300 }] } },
    null,
    { threshold: 500, amounts: ['BKN', 'OVC'] }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'ceiling' })
})

test('high_wind: 바람 칸을 강조 대상으로 낸다', () => {
  const result = byId('high_wind').evaluate(
    { observation: { wind: { speed: 30, raw: '27030KT' } } },
    null,
    { speed_threshold: 25, gust_threshold: 35 }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'wind' })
})

test('weather_phenomenon: 날씨 칸을 강조 대상으로 낸다', () => {
  const result = byId('weather_phenomenon').evaluate(
    { observation: { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] } },
    null,
    { phenomena: ['TS'] }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'weather' })
})

test('taf_adverse_weather: 걸린 시각들을 강조 대상으로 낸다', () => {
  const soon = new Date(Date.now() + 3600000).toISOString()
  const result = byId('taf_adverse_weather').evaluate(
    { timeline: [{ time: soon, visibility: { value: 1200 }, weather: [] }] },
    null,
    { lookahead_hours: 6, vis_threshold: 3000, phenomena: ['TS'] }
  )
  assert.equal(result.highlight.panel, 'taf')
  assert.deepEqual(result.highlight.fields, ['visibility'])
  assert.deepEqual(result.highlight.times, [soon])
})

test('lightning_detected: 최근접 거리에 맞는 구역을 낸다', () => {
  const evaluate = (zone) => byId('lightning_detected').evaluate(
    { strikes: [{ time: '2026-07-28T00:00:00Z', lon: 126, lat: 37, type: 'G', zone, distance_km: 5 }] },
    null,
    { min_count: 1, types: ['G', 'C'], zones: ['alert', 'danger', 'caution'] }
  )
  assert.deepEqual(evaluate('alert').highlight, { panel: 'map', zone: 'alert' })
  assert.deepEqual(evaluate('danger').highlight, { panel: 'map', zone: 'danger' })
  assert.deepEqual(evaluate('caution').highlight, { panel: 'map', zone: 'caution' })
})

// ── TAF 변화 알람 (계획 B) ─────────────────────────────────────────────

const ALL_TRIGGERS = {
  taf_adverse_weather: { params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { params: { speed_threshold: 25, gust_threshold: 35 } },
}

const future = (hours) => new Date(Date.now() + hours * 3600000).toISOString()

const tafSlot = (time, over = {}) => ({
  time,
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

const tafDoc = ({ issued, end, timeline, status = 'NORMAL', previous = undefined }) => ({
  header: {
    issued,
    valid_start: new Date(Date.now() - 3600000).toISOString(),
    valid_end: end,
    report_status: status,
  },
  timeline,
  previous,
})

test('taf_change: previous가 없으면 발동하지 않는다', () => {
  const doc = tafDoc({ issued: 'i2', end: future(12), timeline: [tafSlot(future(2), { visibility: { value: 500, cavok: false } })] })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_change: 안 위험하던 시각이 위험해지면 한 줄 낸다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(result.triggerId, 'taf_change')
  assert.equal(result.severity, 'warning')
  assert.equal(result.highlight.panel, 'taf')
  assert.deepEqual(result.highlight.times, [t])
})

test('taf_change: 여러 요소가 동시에 악화해도 한 건이다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false }, clouds: [{ amount: 'OVC', base: 300 }], wind: { speed: 30 } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(typeof result.title, 'string')
  assert.equal(result.data.length, 3, '세 요소가 본문에 나열되지만 알람은 한 건이다')
  assert.deepEqual(result.highlight.fields.sort(), ['ceiling', 'visibility', 'wind'])
})

test('taf_change: TS가 새로 생기면 critical이다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS).severity, 'critical')
})

test('taf_change: AMD + 악화면 심각도가 한 단계 오른다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'AMENDMENT',
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)
  assert.equal(result.severity, 'critical')
  assert.match(result.title, /AMD/)
})

test('taf_change: 정정(CORRECTION)도 AMD와 같이 취급한다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'CORRECTION',
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS).severity, 'critical')
})

test('taf_change: AMD인데 악화가 없으면 info 통지를 낸다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'AMENDMENT',
    timeline: [tafSlot(t)],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)
  assert.equal(result.severity, 'info')
  assert.deepEqual(result.highlight.times, [], '강조할 대상이 없다')
})

test('taf_change: 정규 발표인데 악화가 없으면 발동하지 않는다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t)],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_change: 취소 통보면 발동하지 않는다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'CANCELLATION', timeline: [],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t, { visibility: { value: 500, cavok: false } })] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_new_period: 꼬리 구간에 위험이 있으면 info로 낸다', () => {
  const tail = future(14)
  const doc = tafDoc({
    issued: 'i2', end: future(20),
    timeline: [tafSlot(tail, { visibility: { value: 1000, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [] },
  })
  const result = byId('taf_new_period').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(result.triggerId, 'taf_new_period')
  assert.equal(result.severity, 'info')
  assert.deepEqual(result.highlight.times, [tail])
})

test('taf_new_period: 꼬리 구간이 없으면 발동하지 않는다', () => {
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(future(2), { visibility: { value: 500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [] },
  })
  assert.equal(byId('taf_new_period').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('트리거는 이제 8종이다', () => {
  assert.equal(triggers.length, 8)
  assert.ok(byId('taf_change'))
  assert.ok(byId('taf_new_period'))
})
