import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTafAtEta, alternateRequired, buildDestination, metricsAt, weatherAt, tafWindow } from '../src/briefing/taf-window.js'

const taf = {
  header: { icao: 'RKPC' },
  timeline: [
    { time: '2026-06-26T09:00:00Z', visibility:{value:9999,cavok:false}, clouds:[{amount:'SCT',base:3000,raw:'SCT030'}], display:{wind:'18010KT',clouds:'SCT030'} },
    { time: '2026-06-26T10:00:00Z', visibility:{value:3000,cavok:false}, clouds:[{amount:'BKN',base:600,raw:'BKN006'}], display:{wind:'14020KT',clouds:'BKN006'} },
    { time: '2026-06-26T11:00:00Z', visibility:{value:9999,cavok:false}, clouds:[{amount:'SCT',base:2000,raw:'SCT020'}], display:{wind:'18010KT',clouds:'SCT020'} },
  ],
}

test('selectTafAtEta picks the timeline entry nearest ETA', () => {
  const e = selectTafAtEta(taf, '2026-06-26T10:05:00Z')
  assert.equal(e.time, '2026-06-26T10:00:00Z')
  assert.equal(e.category, 'IFR')
})

test('alternateRequired true when ETA window breaches 2000ft/5000m', () => {
  const r = alternateRequired(taf, '2026-06-26T10:05:00Z')
  assert.equal(r.required, true)
})

test('alternateRequired false when ETA window is good', () => {
  const r = alternateRequired(taf, '2026-06-26T09:00:00Z')
  assert.equal(r.required, false)
})

test('selectTafAtEta returns null when no TAF', () => {
  assert.equal(selectTafAtEta(null, '2026-06-26T10:00:00Z'), null)
})

const richTaf = {
  header: { icao: 'RKPC', issued: '2026-06-26T05:00:00Z', valid_start: '2026-06-26T06:00:00Z', valid_end: '2026-06-27T12:00:00Z' },
  base: { wind: { direction: 70, speed: 8, calm: false }, vis: 9999, cavok_flag: false, clouds: [{ amount: 'SCT', base: 3000, raw: 'SCT030' }], wx: [] },
  change_groups: [
    { type: 'TEMPO', start: '2026-06-26T08:00:00Z', end: '2026-06-26T12:00:00Z', wind: null, vis: 3200, cavok_flag: false, clouds_touched: true, clouds: [{ amount: 'BKN', base: 800, raw: 'BKN008' }], wx_touched: true, wx: [{ raw: '-RA' }] },
  ],
  timeline: taf.timeline,
}

test('buildDestination: periods (base+TEMPO), categories, timeline, raw, alternate', () => {
  const altTaf = { header: { icao: 'RKPU', valid_start: '2026-06-26T06:00:00Z', valid_end: '2026-06-27T12:00:00Z' }, timeline: [
    { time: '2026-06-26T11:00:00Z', visibility: { value: 9999, cavok: false }, clouds: [{ amount: 'SCT', base: 4000 }] },
  ] }
  const d = buildDestination(richTaf, '2026-06-26T10:00:00Z', { alternateTaf: altTaf, flightRule: 'IFR' })
  assert.equal(d.icao, 'RKPC')
  assert.equal(d.periods.length, 2)
  assert.equal(d.periods[0].type, 'base')
  assert.equal(d.periods[0].category, 'VFR')
  assert.equal(d.periods[1].type, 'TEMPO')
  assert.equal(d.periods[1].category, 'IFR') // vis 3200 → IFR, ceiling 800 → IFR
  assert.equal(d.periods[1].vis, '3.2km')
  assert.ok(d.timeline.length === 3)
  assert.ok(d.raw.startsWith('TAF RKPC'))
  assert.equal(d.alternate.icao, 'RKPU')
  assert.equal(d.alternate.category, 'VFR')
})

test('buildDestination: raw uses real TAC tokens (9999·07008KT·BKN008), etaActive marks TEMPO+prevailing', () => {
  const d = buildDestination(richTaf, '2026-06-26T10:00:00Z', { alternateIcao: 'RKPU', flightRule: 'IFR' })
  assert.match(d.raw, /07008KT/)   // 070/08 → 07008KT
  assert.match(d.raw, /9999/)      // ≥10km → 9999
  assert.match(d.raw, /TEMPO \d{4}\/\d{4} 3200 -RA BKN008/) // 변경 요소만
  assert.doesNotMatch(d.raw, /≥10km|\/06kt|km/) // 표시 포맷 잔재 없음
  assert.equal(d.etaOutOfRange, false)
  assert.equal(d.periods.find((p) => p.type === 'TEMPO').etaActive, true)
  assert.equal(d.periods.find((p) => p.type === 'base').etaActive, true) // BECMG 없음 → base가 지속조건
})

test('buildDestination: ETA past TAF validity → etaOutOfRange, no highlight', () => {
  const d = buildDestination(richTaf, '2026-06-28T00:00:00Z', { flightRule: 'IFR' })
  assert.equal(d.etaOutOfRange, true)
  assert.equal(d.periods.some((p) => p.etaActive), false)
})

