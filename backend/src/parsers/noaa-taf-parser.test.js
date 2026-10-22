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

  // 2026-10-17 AWC 실제 응답. NOAA JSON은 BECMG마다 앞 상태를 채워 CAVOK을 6+/NSW/NSC로 풀고,
  // timeTo를 다음 변화군 시작으로 준다 — 원문을 읽어야 CAVOK과 BECMG 시각이 맞는다.
  const RJTT = {
    icaoId: 'RJTT', issueTime: '2026-10-17T11:05:00.000Z', validTimeFrom: 1792238400, validTimeTo: 1792346400, name: 'Tokyo/Haneda Intl',
    rawTAF: 'TAF RJTT 171105Z 1712/1818 10006KT CAVOK BECMG 1714/1716 02006KT BECMG 1800/1803 09006KT BECMG 1806/1809 18014KT',
    fcsts: [
      { timeFrom: 1792238400, timeTo: 1792245600, timeBec: null, fcstChange: null, probability: null, wdir: 100, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
      { timeFrom: 1792245600, timeTo: 1792281600, timeBec: 1792252800, fcstChange: 'BECMG', probability: null, wdir: 20, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
      { timeFrom: 1792281600, timeTo: 1792303200, timeBec: 1792292400, fcstChange: 'BECMG', probability: null, wdir: 90, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
      { timeFrom: 1792303200, timeTo: 1792346400, timeBec: 1792314000, fcstChange: 'BECMG', probability: null, wdir: 180, wspd: 14, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
    ],
  }
  const RJCC = {
    icaoId: 'RJCC', issueTime: '2026-10-17T11:06:00.000Z', validTimeFrom: 1792238400, validTimeTo: 1792346400, name: 'Sapporo/Chitose Arpt',
    rawTAF: 'TAF RJCC 171106Z 1712/1818 32006KT 9999 FEW020 BKN040 BECMG 1712/1714 15004KT BECMG 1815/1818 15014KT',
    fcsts: [
      { timeFrom: 1792238400, timeTo: 1792346400, timeBec: null, fcstChange: null, probability: null, wdir: 320, wspd: 6, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
      { timeFrom: 1792238400, timeTo: 1792335600, timeBec: 1792245600, fcstChange: 'BECMG', probability: null, wdir: 150, wspd: 4, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
      { timeFrom: 1792335600, timeTo: 1792346400, timeBec: 1792346400, fcstChange: 'BECMG', probability: null, wdir: 150, wspd: 14, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
    ],
  }
  const hourOf = (r, iso) => r.timeline.find((t) => t.time === iso)

  it('원문을 읽어 바람만 바뀌는 BECMG 뒤에도 CAVOK을 잇는다 (RJTT 실제)', () => {
    const r = parse(RJTT)
    assert.equal(r.header.parsed_from, 'TAC')
    assert.ok(r.timeline.every((t) => t.visibility.cavok), 'TAF 내내 CAVOK')
    assert.equal(r.change_groups[0].clouds_touched, false)
    assert.equal(r.change_groups[0].end, '2026-10-17T16:00:00Z') // timeTo(00Z)가 아니라 원문 1714/1716의 끝
    assert.equal(hourOf(r, '2026-10-18T06:00:00Z').wind.raw, '18014KT')
    // 해석 모델(forecast)도 같은 원문 해석에서 나온다: BECMG 끝마다 바람만 바뀌고 CAVOK은 이어진다
    assert.deepEqual(r.forecast.prevailing.map((p) => [p.end, p.display.wind, p.visibility.cavok]), [
      ['2026-10-17T16:00:00Z', '10006KT', true],
      ['2026-10-18T03:00:00Z', '02006KT', true],
      ['2026-10-18T09:00:00Z', '09006KT', true],
      ['2026-10-18T18:00:00Z', '18014KT', true],
    ])
    assert.deepEqual(r.forecast.temporary, [])
  })

  it('유효시작과 같이 시작한 BECMG를 변화 시간대 끝에 적용한다 (RJCC 실제)', () => {
    const r = parse(RJCC)
    assert.equal(r.change_groups[0].end, '2026-10-17T14:00:00Z')
    assert.equal(hourOf(r, '2026-10-17T13:00:00Z').wind.raw, '32006KT')
    assert.equal(hourOf(r, '2026-10-17T14:00:00Z').wind.raw, '15004KT') // 이전: 18/15Z까지 32006KT
  })

  it('원문을 못 읽으면 JSON으로 대신하고 BECMG 끝은 timeBec에서 읽는다', () => {
    const r = parse({ ...RJCC, rawTAF: 'TAF RJCC ...' })
    assert.equal(r.header.parsed_from, 'JSON')
    assert.equal(r.change_groups[0].end, '2026-10-17T14:00:00Z')
    assert.equal(hourOf(r, '2026-10-17T14:00:00Z').wind.raw, '15004KT')
  })

  it('입력 불량 → null', () => {
    assert.equal(parse(null), null)
    assert.equal(parse({ icaoId: 'RJTT', fcsts: [] }), null)
  })
})
