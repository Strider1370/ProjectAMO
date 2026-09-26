import test from 'node:test'
import assert from 'node:assert/strict'
import { airportBriefing, weatherKo } from '../src/ai/digests/airport-briefing.js'
import { modelToolResult } from '../src/ai/model-context.js'

const cloud = (amount, baseFt, type = null) => ({ amount, baseFt, type, raw: `${amount}${String(baseFt / 100).padStart(3, '0')}${type ?? ''}` })
const wind = (direction, speed, gust = null) => ({ direction, speed, gust, unit: 'KT', variable: false, calm: false })
const state = (value) => ({ wind: null, visibilityM: null, cavok: false, clouds: null, weather: null, weatherTouched: false, cloudsTouched: false, nsw: false, nsc: false, ...value })
const at = (iso) => Date.parse(iso)

// KMA-style digest: change windows already end at the BECMG transition end.
const cheongju = {
  icao: 'RKTU', nameKo: '청주국제공항',
  metar: { observationTime: '2026-09-26T16:00:00Z', wind: wind(10, 1), visibility: { value: 9999, cavok: true }, clouds: [], weather: [] },
  taf: {
    issuedAt: '2026-09-26T11:00:00Z', validity: { start: '2026-09-26T12:00:00Z', end: '2026-09-27T18:00:00Z' },
    base: { wind: wind(90, 6), visibilityM: 9999, cavok: false, clouds: [cloud('SCT', 4000)], weather: null },
    raw: 'TAF RKTU 261100Z 2612/2718 09006KT 9999 SCT040 BECMG 2618/2619 4800 BR SCT040 BECMG 2620/2621 1600 BECMG 2623/2700 4800 BECMG 2701/2702 9999 NSW TEMPO 2706/2709 3000 -TSRA FEW030CB',
    changes: [
      { index: 0, type: 'BECMG', semantics: 'transition', start: '2026-09-26T18:00:00Z', end: '2026-09-26T19:00:00Z', state: state({ visibilityM: 4800, weather: ['BR'], weatherTouched: true, clouds: [cloud('SCT', 4000)], cloudsTouched: true }) },
      { index: 1, type: 'BECMG', semantics: 'transition', start: '2026-09-26T20:00:00Z', end: '2026-09-26T21:00:00Z', state: state({ visibilityM: 1600 }) },
      { index: 2, type: 'BECMG', semantics: 'transition', start: '2026-09-26T23:00:00Z', end: '2026-09-27T00:00:00Z', state: state({ visibilityM: 4800 }) },
      { index: 3, type: 'BECMG', semantics: 'transition', start: '2026-09-27T01:00:00Z', end: '2026-09-27T02:00:00Z', state: state({ visibilityM: 9999, nsw: true }) },
      { index: 4, type: 'TEMPO', semantics: 'temporary', start: '2026-09-27T06:00:00Z', end: '2026-09-27T09:00:00Z', state: state({ visibilityM: 3000, weather: ['-TSRA'], weatherTouched: true, clouds: [cloud('FEW', 3000, 'CB')], cloudsTouched: true }) },
    ],
  },
}

test('a BECMG under way in the question time is included, with how long the category lasts', () => {
  const b = airportBriefing(cheongju, { start: '2026-09-26T20:00:00Z', end: '2026-09-26T21:00:00Z' }, { nowMs: at('2026-09-26T16:20:00Z') })
  assert.equal(b.questionTime, '27일 5시~6시(20Z–21Z)')
  assert.deepEqual(b.forecast.inQuestionTime.map((p) => [p.when, p.visibility, p.weather, p.category, p.categoryUntil]), [
    ['27일 3시~4시(18Z–19Z) 사이에 바뀌어', '4800m', '박무', 'IFR', '27일 11시(02Z)'],
    ['27일 5시~6시(20Z–21Z) 사이에 바뀌어', '1600m', '박무', 'IFR', '27일 11시(02Z)'],
  ])
  assert.equal(b.forecast.nextCategoryChange.when, '27일 10시~11시(01Z–02Z) 사이에 바뀌어')
  assert.equal(b.forecast.nextCategoryChange.category, 'VFR')
  // A later TEMPO keeps a hazard until 18시: "언제 좋아져?" must not end at the prevailing recovery.
  assert.equal(b.forecast.allHazardsEnd, '27일 18시(09Z)')
  assert.equal(b.observation.freshness, '현재 관측(20분 전)')
})

