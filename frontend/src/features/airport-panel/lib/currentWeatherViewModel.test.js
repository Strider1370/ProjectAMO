import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCompactMetarModel,
  buildCompactTafModel,
  buildCurrentWarningModel,
  formatRvrSummary,
} from './currentWeatherViewModel.js'

describe('current weather tab view model', () => {
  it('builds an ok warning model when there are no active warnings', () => {
    const model = buildCurrentWarningModel({ warnings: [] })

    assert.equal(model.active, false)
    assert.equal(model.count, 0)
    assert.equal(model.label, '\uacf5\ud56d\uacbd\ubcf4 \uc5c6\uc74c')
    assert.deepEqual(model.items, [])
  })

  it('maps warning key to Korean name and formats time as fmtKstShort', () => {
    const model = buildCurrentWarningModel({
      warnings: [
        {
          wrng_type_key: 'LOW_VISIBILITY',
          wrng_type_name: 'Low Visibility Warning',
          valid_start: '2026-06-06T01:00:00Z',
          valid_end: '2026-06-06T04:30:00Z',
        },
      ],
    })

    assert.equal(model.active, true)
    assert.equal(model.count, 1)
    assert.equal(model.items[0].name, '\uc800\uc2dc\uc815\uacbd\ubcf4') // \uc800\uc2dc\uc815\uacbd\ubcf4 (\ud0a4 \ub9e4\ud551)
    assert.equal(model.items[0].timeText, '2026-06-06 01:00 UTC \u2013 2026-06-06 04:30 UTC')
  })

  it('falls back through warning type fields in priority order', () => {
    const model = buildCurrentWarningModel({
      warnings: [
        { type_label: '\uac15\ud48d', valid_start: null, valid_end: null },
        { type: 'THUNDERSTORM', valid_start: null, valid_end: null },
      ],
    })

    assert.equal(model.items[0].name, '\uac15\ud48d')
    assert.equal(model.items[1].name, 'THUNDERSTORM')
  })

  it('formats RVR summary from observation RVR entries', () => {
    const text = formatRvrSummary({
      rvr: [
        { runway: '33L', mean: 550 },
        { runway: '33R', mean: 700 },
      ],
    })

    assert.equal(text, 'R33L/550m, R33R/700m')
  })

  it('builds compact METAR cards with rainfall, gust, and RVR inside their parent cards', () => {
    const model = buildCompactMetarModel({
      icao: 'RKSI',
      airportMeta: { runway_hdg: 330 },
      amosData: { daily_rainfall: { mm: 2.4 } },
      metar: {
        header: { observation_time: '2026-06-06T03:00:00Z' },
        observation: {
          cavok: false,
          display: { weather: 'RA', visibility: 9000, qnh: 'Q1011' },
          wind: { direction: 270, speed: 12, gust: 28, unit: 'KT' },
          visibility: { value: 9000 },
          rvr: [{ runway: '33L', mean: 650 }],
          clouds: [{ amount: 'BKN', base: 1800 }],
          temperature: { air: 21, dewpoint: 18 },
        },
      },
    })

    assert.equal(model.empty, false)
    assert.equal(model.flightCategory, model.flight.category)
    assert.equal(model.cards.weather.secondary, '2.4 mm')
    assert.equal(model.cards.wind.secondary, 'G28kt')
    assert.equal(model.cards.rvr.value, 'R33L/650m') // #5: RVR은 이제 독립 카드(과거 시정 카드 secondary 아님)
    assert.equal(model.cards.qnh.value, '1011 hPa')
    assert.equal(model.cards.temperature.value, '21\u00b0C / 18\u00b0C')
  })

  it('returns an empty compact METAR model without METAR input', () => {
    const model = buildCompactMetarModel({ metar: null, amosData: null, icao: 'RKSI', airportMeta: null })

    assert.equal(model.empty, true)
  })

  it('keeps current valid TAF slot that started before now and trims after six hours', () => {
    const now = new Date('2026-06-06T03:30:00Z')
    const taf = {
      header: {
        report_status: 'NORMAL',
        valid_start: '2026-06-06T00:00:00Z',
        valid_end: '2026-06-06T18:00:00Z',
      },
      timeline: [
        { time: '2026-06-06T02:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T03:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T09:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T10:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
      ],
    }

    const model = buildCompactTafModel({ taf, icao: 'RKSI', now })

    assert.equal(model.empty, false)
    assert.equal(model.sourceSlotCount, 4)
    assert.deepEqual(model.slots.map((slot) => slot.time), [
      '2026-06-06T03:00:00Z',
      '2026-06-06T09:00:00Z',
    ])
    assert.equal(model.hourCount, 2)
  })

  it('distinguishes source TAF data from an empty six-hour window', () => {
    const now = new Date('2026-06-06T03:30:00Z')
    const taf = {
      header: {},
      timeline: [
        { time: '2026-06-06T12:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
      ],
    }

    const model = buildCompactTafModel({ taf, icao: 'RKSI', now })

    assert.equal(model.empty, false)
    assert.equal(model.sourceSlotCount, 1)
    assert.equal(model.slots.length, 0)
  })
})
