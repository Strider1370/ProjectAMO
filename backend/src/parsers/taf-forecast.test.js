import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildTafForecast, partialMerge } from './taf-forecast.js'
import { parseTafTac } from './taf-tac-parser.js'

// 2026-10-17 운영 수집분의 실제 원문. 원문 파서 결과는 국내 IWXXM 파서와 같다(taf-tac-parser.test.js).
const VS = '2026-10-17T12:00:00Z'
const VE = '2026-10-18T18:00:00Z'
const forecastOf = (raw) => buildTafForecast(parseTafTac(raw, { validStart: VS, validEnd: VE }))
const brief = (p) => [p.start, p.end, p.display.wind, p.display.visibility, p.display.weather, p.display.clouds, p.change?.type ?? null]

describe('TAF 해석(forecast)', () => {
  it('BECMG는 변화 시간대 끝에 주 예보를 바꾸고, TEMPO는 주 예보에 섞지 않는다 (RKSI)', () => {
    const f = forecastOf('TAF RKSI 171100Z 1712/1818 12010G25KT CAVOK TN18/1720Z TX21/1806Z BECMG 1715/1717 14018G35KT BECMG 1719/1721 6000 -RA FEW010 BKN030 OVC070 TEMPO 1803/1806 18025G45KT 2000 +RA SCT005 BKN020 OVC050 BECMG 1807/1809 27012G25KT 9999 NSW SCT025 BECMG 1811/1813 33008KT')
    assert.deepEqual(f.prevailing.map(brief), [
      ['2026-10-17T12:00:00Z', '2026-10-17T17:00:00Z', '12010G25KT', '9999', '', 'NSC', null],
      ['2026-10-17T17:00:00Z', '2026-10-17T21:00:00Z', '14018G35KT', '9999', '', 'NSC', 'BECMG'],
      ['2026-10-17T21:00:00Z', '2026-10-18T09:00:00Z', '14018G35KT', '6000', '-RA', 'FEW010 BKN030 OVC070', 'BECMG'],
      ['2026-10-18T09:00:00Z', '2026-10-18T13:00:00Z', '27012G25KT', '9999', '', 'SCT025', 'BECMG'],
      ['2026-10-18T13:00:00Z', '2026-10-18T18:00:00Z', '33008KT', '9999', '', 'SCT025', 'BECMG'],
    ])
    assert.equal(f.prevailing[0].visibility.cavok, true)
    assert.equal(f.prevailing[1].visibility.cavok, true) // 바람만 바뀌는 BECMG 뒤에도 CAVOK
    assert.deepEqual([f.prevailing[1].change.start, f.prevailing[1].change.end], ['2026-10-17T15:00:00Z', '2026-10-17T17:00:00Z'])

    assert.equal(f.temporary.length, 1)
    const [tempo] = f.temporary
    assert.deepEqual([tempo.type, tempo.start, tempo.end, tempo.probability], ['TEMPO', '2026-10-18T03:00:00Z', '2026-10-18T06:00:00Z', null])
    assert.deepEqual(tempo.changed, ['wind', 'visibility', 'weather', 'clouds'])
    assert.deepEqual([tempo.display.wind, tempo.display.visibility, tempo.display.weather], ['18025G45KT', '2000', '+RA'])
  })

  it('바람만 바꾸는 TEMPO는 바꾼 요소로 바람만 내고, 나머지는 그 시각 주 예보를 이어받는다', () => {
    const f = forecastOf('TAF RKSI 171100Z 1712/1818 27012G25KT 9999 SCT025 TEMPO 1812/1814 33020G35KT')
    const [tempo] = f.temporary
    assert.deepEqual(tempo.changed, ['wind'])
    assert.deepEqual([tempo.display.wind, tempo.display.visibility, tempo.display.clouds], ['33020G35KT', '9999', 'SCT025'])
    assert.equal(f.prevailing.length, 1)
  })

  it('FM은 시작 시각에 전체 상태를 바꾸고, 그 앞 BECMG가 FM 값을 덮지 않는다', () => {
    const f = forecastOf('TAF VHHH 171100Z 1712/1818 09010KT 9999 FEW020 BECMG 1714/1716 4000 HZ FM180300 12015KT 6000 -RA BKN012 PROB30 TEMPO 1806/1809 3000 TSRA BKN008CB')
    assert.deepEqual(f.prevailing.map(brief), [
      ['2026-10-17T12:00:00Z', '2026-10-17T16:00:00Z', '09010KT', '9999', '', 'FEW020', null],
      ['2026-10-17T16:00:00Z', '2026-10-18T03:00:00Z', '09010KT', '4000', 'HZ', 'FEW020', 'BECMG'],
      ['2026-10-18T03:00:00Z', '2026-10-18T18:00:00Z', '12015KT', '6000', '-RA', 'BKN012', 'FM'],
    ])
    const [prob] = f.temporary
    assert.deepEqual([prob.type, prob.probability], ['PROB30_TEMPO', 30])
    assert.equal(prob.display.wind, '12015KT') // FM 뒤 주 예보를 이어받는다
  })

  it('유효시작과 함께 시작한 BECMG도 변화 시간대 끝까지 base가 이어진다 (RJCC)', () => {
    const f = forecastOf('TAF RJCC 171106Z 1712/1818 32006KT 9999 FEW020 BKN040 BECMG 1712/1714 15004KT BECMG 1815/1818 15014KT')
    assert.deepEqual(f.prevailing.map((p) => [p.end, p.display.wind]), [
      ['2026-10-17T14:00:00Z', '32006KT'],
      ['2026-10-18T18:00:00Z', '15004KT'],
    ])
  })

  it('NSW는 현상을 지우고 CAVOK은 시정·현상·구름을 모두 바꾼다', () => {
    const cloudy = { vis: 4000, wx: [{ raw: 'BR' }], clouds: [{ raw: 'BKN010' }], cavok_flag: false, nsc_flag: false }
    const nsw = partialMerge(cloudy, { wx: [], wx_touched: true, nsw_flag: true })
    assert.deepEqual([nsw.wx, nsw.nsw_flag, nsw.clouds.length], [[], true, 1])
    const cavok = partialMerge(cloudy, { cavok_flag: true })
    assert.deepEqual([cavok.vis, cavok.wx, cavok.clouds, cavok.cavok_flag], [9999, [], [], true])
  })

  it('유효기간이 없으면 null', () => {
    assert.equal(buildTafForecast({ base: {}, change_groups: [], valid_start: null, valid_end: VE }), null)
  })
})
