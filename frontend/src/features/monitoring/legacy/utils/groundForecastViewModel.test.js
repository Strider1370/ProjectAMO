import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTemperatureScale,
  forecastColumnCenter,
  formatGroundForecastMeta,
  nextGroundForecastView,
  precipitationBar,
  selectHourlyForecastSlots,
  selectWeeklyForecastDays,
} from './groundForecastViewModel.js'

test('hourly display keeps exactly eight three-hour positions', () => {
  const hourly = Array.from({ length: 24 }, (_, index) => ({
    date: index < 9 ? '20260810' : '20260811',
    time: `${String((15 + index) % 24).padStart(2, '0')}00`,
    temp: 24 + (index % 5),
    rainProb: index * 4,
  }))
  const slots = selectHourlyForecastSlots(hourly)
  assert.equal(slots.length, 8)
  assert.deepEqual(slots.map((slot) => slot?.time), ['1500', '1800', '2100', '0000', '0300', '0600', '0900', '1200'])
})

test('hourly display pads partial three-hour input with empty positions', () => {
  const slots = selectHourlyForecastSlots([{ time: '1500' }, { time: '1800' }])
  assert.deepEqual(slots, [{ time: '1500' }, { time: '1800' }, null, null, null, null, null, null])
})

test('weekly display excludes today and pads to six positions', () => {
  const today = { date: '2026-08-10', isToday: true }
  const tomorrow = { date: '2026-08-11', isToday: false }
  const nextDay = { date: '2026-08-12' }
  assert.deepEqual(
    selectWeeklyForecastDays([today, tomorrow, nextDay]),
    [tomorrow, nextDay, null, null, null, null],
  )
})

test('shared x scale returns one centre per column', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => forecastColumnCenter(index, { start: 80, end: 960, count: 8 })),
    [135, 245, 355, 465, 575, 685, 795, 905],
  )
})

test('temperature scale pads the data domain and handles a flat series', () => {
  const varied = createTemperatureScale([{ temp: 20 }, { temp: 24 }], { top: 120, bottom: 250 })
  assert.ok(varied(24) < varied(20))
  const flat = createTemperatureScale([{ temp: 22 }, { temp: 22 }], { top: 120, bottom: 250 })
  assert.equal(flat(22), 185)
})

test('precipitation bars clamp to the 0-100 percent band', () => {
  assert.deepEqual(precipitationBar(0, { top: 290, bottom: 370 }), { value: 0, y: 370, height: 0 })
  assert.deepEqual(precipitationBar(50, { top: 290, bottom: 370 }), { value: 50, y: 330, height: 40 })
  assert.deepEqual(precipitationBar(100, { top: 290, bottom: 370 }), { value: 100, y: 290, height: 80 })
})

test('metadata exposes only village and mid-range issue hours', () => {
  const label = formatGroundForecastMeta({ hourly_status: { base_time: '1400' }, tmFc: '202608100600' })
  assert.equal(label, '동네예보 14시 · 중기예보 06시')
  assert.equal(formatGroundForecastMeta({ hourly_status: { base_time: '1400' } }), '동네예보 14시 · 중기예보 -')
  assert.doesNotMatch(label, /mid|short|tmFc|발표|08\/10/i)
})

test('metadata shows a placeholder when village issue time is absent or blank', () => {
  for (const baseTime of [undefined, null, '', '   ']) {
    assert.equal(
      formatGroundForecastMeta({ hourly_status: { base_time: baseTime }, tmFc: '202608100600' }),
      '동네예보 - · 중기예보 06시',
    )
  }
  assert.equal(formatGroundForecastMeta({}), '동네예보 - · 중기예보 -')
})

test('ground forecast views alternate in both directions', () => {
  assert.equal(nextGroundForecastView('hourly'), 'weekly')
  assert.equal(nextGroundForecastView('weekly'), 'hourly')
})
