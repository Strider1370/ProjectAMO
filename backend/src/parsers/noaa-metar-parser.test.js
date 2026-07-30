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

  it('wxString에서 현재기상 추출', () => {
    const r = parse({ ...base, visib: '2', wxString: '-SHRA BR', rawOb: 'METAR RJTT 051300Z 13010KT 3000 -SHRA BR BKN008 20/19 Q1008' })
    assert.deepEqual(r.observation.weather.map((w) => w.raw), ['-SHRA', 'BR'])
    assert.equal(r.observation.visibility.value, 3000) // 원문 미터군 3000 우선
  })

  // wxString은 NOAA가 TAC에서 디코드한 값 → 색상상태·RMK 토큰 오탐이 없다.
  it('색상상태/RMK 토큰은 현재기상으로 오인하지 않음', () => {
    const r = parse({ ...base, rawOb: 'METAR LTAC 051300Z 13006KT 9999 FEW020 23/20 Q1012 NOSIG GRN BLU RMK FG8 SNOCLO' })
    assert.deepEqual(r.observation.weather, [])
    assert.equal(r.observation.display.weather, '')
  })

  it('OVX(수직시정)는 TAC VV로 환산 — 운고 판정에 쓰이도록', () => {
    const r = parse({ ...base, clouds: [{ cover: 'OVX', base: 200 }], rawOb: 'SPECI PACD 301004Z AUTO 33004KT 1/4SM FG VV002 08/08 A3019', wxString: 'FG', visib: '0.25' })
    assert.deepEqual(r.observation.clouds, [{ amount: 'VV', base: 200, type: null, raw: 'VV002' }])
    assert.equal(r.observation.display.clouds, 'VV002')
  })

  // NOAA METAR JSON엔 구름 종류 필드가 없어 CB/TCU는 전문에서 읽는다.
  it('CB/TCU를 전문에서 읽어 층에 붙인다', () => {
    const r = parse({
      ...base,
      clouds: [{ cover: 'SCT', base: 3000 }, { cover: 'FEW', base: 3500 }, { cover: 'BKN', base: 9000 }],
      rawOb: 'METAR VIDP 301000Z 07007KT 6000 SCT030 FEW035CB BKN090 35/25 Q0999 NOSIG',
    })
    assert.deepEqual(r.observation.clouds.map((c) => c.type), [null, 'CB', null])
    assert.equal(r.observation.display.clouds, 'SCT030 FEW035CB BKN090')
  })

  it('같은 운량·운고 두 층에서 한쪽만 대류운인 경우', () => {
    const r = parse({
      ...base,
      clouds: [{ cover: 'FEW', base: 3300 }, { cover: 'FEW', base: 3300 }],
      rawOb: 'METAR ZYTX 301000Z 23007MPS 9999 FEW033TCU FEW033 32/26 Q1004 NOSIG',
    })
    assert.deepEqual(r.observation.clouds.map((c) => c.type), ['TCU', null])
  })

  it('경향군의 CAVOK는 관측으로 쓰지 않는다', () => {
    // "… BKN120 19/17 Q1018 BECMG CAVOK" — CAVOK는 예보. 관측 구름을 지워선 안 된다.
    const r = parse({
      ...base,
      clouds: [{ cover: 'FEW', base: 3300 }, { cover: 'BKN', base: 12000 }],
      rawOb: 'METAR LFPO 301000Z 08005KT 040V120 9999 FEW033 BKN120 19/17 Q1018 BECMG CAVOK',
    })
    assert.equal(r.cavok_flag, false)
    assert.equal(r.observation.display.clouds, 'FEW033 BKN120')
  })

  it('RVR: FT 표기는 미터로, V(변동)는 하한/상한으로', () => {
    const r = parse({ ...base, rawOb: 'METAR CYQX 301000Z 33011KT 1/4SM R03/P6000FT/N R13/3000V4000FT/N -DZ FG VV002 12/12 A2997 RMK R99/1000FT' })
    assert.deepEqual(r.observation.rvr, [
      { runway: '03', mean: 1829, minimum: null, maximum: null, tendency: null, operator: 'ABOVE' },
      { runway: '13', mean: 914, minimum: 914, maximum: 1219, tendency: null, operator: null },
    ])
  })

  it('RVR: 미터 표기(비미국)는 그대로', () => {
    const r = parse({ ...base, rawOb: 'METAR RKSI 051300Z 13006KT 0500 R33L/0800U R33R/M0050 FG VV002 23/20 Q1012' })
    assert.deepEqual(r.observation.rvr.map((v) => [v.runway, v.mean, v.operator]), [['33L', 800, null], ['33R', 50, 'BELOW']])
  })

  it('미터 시정군은 원문 값을 그대로 쓴다(SM 왕복 오차 방지)', () => {
    // 전문 1500m → NOAA visib "0.93"SM → 되돌리면 1497m. 원문 미터군이 우선.
    const r = parse({ ...base, visib: 0.93, rawOb: 'METAR WBKK 301030Z 22007KT 190V300 1500 +TSRA FEW013 25/25 Q1008 NOSIG', wxString: '+TSRA' })
    assert.equal(r.observation.visibility.value, 1500)
  })

  it('경향군 이후 시정은 관측값으로 쓰지 않는다', () => {
    const r = parse({ ...base, visib: '6+', rawOb: 'METAR RJTT 301000Z 18010KT 9999 TS FEW030 31/24 Q1002 TEMPO TL1100 1500 +TSRA BR' })
    assert.equal(r.observation.visibility.value, 9999)
  })

  it('SM 표기(미국·캐나다)는 미터로 환산해 쓴다', () => {
    const r = parse({ ...base, visib: '1.5', rawOb: 'METAR KJFK 300951Z 31006KT 1 1/2SM BR OVC005 21/18 A2965', wxString: 'BR' })
    assert.equal(r.observation.visibility.value, 2414)
  })

  // NOAA JSON은 미국 단위·정규화 값이라 전문과 어긋나는 항목이 있다 → 전문군을 우선한다.
  it('M00(영하 0도대)은 전문 기온군을 그대로 쓴다', () => {
    // NOAA JSON은 temp:0으로 줘서 부호가 사라진다.
    const r = parse({ ...base, temp: 0, dewp: -4, rawOb: 'METAR SAWH 301000Z 29007KT 9999 FEW045 M00/M04 Q1010' })
    assert.equal(r.observation.display.temperature, 'M00/M04')
  })

  it('수은주 기압군(A)은 전문값을 환산해 쓴다', () => {
    // altim 재반올림은 전문값과 1hPa 어긋날 수 있다(A3022 = 1023hPa).
    const r = parse({ ...base, altim: 1023.7, rawOb: 'METAR PADU 301000Z 09006KT 10SM FEW030 08/04 A3022' })
    assert.equal(r.observation.qnh.value, 1023)
  })

  it('hPa 기압군(Q)은 정수 그대로', () => {
    const r = parse({ ...base, altim: 1012.4, rawOb: 'METAR RJTT 051300Z 13006KT 9999 FEW020 23/20 Q1012 NOSIG' })
    assert.equal(r.observation.qnh.value, 1012)
  })

  it('기온/노점 소수는 TAC 정수군으로 반올림', () => {
    // 전문에 기온군이 없을 때(결측 보고)만 JSON 숫자값으로 만든다.
    const r = parse({ ...base, temp: 21.1, dewp: 17.8, rawOb: 'METAR RJTT 051300Z 13006KT 9999 FEW020 /////// Q1012' })
    assert.equal(r.observation.display.temperature, '21/18')
    assert.equal(r.observation.temperature.air, 21.1) // 원값은 보존
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
