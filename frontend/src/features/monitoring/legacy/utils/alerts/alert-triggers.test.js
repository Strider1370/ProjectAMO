import { test } from 'node:test'
import assert from 'node:assert/strict'

import triggers from './alert-triggers.js'

const byId = (id) => triggers.find((t) => t.id === id)

test('트리거는 6종이고 공항경보는 없다', () => {
  assert.equal(triggers.length, 6)
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
