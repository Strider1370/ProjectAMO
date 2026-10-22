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
