import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildMetarViewModel, buildMetarTacSegments } from './metarViewModel.js'

const baseMetar = {
  header: { observation_time: '2026-05-21T10:00:00Z' },
  observation: {
    cavok: false,
    display: { weather: 'TSRA', visibility: '3000', qnh: 'Q1008' },
    visibility: { value: 3000 },
    wind: { direction: 250, speed: 12, gust: 36, unit: 'KT' },
    clouds: [{ amount: 'BKN', base: 1200 }],
    temperature: { air: 19, dewpoint: 17 },
  },
}

describe('airport METAR view model weather highlighting', () => {
  it('exposes precipitation and special-weather flags for current weather card', () => {
    const model = buildMetarViewModel({
      metar: baseMetar,
      amosData: { daily_rainfall: { mm: 2.9 } },
      icao: 'RKSI',
      airportMeta: { runway_hdg: 150 },
    })

    assert.equal(model.precipitationWeather, true)
    assert.equal(model.specialWeather, true)
    assert.equal(model.highWind, true)
    assert.equal(model.weatherKorean, '뇌우')
    assert.equal(model.qnh, '1008 hPa')
    assert.equal(model.rainText, '2.9 mm')
  })

  it('does not mark mist as special or precipitation weather', () => {
    const model = buildMetarViewModel({
      metar: {
        ...baseMetar,
        observation: {
          ...baseMetar.observation,
          display: { ...baseMetar.observation.display, weather: 'BR' },
          weather: [],
        },
      },
      amosData: null,
      icao: 'RKSI',
      airportMeta: { runway_hdg: 150 },
    })

    assert.equal(model.precipitationWeather, false)
    assert.equal(model.specialWeather, false)
  })
})

describe('buildMetarTacSegments — TAC 원문 하이라이트', () => {
  it('highlights visibility below the IFR threshold', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '4800', qnh: 'Q1008' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    const rawText = 'RKSI 171200Z 09008KT 4800 22/21 Q1008 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const highlighted = segments.filter((s) => s.className)
    assert.equal(highlighted.length, 1)
    assert.equal(highlighted[0].text, '4800')
    assert.match(highlighted[0].className, /ap-metar-tac-hl--level-ifr/)
  })

  it('highlights gusty wind exceeding the high-wind threshold', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '9999', qnh: 'Q0998' },
        visibility: { value: 9999 },
        wind: { direction: 320, speed: 28, gust: 40, unit: 'KT' },
        clouds: [],
        temperature: { air: 19, dewpoint: 18 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSS', airportMeta: { runway_hdg: 140 } })
    const rawText = 'RKSS 171200Z 32028G40KT 9999 19/18 Q0998'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const highlighted = segments.filter((s) => s.className)
    assert.equal(highlighted.length, 1)
    assert.equal(highlighted[0].text, '32028G40KT')
    assert.match(highlighted[0].className, /ap-metar-tac-hl--wind/)
  })

  it('highlights precipitation/special weather tokens', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: '-RA BR', visibility: '4800', qnh: 'Q1008' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [{ amount: 'OVC', base: 1200 }],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    const rawText = 'RKSI 171200Z 09008KT 4800 -RA BR OVC012 22/21 Q1008 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const wxSegments = segments.filter((s) => s.className?.includes('ap-metar-tac-hl--precip'))
    assert.deepEqual(wxSegments.map((s) => s.text), ['-RA', 'BR'])
    const ceilSegment = segments.find((s) => s.className?.includes('ap-metar-tac-hl--level-ifr') && s.text === 'OVC012')
    assert.ok(ceilSegment, 'expected OVC012 to be highlighted as IFR ceiling')
  })

  it('adds no highlights for a calm VFR observation', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '9999', qnh: 'Q1012' },
        visibility: { value: 9999 },
        wind: { direction: 270, speed: 6, unit: 'KT' },
        clouds: [{ amount: 'FEW', base: 3000 }],
        temperature: { air: 26, dewpoint: 18 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKPC', airportMeta: { runway_hdg: 70 } })
    const rawText = 'RKPC 171200Z 27006KT 9999 FEW030 26/18 Q1012 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.length, 1)
    assert.equal(segments[0].text, rawText)
    assert.equal(segments[0].className, undefined)
  })

  it('leaves text intact and uncolored when the parsed token cannot be found verbatim', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '3SM', qnh: 'A2996' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    // 국제(SM) 표기라 파싱된 '4800' 토큰이 원문에 그대로 없음 — 탐색 실패해도 원문은 안전하게 보존돼야 함
    const rawText = 'RKSI 171200Z 09008KT 3SM 22/21 A2996 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    assert.equal(segments.filter((s) => s.className).length, 0)
  })
})
