import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildTafTacLines, buildTafViewModel, formatTafHour, groupTafSlots } from './tafViewModel.js'

function futureSlot(offsetHours, weather, overrides = {}) {
  return {
    time: new Date(Date.now() + offsetHours * 3600 * 1000).toISOString(),
    display: { weather, visibility: '9999' },
    visibility: { value: 9999 },
    wind: { direction: 180, speed: 8, unit: 'KT' },
    clouds: [{ amount: 'BKN', base: 2500 }],
    ...overrides,
  }
}

describe('airport TAF view model weather highlighting', () => {
  it('highlights typed visibility without matching wind or RVR digits', () => {
    const time = '2026-07-18T15:00:00Z'
    const text = 'TAF RKJB 181400Z 1815/1915 28003KT 800 R19/0300N RA BKN003'
    const tokens = text.split(/(\s+)/).filter(Boolean).map((value) => ({ text: value, role: /^\s+$/.test(value) ? 'separator' : value === '28003KT' ? 'wind' : value === '800' ? 'visibility' : value === 'RA' ? 'weather-precip' : value === 'BKN003' ? 'ceiling' : value.startsWith('R19/') ? 'rvr' : 'plain' }))
    const taf = { header: { raw_text: text, tac: { display_lines: [{ text, slot_time: time, tokens }] } }, timeline: [{ time, visibility: { value: 800 }, wind: { direction: 280, speed: 3, unit: 'KT' }, weather: [{ raw: 'RA' }], display: { weather: 'RA' }, clouds: [{ amount: 'BKN', base: 300 }] }] }
    const highlighted = buildTafTacLines(taf, 'RKJB')[0].segments.filter((segment) => segment.className).map((segment) => segment.text)
    assert.deepEqual(highlighted, ['800', 'RA', 'BKN003'])
    assert.equal(buildTafTacLines(taf, 'RKJB')[0].segments.find((segment) => segment.text === '28003KT')?.className, undefined)
    assert.equal(buildTafTacLines(taf, 'RKJB')[0].segments.find((segment) => segment.text === 'R19/0300N')?.className, undefined)
  })
  it('exposes precipitation and special-weather flags per slot', () => {
    const taf = {
      header: { valid_start: '2026-05-21T06:00:00Z', valid_end: '2026-05-22T12:00:00Z' },
      timeline: [
        futureSlot(2, 'RA'),
        futureSlot(3, 'FG'),
        futureSlot(4, 'NSW'),
      ],
    }

    const model = buildTafViewModel(taf, 'RKSI')

    assert.deepEqual(model.slots.map((slot) => slot.hasPrecipitation), [true, false, false])
    assert.deepEqual(model.slots.map((slot) => slot.isSpecialWeather), [false, true, false])
  })

  it('keeps contiguous group width calculation unchanged', () => {
    const groups = groupTafSlots(
      [{ key: 'A' }, { key: 'A' }, { key: 'B' }, { key: 'A' }],
      (item) => item.key,
    )

    assert.deepEqual(groups.map((group) => group.key), ['A', 'B', 'A'])
    assert.deepEqual(groups.map((group) => group.width), ['50%', '25%', '25%'])
  })

  it('formats invalid TAF hour safely', () => {
    assert.equal(formatTafHour('bad-date'), '--')
  })
})