test('buildDestination: alternate shows even without TAF (noTaf)', () => {
  const d = buildDestination(richTaf, '2026-06-26T10:00:00Z', { alternateIcao: 'RKPU', flightRule: 'IFR' })
  assert.equal(d.alternate.icao, 'RKPU')
  assert.equal(d.alternate.noTaf, true)
})

// ── 알림용 시각 조회 — 유효기간 밖을 물으면 조용히 엉뚱한 값을 주면 안 된다 ──

test('metricsAt: 유효기간을 벗어난 시각이면 null — 엉뚱한 시각 값을 조용히 주면 안 된다', () => {
  const t = {
    header: { icao: 'RKSI' },
    timeline: [
      { time: '2026-08-20T02:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
      { time: '2026-08-20T03:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
      { time: '2026-08-20T04:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
    ],
  }
  assert.ok(metricsAt(t, '2026-08-20T03:20:00Z'), '구간 안이면 준다')
  assert.equal(metricsAt(t, '2026-08-20T09:00:00Z'), null, '5시간 밖이면 주지 않는다')
})

test('weatherAt: 같은 항목의 병합된 현상을 준다', () => {
  const wx = [{ raw: 'FG', intensity: 'MODERATE', descriptor: null, phenomena: ['FG'] }]
  const t = {
    header: { icao: 'RKSI' },
    timeline: [{ time: '2026-08-20T03:00:00Z', visibility: { value: 400 }, clouds: [], weather: wx }],
  }
  assert.deepEqual(weatherAt(t, '2026-08-20T03:10:00Z'), wx)
  assert.deepEqual(weatherAt(t, '2026-08-20T09:00:00Z'), [], '유효기간 밖이면 빈 배열')
})

test('공항 카드 TAF ±1시간: 기준 시각 우세 예보 + 앞뒤 1시간의 다른 예보(시간별 변화·변화군), 유효기간 밖 표시', () => {
  const windowTaf = {
    header: { icao: 'RKPC', valid_start: '2026-06-26T09:00:00Z', valid_end: '2026-06-27T09:00:00Z', issued: '2026-06-26T05:00:00Z' },
    timeline: taf.timeline.map((entry) => ({ ...entry, display: { ...entry.display, visibility: String(entry.visibility.value) } })),
    change_groups: [
      { type: 'TEMPO', start: '2026-06-26T10:30:00Z', end: '2026-06-26T13:00:00Z', wind: { raw: '20015G25KT' }, vis: 4000, wx: [{ raw: 'SHRA' }], clouds: [{ raw: 'BKN010' }] },
      { type: 'BECMG', start: '2026-06-26T14:00:00Z', end: '2026-06-26T15:00:00Z', wind: { raw: '22010KT' } },
    ],
  }
  const window = tafWindow(windowTaf, '2026-06-26T10:10:00Z')
  assert.equal(window.at.time, '2026-06-26T10:00:00Z')
  assert.equal(window.at.text, '14020KT 3000 BKN006')
  assert.deepEqual(window.changes.map((c) => [c.type, c.text]), [
    ['TEMPO', '20015G25KT 4000 SHRA BKN010'],
    ['변화', '18010KT 9999 SCT020'],
  ])
  assert.deepEqual(tafWindow(windowTaf, '2026-06-28T00:00:00Z'), { at: null, changes: [], outOfRange: true, issued: '2026-06-26T05:00:00Z' })
  assert.equal(tafWindow(null, '2026-06-26T10:00:00Z'), null)
})

test('공항 카드 TAF: 새 TAF가 아직 발효 전이면 그 시각에 유효한 직전 발표를 쓴다', () => {
  const latest = {
    header: { icao: 'RKSI', issued: '2026-10-20T11:00:00Z', valid_start: '2026-10-20T12:00:00Z', valid_end: '2026-10-21T18:00:00Z' },
    timeline: [{ time: '2026-10-20T12:00:00Z', display: { wind: '30008KT', visibility: '9999', clouds: 'FEW030' } }],
    previous: {
      header: { issued: '2026-10-20T05:00:00Z', valid_start: '2026-10-20T06:00:00Z', valid_end: '2026-10-21T12:00:00Z' },
      // 직전 발표 보관본은 display 없이 원시 값만 있다.
      timeline: [{ time: '2026-10-20T11:00:00Z', wind: { raw: '31006KT' }, visibility: { value: 9999, cavok: true }, weather: [], clouds: [] }],
    },
  }
  const window = tafWindow(latest, '2026-10-20T11:30:00Z')
  assert.equal(window.previous, true)
  assert.equal(window.at.text, '31006KT CAVOK')
  assert.equal(window.issued, '2026-10-20T05:00:00Z')
  assert.equal(tafWindow({ ...latest, previous: null }, '2026-10-20T11:30:00Z').outOfRange, true)
})
