import test from 'node:test'
import assert from 'node:assert/strict'
import { historyEntries, metarCategory } from './airportHistoryModel.js'

const metar = (vis, clouds = []) => ({ observation: { visibility: { value: vis }, clouds } })

test('METAR 비행등급: 시정 + BKN·OVC 최저 운고', () => {
  assert.equal(metarCategory(metar(9999)), 'VFR')
  assert.equal(metarCategory(metar(3000)), 'IFR')
  assert.equal(metarCategory(metar(9999, [{ amount: 'SCT', base: 500 }, { amount: 'BKN', base: 1200 }])), 'IFR')
  assert.equal(metarCategory({ observation: { visibility: { cavok: true } } }), 'VFR')
  assert.equal(metarCategory(null), null)
})

test('이력 줄: 과거 → 최신 순, 최신보다 새 보관본은 버리고 최신 칸을 맨 오른쪽에', () => {
  const items = [
    { key: 'c', time: '2026-10-22T11:00:00Z', kind: 'METAR', report: metar(9999) }, // 화면 최신과 같은 시각 → 버림
    { key: 'b', time: '2026-10-22T10:30:00Z', kind: 'SPECI', report: metar(3000) },
    { key: 'a', time: '2026-10-22T10:00:00Z', kind: 'METAR', report: metar(9999) },
  ]
  const entries = historyEntries('metar', items, { latest: metar(9999), latestTime: '2026-10-22T11:00:00Z' })
  assert.deepEqual(entries.map((e) => [e.key, e.kind, e.category, e.latest]), [
    ['a', 'METAR', 'VFR', false], ['b', 'SPECI', 'IFR', false], ['latest', 'METAR', 'VFR', true],
  ])
  assert.deepEqual(historyEntries('taf', [{ key: 'x', time: '2026-10-22T05:00:00Z', kind: 'TAF' }], { latest: {}, latestTime: '2026-10-22T11:00:00Z' }).map((e) => e.key), ['x', 'latest'])
})

test('인천 METAR는 최신 관측 기준 이전 2시간 경계까지 표시하고 다른 공항은 유지한다', () => {
  const latestTime = '2026-10-29T21:30:00+09:00'
  const items = ['18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'].map((time) => ({
    key: time, time: `2026-10-29T${time}:00+09:00`, kind: 'METAR', report: metar(9999),
  }))
  const options = { latest: metar(9999), latestTime }
  assert.deepEqual(historyEntries('metar', items, { ...options, icao: 'RKSI' }).map((entry) => entry.key),
    ['19:30', '20:00', '20:30', '21:00', 'latest'])
  assert.equal(historyEntries('metar', items, { ...options, icao: 'RKSS' }).length, 7)
  assert.equal(historyEntries('taf', items, { ...options, icao: 'RKSI' }).length, 7)
})

test('인천의 2시간 범위 안 SPECI는 보존하고 최신 시각이 없으면 이력을 임의로 버리지 않는다', () => {
  const items = [
    { key: 'old', time: '2026-10-29T10:29:59Z', kind: 'SPECI', report: metar(3000) },
    { key: 'speci', time: '2026-10-29T11:17:00Z', kind: 'SPECI', report: metar(3000) },
  ]
  const entries = historyEntries('metar', items, { icao: 'RKSI', latest: metar(9999), latestTime: '2026-10-29T12:30:00Z' })
  assert.deepEqual(entries.map((entry) => entry.key), ['speci', 'latest'])
  assert.equal(entries[0].category, 'IFR')
  assert.equal(historyEntries('metar', items, { icao: 'RKSI' }).length, 2)
})
