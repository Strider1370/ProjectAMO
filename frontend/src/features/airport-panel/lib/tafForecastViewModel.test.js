import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { buildTafForecastView } from './tafForecastViewModel.js'

// 2026-10-17 RKSI 실제 TAF를 백엔드(taf-forecast.js)가 해석한 결과에서 화면에 쓰는 필드만 남긴 것.
// TAF RKSI 171100Z 1712/1818 12010G25KT CAVOK BECMG 1715/1717 14018G35KT BECMG 1719/1721 6000 -RA FEW010 BKN030 OVC070
//   TEMPO 1803/1806 18025G45KT 2000 +RA SCT005 BKN020 OVC050 BECMG 1807/1809 27012G25KT 9999 NSW SCT025 BECMG 1811/1813 33008KT
const RKSI = JSON.parse(readFileSync(new URL('../fixtures/rksi-taf-forecast-2026-10-17.json', import.meta.url), 'utf8'))
const at = (iso) => Date.parse(iso)
const ISSUE = at('2026-10-17T12:20:00Z')
const view = buildTafForecastView(RKSI, 'RKSI', ISSUE)
const row = (key) => view.rows.find((r) => r.key === key)
const texts = (key) => row(key).segments.map((s) => s.cell.text)

describe('TAF 해석 화면 모델', () => {
  it('주 예보만 줄로 그린다: TEMPO 값은 주 예보 칸에 섞이지 않고 1시간짜리 조각도 생기지 않는다', () => {
    assert.deepEqual(texts('wind'), ['12010G25KT', '14018G35KT', '27012G25KT', '33008KT'])
    assert.deepEqual(texts('vis'), ['9999', '6000', '9999'])
    assert.deepEqual(texts('cat'), ['VFR'])
  })

  it('BECMG로 바뀐 값은 변화 시간대 시작부터 칸을 차지하고, 변화 시간대는 설명용으로 남긴다', () => {
    const [first, second] = row('wind').segments
    assert.equal(first.end, at('2026-10-17T15:00:00Z'))
    assert.equal(second.start, at('2026-10-17T15:00:00Z')) // 그라데이션 칸 없이 바로 이어진다
    assert.deepEqual([second.becmg.start, second.becmg.end, second.becmg.from.text], [at('2026-10-17T15:00:00Z'), at('2026-10-17T17:00:00Z'), '12010G25KT'])
    assert.equal(first.becmg, null)
  })

  it('TEMPO는 바꾼 줄에만 칸을 두고, 그 칸이 가르는 주 예보 칸은 테두리(split)와 조각(pieces)으로 나눈다', () => {
    for (const key of ['cat', 'wx', 'wind', 'vis', 'cloud']) assert.equal(row(key).tempos.length, 1, key)
    const [tempo] = row('vis').tempos
    assert.equal(tempo.cell.text, '2000')
    assert.equal(tempo.cell.tone, 'ifr')
    const sixThousand = row('vis').segments[1]
    assert.equal(sixThousand.split, true)
    assert.deepEqual(sixThousand.pieces, [
      [at('2026-10-17T19:00:00Z'), at('2026-10-18T03:00:00Z')], // BECMG 1719/1721 시작부터
      [at('2026-10-18T06:00:00Z'), at('2026-10-18T07:00:00Z')],
    ])
    assert.equal(row('cat').tempos[0].cell.text, 'IFR')
    assert.equal(row('cat').tempos[0].same, false)
  })

  it('색은 비행조건과 기준을 넘은 값에만 준다', () => {
    assert.equal(row('vis').segments[1].cell.tone, null) // 6000m는 기준 안
    assert.equal(row('wind').segments[1].cell.tone, 'wind') // G35 강풍
    assert.equal(row('wx').segments.find((s) => s.cell.text === '-RA').cell.tone, 'precip')
  })

  it('좁은 칸 줄임 표기: 구름은 최저 실링 + 층 수, 돌풍 바람은 두 줄', () => {
    assert.deepEqual(row('cloud').segments.find((s) => s.cell.text === 'FEW010 BKN030 OVC070').cell.short, { lowest: 'BKN030', more: 2 })
    assert.deepEqual(row('wind').segments[1].cell.short, ['14018', 'G35KT'])
    assert.equal(row('wind').segments.at(-1).cell.short, null) // 돌풍 없음
  })

  it('카드는 비행조건과 TEMPO가 바꾼 요소만 담는다', () => {
    assert.equal(view.cards.length, 1)
    assert.deepEqual(view.cards[0].lines.map((l) => [l.label, l.cell.text]), [
      ['비행조건', 'IFR'],
      ['날씨', '+RA'],
      ['바람', '18025G45KT'],
      ['시정', '2000'],
      ['구름', 'SCT005 BKN020 OVC050'],
    ])
  })

  it('지난 시간은 그리지 않고, 지나간 TEMPO는 카드에서도 뺀다', () => {
    const later = buildTafForecastView(RKSI, 'RKSI', at('2026-10-18T07:30:00Z'))
    assert.equal(later.start, at('2026-10-18T07:00:00Z'))
    assert.equal(later.cards.length, 0)
  })

  it('forecast가 없거나 유효기간이 지났으면 null(기존 타임라인을 쓴다)', () => {
    assert.equal(buildTafForecastView({ header: RKSI.header, timeline: [] }, 'RKSI', ISSUE), null)
    assert.equal(buildTafForecastView(RKSI, 'RKSI', at('2026-10-18T18:30:00Z')), null)
  })
})
