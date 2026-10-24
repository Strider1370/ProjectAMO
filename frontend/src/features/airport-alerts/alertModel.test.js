import assert from 'node:assert/strict'
import test from 'node:test'

import { METAR_PRESETS, activeByTarget, alertView, metarHeadline, metarNow, presetMatches, ruleChips, ruleState, sigmetBandText, sigmetName } from './alertModel.js'

test('metarHeadline says what happened: 미달 for below rules, 초과 for above, 보고 for events', () => {
  assert.equal(metarHeadline([{ label: '시정', direction: 'below' }, { label: '운고', direction: 'below' }]), '시정·운고 기준 미달')
  assert.equal(metarHeadline([{ label: '돌풍', direction: 'above' }]), '돌풍 기준 초과')
  assert.equal(metarHeadline([{ label: '시정', direction: 'below' }, { label: '풍속', direction: 'above' }]), '시정·풍속 기준 도달')
  assert.equal(metarHeadline([{ label: '급변풍', direction: 'event' }]), '급변풍 보고')
})

test('SIGMET name pairs the Korean phenomenon with the bulletin abbreviation', () => {
  assert.deepEqual(sigmetName('SEV_ICE'), { name: '심한 착빙', abbr: 'SEV ICE' })
  assert.equal(sigmetBandText({ lowFt: 20000, highFt: 28000 }), 'FL200–FL280')
  assert.equal(sigmetBandText({ lowFt: 0, highFt: 10000 }), 'SFC–FL100')
  assert.equal(sigmetBandText(null), '고도 미상')
})

test('alertView turns a route SIGMET event into title, band and segment', () => {
  const v = alertView({ source: 'route', type: 'sigmet', payload: { routeName: 'RKSI→RKPC', phenomenonCode: 'SEV_ICE',
    altitudeBandFt: { lowFt: 20000, highFt: 28000 }, altitudeStatus: 'matched', intersectFromNm: 104.6, intersectToNm: 171.2 } })
  assert.equal(v.title, '심한 착빙')
  assert.equal(v.abbr, 'SEV ICE')
  assert.equal(v.band, 'FL200–FL280')
  assert.equal(v.mine, true)
  assert.equal(v.segment, '105–171NM')
  assert.equal(alertView({ source: 'airport', type: 'taf', payload: { reportType: 'AMD' } }).title, 'TAF AMD 발표')
})

test('metarNow reads category, visibility and the lowest BKN/OVC layer as ceiling', () => {
  const now = metarNow({ header: { observation_time: '2026-10-24T05:00:00Z' }, observation: {
    visibility: { value: 1200 }, clouds: [{ amount: 'SCT', base: 300 }, { amount: 'BKN', base: 400 }, { amount: 'OVC', base: 1000 }],
    wind: { speed: 12, gust: null }, temperature: { air: 18 } } }, 'RKPC')
  assert.equal(now.visibilityM, 1200)
  assert.equal(now.ceilingFt, 400)
  assert.equal(now.windKt, 12)
  assert.ok(['IFR', 'LIFR'].includes(now.category))
  assert.equal(metarNow({ observation: { visibility: { cavok: true }, clouds: [] }, cavok_flag: true }, 'RKSI').ceilingFt, null)
})

test('ruleState marks a rule hit or clear against the current observation', () => {
  const now = { visibilityM: 1200, ceilingFt: null, windKt: 8, gustKt: null, tempC: 14 }
  assert.equal(ruleState('visibility', { enabled: true, threshold: 1500 }, now), 'hit')
  assert.equal(ruleState('ceiling', { enabled: true, threshold: 500 }, now), 'ok')
  assert.equal(ruleState('wind', { enabled: true, threshold: 25 }, now), 'ok')
  assert.equal(ruleState('wind', { enabled: false, threshold: 25 }, now), null)
})

test('presets fill both visibility and ceiling and are recognised again', () => {
  const vfr = METAR_PRESETS.find((p) => p.id === 'vfr')
  assert.ok(presetMatches({ visibility: { enabled: true, threshold: vfr.visibility }, ceiling: { enabled: true, threshold: vfr.ceiling } }, vfr))
  assert.ok(!presetMatches({ visibility: { enabled: true, threshold: 1500 }, ceiling: { enabled: true, threshold: 500 } }, vfr))
})

test('ruleChips and activeByTarget summarise watches for the cards', () => {
  const chips = ruleChips({ visibility: { enabled: true, threshold: 1500 }, ceiling: { enabled: false }, wind: { enabled: true, threshold: 25 },
    gust: { enabled: true, threshold: 35 }, tafNew: { enabled: true }, tafAmd: { enabled: true }, lightning: { enabled: true, radiusKm: 10 } })
  assert.deepEqual(chips.map((c) => c.text), ['<1500m', '25 · G35kt', 'TAF·AMD', '낙뢰 10km'])
  const { airports, routes } = activeByTarget([
    { source: 'airport', airportIcao: 'RKPC', active: true }, { source: 'airport', airportIcao: 'RKSI', active: false },
    { source: 'route', routeId: 7, active: true }])
  assert.deepEqual([...airports.keys()], ['RKPC'])
  assert.deepEqual([...routes.keys()], [7])
})
