import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseTafTac } from './taf-tac-parser.js'

// 2026-10-17 운영 수집분의 실제 원문
const VS = '2026-10-17T12:00:00Z'
const VE = '2026-10-18T18:00:00Z'
const parse = (raw) => parseTafTac(raw, { validStart: VS, validEnd: VE })

describe('TAF 원문 파서', () => {
  it('바람만 바꾸는 BECMG는 구름·날씨를 건드리지 않아 CAVOK이 이어진다 (RJTT)', () => {
    const r = parse('TAF RJTT 171105Z 1712/1818 10006KT CAVOK BECMG 1714/1716 02006KT BECMG 1800/1803 09006KT BECMG 1806/1809 18014KT')
    assert.equal(r.base.cavok_flag, true)
    assert.deepEqual(r.change_groups.map((g) => [g.type, g.start, g.end]), [
      ['BECMG', '2026-10-17T14:00:00Z', '2026-10-17T16:00:00Z'],
      ['BECMG', '2026-10-18T00:00:00Z', '2026-10-18T03:00:00Z'],
      ['BECMG', '2026-10-18T06:00:00Z', '2026-10-18T09:00:00Z'],
    ])
    for (const g of r.change_groups) {
      assert.equal(g.wx_touched, false)
      assert.equal(g.clouds_touched, false)
      assert.equal(g.vis, null)
      assert.equal(g.cavok_flag, false)
    }
    assert.equal(r.change_groups[0].wind.raw, '02006KT')
  })

  it('BECMG 시정·날씨와 NSW를 읽는다 (WIII)', () => {
    const r = parse('TAF WIII 171100Z 1712/1818 32010KT 8000 FEW020 BECMG 1712/1714 4000 HZ BECMG 1717/1719 18005KT BECMG 1801/1803 03011KT 8000 NSW')
    const [hz, , nsw] = r.change_groups
    assert.equal(hz.vis, 4000)
    assert.equal(hz.wx[0].raw, 'HZ')
    assert.equal(hz.clouds_touched, false)
    assert.equal(nsw.vis, 8000)
    assert.equal(nsw.wx_touched, true)
    assert.deepEqual(nsw.wx, [])
  })

  it('MPS 바람은 노트로 바꾸고 기온군은 건너뛴다 (ZBTJ)', () => {
    const r = parse('TAF ZBTJ 170907Z 1712/1818 25004MPS 3000 -SHRA BR BKN010 OVC033 TX17/1806Z TN13/1721Z TN10/1818Z BECMG 1713/1714 33008G14MPS 5000 BR NSC BECMG 1806/1807 31003MPS')
    assert.equal(r.base.wind.raw, '25008KT')
    assert.deepEqual(r.base.wx.map((w) => w.raw), ['-SHRA', 'BR'])
    assert.deepEqual(r.base.clouds.map((c) => c.raw), ['BKN010', 'OVC033'])
    const becmg = r.change_groups[0]
    assert.equal(becmg.wind.raw, '33016G27KT')
    assert.equal(becmg.nsc_flag, true)
    assert.deepEqual(r.unknown, [])
  })

  it('VRB 돌풍과 CB 구름을 읽는다 (ZYTL)', () => {
    const r = parse('TAF ZYTL 170905Z 1712/1812 15010G17MPS 3000 -SHRA BR SCT010 SCT020 TX18/1712Z TN11/1812Z TEMPO 1712/1716 1300 +SHRA BR BKN008 BKN020 SCT033CB TEMPO 1716/1719 VRB10G19MPS 0800 +TSRA BKN006 BKN020 SCT033CB BECMG 1719/1720 22007G13MPS 2800 BECMG 1721/1722 35007G15MPS 5000 BR')
    const tempo = r.change_groups[1]
    assert.equal(tempo.type, 'TEMPO')
    assert.equal(tempo.wind.variable, true)
    assert.equal(tempo.wind.raw, 'VRB19G37KT')
    assert.equal(tempo.vis, 800)
    assert.equal(tempo.clouds[2].type, 'CB')
  })

  it('FM은 다음 FM(없으면 유효기간 끝)까지 전체 상태를 바꾸고, PROB30 TEMPO를 한 그룹으로 읽는다', () => {
    const r = parse('TAF VHHH 171100Z 1712/1818 09010KT 9999 FEW020 FM180300 12015KT 6000 -RA BKN012 PROB30 TEMPO 1806/1809 3000 TSRA BKN008CB')
    const [fm, prob] = r.change_groups
    assert.equal(fm.type, 'FM')
    assert.equal(fm.start, '2026-10-18T03:00:00Z')
    assert.equal(fm.end, VE)
    assert.equal(fm.clouds_touched, true)
    assert.equal(prob.type, 'PROB30_TEMPO')
    assert.equal(prob.start, '2026-10-18T06:00:00Z')
    assert.equal(prob.end, '2026-10-18T09:00:00Z')
  })

  it('SM 시정을 미터로 바꾼다', () => {
    const r = parse('TAF KJFK 171120Z 1712/1818 18010KT P6SM SCT250 TEMPO 1714/1716 1 1/2SM -SHRA BKN015')
    assert.equal(r.base.vis, 9999)
    assert.equal(r.change_groups[0].vis, 2414)
  })

  it('유효 시작을 주지 않으면 지금 기준으로 연·월을 푼다', () => {
    const r = parseTafTac('TAF RJTT 302300Z 3100/0106 10006KT CAVOK', { now: new Date('2026-10-30T23:30:00Z') })
    assert.equal(r.valid_start, '2026-10-31T00:00:00Z')
    assert.equal(r.valid_end, '2026-11-01T06:00:00Z')
  })

  it('NIL·CNL·형식이 깨진 원문은 null', () => {
    assert.equal(parse('TAF RJTT 171105Z 1712/1818 NIL'), null)
    assert.equal(parse('TAF AMD RJTT 171105Z 1712/1818 CNL'), null)
    assert.equal(parse('TAF RJTT ...'), null)
    assert.equal(parse('TAF RJTT 171105Z 1712/1818 10006KT CAVOK BECMG 02006KT'), null)
  })
})