test('NOAA-style change ends are replaced by the report DDhh/DDhh window; a wind-only TEMPO is described', () => {
  const naha = {
    icao: 'RKPC', nameKo: '제주국제공항',
    taf: {
      issuedAt: '2026-09-26T11:05:00Z', validity: { start: '2026-09-26T12:00:00Z', end: '2026-09-27T18:00:00Z' },
      base: { wind: wind(80, 12), visibilityM: 9999, cavok: false, clouds: [cloud('FEW', 1200), cloud('BKN', 2000)], weather: null },
      raw: 'TAF RKPC 261105Z 2612/2718 08012KT 9999 FEW012 BKN020 BECMG 2703/2706 02028KT TEMPO 2703/2712 02030G40KT',
      changes: [
        { index: 0, type: 'BECMG', semantics: 'transition', start: '2026-09-27T03:00:00Z', end: '2026-09-27T18:00:00Z', state: state({ wind: wind(20, 28) }) },
        { index: 1, type: 'TEMPO', semantics: 'temporary', start: '2026-09-27T03:00:00Z', end: '2026-09-27T12:00:00Z', state: state({ wind: wind(20, 30, 40) }) },
      ],
    },
  }
  const b = airportBriefing(naha, { start: '2026-09-27T06:00:00Z', end: '2026-09-27T07:00:00Z' }, { nowMs: at('2026-09-26T16:50:00Z') })
  const prevailing = b.forecast.inQuestionTime.at(-1)
  assert.equal(prevailing.when, '27일 12시~15시(03Z–06Z) 사이에 바뀌어')
  assert.equal(prevailing.wind, '20° 28kt')
  assert.deepEqual(prevailing.hazards, ['강풍'])
  assert.deepEqual(b.forecast.temporary, [{ when: '27일 12시~21시(03Z–12Z) 사이 일시적', category: 'VFR', wind: '20° 30kt 돌풍 40kt', hazards: ['강풍'] }])
  assert.equal(b.forecast.allHazardsEnd, '예보 끝(28일 3시(18Z))까지 이어짐')
  assert.equal(b.observation, '관측 자료 없음')
})

test('temporary thunderstorms, CB and IFR are hazards; codes become Korean', () => {
  const b = airportBriefing(cheongju, { start: '2026-09-27T06:00:00Z', end: '2026-09-27T07:00:00Z' }, { nowMs: at('2026-09-26T16:20:00Z') })
  const tempo = b.forecast.temporary[0]
  assert.equal(tempo.when, '27일 15시~18시(06Z–09Z) 사이 일시적')
  assert.deepEqual(tempo.hazards, ['IFR', '약한 뇌우(비 동반)', '적란운'])
  assert.equal(tempo.weather, '약한 뇌우(비 동반)')
  assert.equal(weatherKo('BR'), '박무')
  assert.equal(weatherKo('+SHRA'), '강한 소나기성 비')
  assert.equal(weatherKo('FZFG'), '어는 안개')
})

test('stale observations are named by date and never read as current; UTC display labels', () => {
  const stale = { ...cheongju, metar: { ...cheongju.metar, observationTime: '2026-02-19T10:00:00Z' } }
  const b = airportBriefing(stale, { start: '2026-09-26T16:20:00Z', end: '2026-09-26T17:20:00Z' }, { nowMs: at('2026-09-26T16:20:00Z'), timezone: 'UTC' })
  assert.equal(b.observation.freshness, '2월 19일 관측이라 현재 상태로 볼 수 없음')
  assert.equal(b.questionTime, '26일 16Z~17Z')
  assert.equal(b.forecast.issued, '26일 11Z')
})

test('app airport results give the model conclusions, not the structured TAF, and keep real gaps', () => {
  const result = { schemaVersion: '1', status: 'partial', reference: { effectiveNow: '2026-09-26T16:20:00Z' },
    coverage: [{ icao: 'RKTU', requested: { start: '2026-09-26T20:00:00Z', end: '2026-09-26T21:00:00Z' } }],
    issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED' }, { code: 'RAW_UNAVAILABLE' }, { code: 'MISSING_FIELD', path: 'base.wx' }],
    sources: [{ kind: 'taf', fetchedAt: '2026-09-26T16:10:00Z' }],
    data: { airports: [{ ...cheongju, warnings: { status: 'failed', items: [], unassessedCount: 0 } }] } }
  const before = structuredClone(result)
  const projected = modelToolResult('get_airport_weather', result, 'Asia/Seoul')
  const airport = projected.data.airports[0]
  assert.deepEqual(Object.keys(airport), ['icao', 'briefing'])
  assert.equal(airport.briefing.forecast.inQuestionTime[1].visibility, '1600m')
  assert.equal(airport.briefing.airportWarnings, '공항경보 조회 실패, 확인 안 됨')
  assert.match(projected.data.note, /다시 계산하지 말고/)
  assert.deepEqual(projected.issues.map((i) => i.code), ['MISSING_FIELD'])
  assert.equal(projected.reference.effectiveNow, '2026-09-27 01:20:00 KST')
  assert.equal(airport.briefing.reportText, undefined)
  // "TAF 원문 보여줘": the report text reaches the model only when it asked for it.
  const asked = modelToolResult('get_airport_weather', result, 'Asia/Seoul', { includeRaw: true })
  assert.equal(asked.data.airports[0].briefing.reportText.taf, cheongju.taf.raw)
  assert.deepEqual(result, before)
})
