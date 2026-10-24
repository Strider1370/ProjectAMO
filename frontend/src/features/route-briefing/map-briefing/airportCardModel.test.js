import test from 'node:test'
import assert from 'node:assert/strict'
import { airportCards, cardLineSegments, changeLines, chipWidth, hasAlertFlag, metarText, readCollapsedRoles, tafTextAt, writeCollapsedRoles } from './airportCardModel.js'

const metar = (display, visibility = { value: 9999 }) => ({ observation: { visibility, display } })
const briefing = {
  routeNotams: [{ airportIcao: 'RKPC' }, { airportIcao: 'RKPC' }, { airportIcao: null }],
  sections: {
    adverse: { hazards: [
      { airportScope: 'RKPC', code: 'WIND_SHEAR', label: '윈드시어' },
      { airportScope: 'RKPC', code: 'STRONG_WIND', label: '강풍' },
      { source: 'SIGMET', code: 'SEV_TURB' },
    ] },
    current: { airports: [
      { role: 'departure', icao: 'RKSI', category: 'VFR', observationTime: '2026-10-20T11:00:00Z', reportType: 'METAR',
        metar: metar({ wind: '30005KT', weather: '-', clouds: 'FEW030', temperature: '17/09' }), tafWindow: { basis: 'ETD', at: { text: '30006KT 9999 FEW030' }, changes: [], outOfRange: false } },
      { role: 'arrival', icao: 'RKPC', category: 'IFR', reportType: 'SPECI',
        metar: metar({ wind: '27007KT', weather: '-RA', clouds: 'BKN006', temperature: '18/16' }, { value: 6000 }),
        tafWindow: { basis: 'ETA', at: { text: '27007KT 9999 -RA BKN006' }, changes: [{ type: 'TEMPO', start: '2026-10-20T13:00:00Z', end: '2026-10-20T19:00:00Z', text: '30010KT 6000' }], outOfRange: false } },
      { role: 'alternate', icao: 'ZZZZ', category: 'UNKNOWN', metar: null, tafWindow: null },
    ] },
  },
}
const airportList = [{ icao: 'RKSI', lat: 37.46, lon: 126.44 }, { icao: 'RKPC', lat: 33.51, lon: 126.49 }]

test('공항 카드 3줄: METAR·TAF ±1시간 글, 역할·비행등급, 깃발(공항경보·윈드시어·NOTAM 건수)', () => {
  const [dep, arr, alt] = airportCards(briefing, { airportList, nameFor: (icao) => ({ RKSI: '인천', RKPC: '제주' })[icao] ?? icao })
  assert.equal(dep.roleLabel, '출발')
  assert.equal(dep.name, '인천')
  assert.equal(dep.metar.text, '30005KT 9999 FEW030 17/09')
  assert.deepEqual(dep.taf, { basis: 'ETD', time: null, issued: null, text: '30006KT 9999 FEW030', changes: [], outOfRange: false, previous: false })
  assert.deepEqual(dep.position, [126.44, 37.46])
  assert.equal(arr.metar.text, '27007KT 6000 -RA BKN006 18/16')
  assert.equal(arr.metar.speci, true)
  assert.equal(arr.categoryLevel, 'ifr')
  assert.deepEqual(arr.flags, { warnings: ['강풍'], windshear: true, notams: 2 })
  assert.equal(arr.taf.changes.length, 1)
  // 앱 공항 목록에 없는 공항: 자리를 못 잡고 공항 패널도 못 연다.
  assert.equal(alt.canOpenPanel, false)
  assert.equal(alt.position, null)
  assert.equal(alt.category, null)
  assert.equal(alt.taf.text, null)
})

