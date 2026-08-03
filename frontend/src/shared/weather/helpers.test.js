import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  computeSunTimes,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from './helpers.js'

describe('shared weather condition helpers', () => {
  it('can use the KST calendar day while formatting the selected time zone', () => {
    const now = new Date('2025-12-31T16:00:00Z')

    assert.deepEqual(
      computeSunTimes(37.4602, 126.4407, now, 'KST'),
      { sunrise: '07:49', sunset: '17:27' },
    )
    assert.deepEqual(
      computeSunTimes(37.4602, 126.4407, now, 'UTC', 'KST'),
      { sunrise: '22:49', sunset: '08:27' },
    )
  })

  it('keeps the monitoring default date boundary unchanged', () => {
    assert.deepEqual(
      computeSunTimes(37.4602, 126.4407, new Date('2025-12-31T16:00:00Z'), 'UTC'),
      { sunrise: '22:49', sunset: '08:26' },
    )
  })

  it('falls back when coordinates are missing', () => {
    assert.deepEqual(
      computeSunTimes(undefined, 126.4407, new Date('2026-07-28T03:00:00Z'), 'KST'),
      { sunrise: '-', sunset: '-' },
    )
  })

  it('detects precipitation weather tokens and ignores NSW', () => {
    assert.equal(hasPrecipitationWeather({ display: { weather: 'RA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: '-DZ BR' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'SHRA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'NSW' } }), false)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'FG' } }), false)
  })

  it('detects special weather used for dashed alert styling', () => {
    assert.equal(hasSpecialWeather({ display: { weather: 'TSRA' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'FG' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: '-SN' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'BR' } }), false)
    assert.equal(hasSpecialWeather({ display: { weather: 'NSW' } }), false)
  })

  it('detects high wind by sustained speed or gust threshold', () => {
    assert.equal(hasHighWindCondition({ speed: 25, gust: null }), true)
    assert.equal(hasHighWindCondition({ speed: 10, gust: 35 }), true)
    assert.equal(hasHighWindCondition({ speed: 24, gust: 34 }), false)
    assert.equal(hasHighWindCondition({ calm: true, speed: 40, gust: 50 }), false)
  })
})
