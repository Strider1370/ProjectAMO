import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse, convertSmToMeters } from './noaa-metar-parser.js'

describe('convertSmToMeters (SM→미터)', () => {
  it('"6+"/"10+"(이상)은 무제한 → 9999', () => {
    assert.equal(convertSmToMeters('6+'), 9999)
    assert.equal(convertSmToMeters('10+'), 9999)
  })
  it('정수 SM은 ×1609.34 반올림, 9999 캡', () => {
    assert.equal(convertSmToMeters('3'), 4828)
    assert.equal(convertSmToMeters('1'), 1609)
    assert.equal(convertSmToMeters('7'), 9999) // 7*1609=11265 → 캡
  })
  it('분수/혼합분수 처리', () => {
    assert.equal(convertSmToMeters('1 1/2'), 2414)
    assert.equal(convertSmToMeters('3/4'), 1207)
  })
  it('빈값/누락 → null', () => {
    assert.equal(convertSmToMeters(''), null)
    assert.equal(convertSmToMeters(null), null)
  })
})

describe('noaa-metar parse', () => {
  const base = {
    icaoId: 'RJTT', reportTime: '2026-07-05T13:00:00.000Z',
    temp: 23, dewp: 20, wdir: 130, wspd: 6, visib: '6+', altim: 1012,
    metarType: 'METAR', name: 'Tokyo/Haneda Intl, 13, JP',
    rawOb: 'METAR RJTT 051300Z 13006KT 9999 FEW020 SCT040 BKN130 23/20 Q1012 NOSIG',
    clouds: [{ cover: 'FEW', base: 2000 }, { cover: 'SCT', base: 4000 }, { cover: 'BKN', base: 13000 }],
    fltCat: 'VFR',
  }

  it('정규화 shape: header/observation/display', () => {
    const r = parse(base)
    assert.equal(r.header.icao, 'RJTT')
    assert.equal(r.header.source.identifier, 'NOAA')
    assert.equal(r.header.airport_name, 'Tokyo/Haneda Intl')
    assert.equal(r.observation.visibility.value, 9999) // 시정 미터
    assert.equal(r.observation.wind.raw, '13006KT')
    assert.equal(r.observation.clouds.length, 3)
    assert.equal(r.observation.clouds[0].raw, 'FEW020')
    assert.equal(r.observation.qnh.value, 1012)
    assert.equal(r.observation.display.temperature, '23/20')
  })

  it('wdir "VRB" → 가변 바람', () => {
    const r = parse({ ...base, wdir: 'VRB', wspd: 3, rawOb: 'METAR RJTT 051300Z VRB03KT 9999' })
    assert.equal(r.observation.wind.variable, true)
    assert.match(r.observation.wind.raw, /^VRB03KT$/)
  })

  it('rawOb에서 현재기상(SHRA) 추출', () => {
    const r = parse({ ...base, visib: '2', rawOb: 'METAR RJTT 051300Z 13010KT 3000 -SHRA BKN008 20/19 Q1008' })
    assert.ok(r.observation.weather.length >= 1)
    assert.equal(r.observation.weather[0].raw, '-SHRA')
    assert.equal(r.observation.visibility.value, 3219) // 2 SM → 미터
  })

  it('최근 현상(RE...)은 현재기상에서 제외', () => {
    const r = parse({ ...base, rawOb: 'METAR ZGSZ 290600Z 11005MPS 9999 -SHRA NSC 28/26 Q1010 RESHRA NOSIG' })
    assert.deepEqual(r.observation.weather.map((weather) => weather.raw), ['-SHRA'])
  })

  it('CAVOK → 시정 9999·구름 NSC', () => {
    const r = parse({ ...base, visib: '6+', clouds: [], rawOb: 'METAR RJTT 051300Z 13006KT CAVOK 23/20 Q1012' })
    assert.equal(r.cavok_flag, true)
    assert.equal(r.observation.display.clouds, 'NSC')
  })

  it('입력 불량 → null', () => {
    assert.equal(parse(null), null)
    assert.equal(parse({}), null)
  })
})
