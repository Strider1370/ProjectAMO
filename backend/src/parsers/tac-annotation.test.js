import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { annotateMetarTac, annotateTafTac } from './tac-annotation.js'

// 토큰 → 역할 맵. 공백 토큰은 제외.
function roles(rawText) {
  const map = {}
  for (const token of annotateMetarTac(rawText).display_lines[0].tokens) {
    if (token.role !== 'separator') map[token.text] = token.role
  }
  return map
}

describe('tac-annotation 역할 판정', () => {
  it('4글자 현상코드를 공항코드로 오인하지 않는다', () => {
    const r = roles('METAR RKSI 301000Z 27015G28KT 2000 TSRA FZFG MIFG VCSH BKN008 05/04 Q1005 NOSIG')
    assert.equal(r.RKSI, 'station')
    assert.equal(r.TSRA, 'weather-special')
    assert.equal(r.FZFG, 'weather-special')
    assert.equal(r.MIFG, 'weather-special')
    assert.equal(r.VCSH, 'weather-precip')
  })

  it('현상코드처럼 보이는 공항코드(SASA)는 공항코드로 본다', () => {
    assert.equal(roles('METAR SASA 301000Z VRB01KT 9999 SCT017 11/10 Q1016').SASA, 'station')
  })

  it('RE군(지나간 현상)은 현재기상으로 강조하지 않는다', () => {
    const r = roles('METAR ZGSZ 290600Z 11005MPS 9999 -SHRA NSC 28/26 Q1010 RESHRA NOSIG')
    assert.equal(r['-SHRA'], 'weather-precip')
    assert.equal(r.RESHRA, 'plain')
    assert.equal(r['11005MPS'], 'wind') // m/s 표기도 바람군
  })

  it('RMK 이후 자유서식은 현재기상으로 해석하지 않는다', () => {
    const r = roles('METAR CYQX 301000Z 33011KT 1/4SM R03/P6000FT/N -DZ FG VV002 M02/M03 A2997 RMK FG8 SLP154')
    assert.equal(r['-DZ'], 'weather-precip')
    assert.equal(r.FG, 'weather-special')
    assert.equal(r.FG8, 'plain') // RMK 안의 안개 8/10 → 현재기상 아님
    assert.equal(r['R03/P6000FT/N'], 'rvr')
    assert.equal(r['1/4SM'], 'visibility')
    assert.equal(r.VV002, 'ceiling') // 수직시정은 운고 등급 강조
    assert.equal(r['M02/M03'], 'temperature')
    assert.equal(r.A2997, 'qnh')
  })

  it('풍향변동군/최저시정군도 해당 역할로', () => {
    const r = roles('METAR ENBR 301020Z 15005KT 120V180 7000 1200NE -DZRA BKN038 14/13 Q1009')
    assert.equal(r['120V180'], 'wind')
    assert.equal(r['1200NE'], 'visibility')
  })

  it('TAF AMD도 관측소 코드를 찾는다', () => {
    const lines = annotateTafTac('TAF AMD RKSI 300500Z 3006/3112 25008KT 9999 SCT030 TEMPO 3008/3012 4000 SHRA BKN010').display_lines
    const head = lines[0].tokens.filter((t) => t.role !== 'separator')
    assert.equal(head[0].role, 'report')
    assert.equal(head[1].role, 'report')
    assert.equal(head[2].role, 'station')
    assert.equal(lines[1].tokens[0].role, 'change')
  })
})