test('출발·도착이 같은 공항은 한 장, 유효기간 밖 TAF는 그렇게 적는다', () => {
  const same = { sections: { current: { airports: [
    { role: 'departure', roles: ['departure', 'arrival'], icao: 'RKSI', tafWindow: { basis: 'ETD', at: null, changes: [], outOfRange: true } },
    { role: 'arrival', roles: ['departure', 'arrival'], icao: 'RKSI', tafWindow: null },
  ] } } }
  const cards = airportCards(same, { airportList })
  assert.equal(cards.length, 1)
  assert.equal(cards[0].roleLabel, '출발/도착')
  assert.equal(cards[0].taf.text, 'TAF 유효기간 밖')
})

test('METAR 한 줄은 METAR 표기대로 10km 이상을 9999로', () => {
  assert.equal(metarText({ observation: { visibility: { value: 10000 }, display: { wind: '12009KT', clouds: 'FEW035', temperature: '16/09' } } }), '12009KT 9999 FEW035 16/09')
})

test('변화 목록 한 줄씩', () => {
  assert.deepEqual(changeLines([{ type: 'TEMPO', start: 'a', end: 'b', text: '30010KT 6000' }, { type: '변화', start: 'c', end: null, text: 'X' }], (iso) => iso.toUpperCase()), ['TEMPO A–B 30010KT 6000', '변화 C X'])
})

test('접은 카드는 역할로 기억하고, 처음이거나 저장소가 막히면 모두 접은 상태', () => {
  const m = new Map(); const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
  assert.deepEqual(readCollapsedRoles(storage), ['departure', 'arrival', 'alternate'])
  writeCollapsedRoles(['arrival', 'bogus'], storage)
  assert.deepEqual(readCollapsedRoles(storage), ['arrival'])
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
  assert.deepEqual(readCollapsedRoles(broken), ['departure', 'arrival', 'alternate'])
  writeCollapsedRoles(['arrival'], broken)
  const card = { icao: 'RKPC', category: 'IFR', flags: { windshear: true, warnings: [], notams: 0 } }
  assert.equal(hasAlertFlag(card), true)
  assert.ok(chipWidth(card) > chipWidth({ ...card, flags: { windshear: false, warnings: [], notams: 3 } }))
})

test('과거 TAF의 기준 시각 한 줄(display 없으면 원시 값), 유효기간 밖', () => {
  const report = { header: { valid_start: '2026-10-20T06:00:00Z', valid_end: '2026-10-21T12:00:00Z' }, timeline: [
    { time: '2026-10-20T11:00:00Z', wind: { raw: '31006KT' }, visibility: { value: 9999, cavok: true }, weather: [], clouds: [] },
    { time: '2026-10-20T12:00:00Z', display: { wind: '30010KT', visibility: '6000', weather: '-RA', clouds: 'BKN010' } },
  ] }
  assert.equal(tafTextAt(report, '2026-10-20T11:20:00Z'), '31006KT CAVOK')
  assert.equal(tafTextAt(report, '2026-10-20T11:50:00Z'), '30010KT 6000 -RA BKN010')
  assert.equal(tafTextAt(report, '2026-10-22T00:00:00Z'), '그 발표의 유효기간 밖')
})

test('card lines are coloured by the airport panel rules', () => {
  const classes = Object.fromEntries(cardLineSegments('11025G38KT 1200 +TSRA BR BKN004 OVC080 FEW030CB SCT050', 'RKPC')
    .filter((segment) => segment.text.trim()).map((segment) => [segment.text, segment.className]))
  assert.equal(classes['11025G38KT'], 'is-wind')
  assert.ok(classes['1200'], '기준 미달 시정은 칠한다')
  assert.equal(classes['+TSRA'], 'is-special')
  assert.equal(classes.BR, null)
  assert.ok(classes.BKN004, '기준 미달 운고는 칠한다')
  assert.equal(classes.OVC080, null)
  assert.equal(classes.FEW030CB, 'is-special')
  assert.equal(classes.SCT050, null)
  assert.equal(cardLineSegments('-RA', 'RKSI')[0].className, 'is-precip')
  assert.equal(cardLineSegments('9999', 'RKSI')[0].className, null)
})
