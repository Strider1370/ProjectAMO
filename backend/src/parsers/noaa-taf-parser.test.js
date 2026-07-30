import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './noaa-taf-parser.js'

// 2026-07-05 12:00Z ~ 07-06 12:00Z (24h)
const FROM = 1783252800 // 2026-07-05T12:00:00Z
const H = 3600
const entry = {
  icaoId: 'RJTT',
  issueTime: FROM - H,
  validTimeFrom: FROM,
  validTimeTo: FROM + 24 * H,
  rawTAF: 'TAF RJTT ...',
  name: 'Tokyo/Haneda Intl, 13, JP',
  fcsts: [
    { timeFrom: FROM, timeTo: FROM + 24 * H, timeBec: null, fcstChange: null, probability: null,
      wdir: 120, wspd: 6, wgst: null, visib: '6+', wxString: null,
      clouds: [{ cover: 'FEW', base: 1500 }, { cover: 'BKN', base: 3000 }] },
    { timeFrom: FROM + 4 * H, timeTo: FROM + 8 * H, timeBec: null, fcstChange: 'TEMPO', probability: null,
      wdir: null, wspd: null, wgst: null, visib: '2', wxString: '-SHRA',
      clouds: [{ cover: 'BKN', base: 800 }] },
    { timeFrom: FROM + 12 * H, timeTo: FROM + 14 * H, timeBec: FROM + 13 * H, fcstChange: 'BECMG', probability: null,
      wdir: 40, wspd: 10, wgst: null, visib: '6+', wxString: null,
      clouds: [{ cover: 'FEW', base: 2000 }] },
  ],
}

describe('noaa-taf parse', () => {
  it('header 정규화(NOAA, 유효기간)', () => {
    const r = parse(entry)
    assert.equal(r.header.icao, 'RJTT')
    assert.equal(r.header.report_type, 'TAF')
    assert.equal(r.header.source.identifier, 'NOAA')
    assert.equal(r.header.valid_start, '2026-07-05T12:00:00Z')
    assert.equal(r.header.valid_end, '2026-07-06T12:00:00Z')
  })

  it('base + change_groups(TEMPO/BECMG) 분리', () => {
    const r = parse(entry)
    assert.equal(r.base.wind.raw, '12006KT')
    const types = r.change_groups.map((g) => g.type)
    assert.ok(types.includes('TEMPO'))
    assert.ok(types.includes('BECMG'))
    const tempo = r.change_groups.find((g) => g.type === 'TEMPO')
    assert.equal(tempo.vis, 3219) // 2 SM → 미터
    assert.equal(tempo.wx[0].raw, '-SHRA')
  })

  it('timeline: 시각별 상태(TEMPO 창 안/BECMG 이후)', () => {
    const r = parse(entry)
    assert.equal(r.timeline.length, 24)
    const iso = (h) => new Date((FROM + h * H) * 1000).toISOString().replace('.000Z', 'Z')
    const at = (h) => r.timeline.find((t) => t.time === iso(h))

    // 시작(base): 시정 9999, 바람 120
    assert.equal(at(0).visibility.value, 9999)
    assert.equal(at(0).wind.raw, '12006KT')
    // TEMPO 창(5h): 시정 3219, -SHRA 적용
    assert.equal(at(5).visibility.value, 3219)
    assert.equal(at(5).weather[0].raw, '-SHRA')
    // BECMG 이후(15h): 바람 040으로 영구 전환
    assert.equal(at(15).wind.raw, '04010KT')
  })

  it('원문 TAF의 base CAVOK을 타임라인까지 보존', () => {
    const r = parse({
      ...entry,
      rawTAF: 'TAF RJTT 051100Z 0512/0612 12006KT CAVOK BECMG 0600/0602 04010KT',
      fcsts: [
        { ...entry.fcsts[0], clouds: [] },
        { ...entry.fcsts[2], clouds: [] },
      ],
    })
    const at = (h) => r.timeline.find((t) => t.time === new Date((FROM + h * H) * 1000).toISOString().replace('.000Z', 'Z'))

    assert.equal(r.base.cavok_flag, true)
    assert.equal(at(0).visibility.cavok, true)
    assert.equal(at(15).visibility.cavok, true)
  })

  it('미터 시정 전문은 SM 왕복 손실을 원문값으로 되돌린다', () => {
    const r = parse({
      ...entry,
      icaoId: 'VVNB',
      rawTAF: 'TAF VVNB 051100Z 0512/0612 11005KT 9999 SCT025 TEMPO 0516/0520 3500 TSRA SCT015',
      fcsts: [
        { ...entry.fcsts[0], visib: '6+' },
        { ...entry.fcsts[1], timeFrom: FROM + 4 * H, timeTo: FROM + 8 * H, visib: '2.17', wxString: 'TSRA' },
      ],
    })
    const tempo = r.change_groups.find((g) => g.type === 'TEMPO')
    assert.equal(tempo.vis, 3500) // 2.17SM → 3492m가 아니라 원문 3500m
  })

  it('SM 전문(미터군 없음)은 그대로 환산한다', () => {
    const r = parse({ ...entry, rawTAF: 'TAF RJTT 051100Z 0512/0612 12006KT P6SM TEMPO 0516/0520 2SM -SHRA' })
    assert.equal(r.change_groups.find((g) => g.type === 'TEMPO').vis, 3219)
  })

  it('입력 불량 → null', () => {
    assert.equal(parse(null), null)
    assert.equal(parse({ icaoId: 'RJTT', fcsts: [] }), null)
  })
})
