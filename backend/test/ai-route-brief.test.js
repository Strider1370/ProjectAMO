import test from 'node:test'
import assert from 'node:assert/strict'
import { routeWeatherSummary } from '../src/ai/digests/route-summary.js'
import { buildRouteBrief } from '../src/ai/digests/route-brief.js'
import { modelToolResult } from '../src/ai/model-context.js'

const leg = (from, to, startNm, endNm, icing = [], turbulence = [], windKt = -9) => ({ from, to, startNm, endNm, distanceNm: endNm - startNm,
  wind: { meanComponentKt: windKt }, icing: { peakLevel: Math.max(0, ...icing.map((e) => e.level)), exposures: icing },
  turbulence: { peakLevel: turbulence.length ? Math.max(...turbulence.map((e) => e.level)) : null, exposures: turbulence }, hazards: [] })
// Shape of the production 김포→제주 Y711 FL240 briefing (2026-09-27 16:00 KST departure).
const briefing = {
  meta: { departureAirport: 'RKSS', arrivalAirport: 'RKPC', flightRule: 'IFR', etd: '2026-09-27T07:00:00.000Z', eta: '2026-09-27T07:32:28.400Z' },
  routeConflicts: [],
  sections: {
    adverse: { hazards: [] },
    enroute: {
      model: { runs: { kim: { tmfc: '2026092618', hf: 12 }, ktg: { tmfc: '2026092618', hf: 12 } },
        elements: [{ kind: 'turbulence', label: '난류', intervals: [{ startNm: 292, endNm: 309, level: '중' }] }] },
      legs: [leg('BULTI', 'MEKIL', 64, 74, [{ level: 0, distanceNm: 10 }], [], -9), leg('NULDI', 'DOTOL', 203, 213, [{ level: 0, distanceNm: 10 }], [], -14)],
      procedures: [
        { type: 'SID', id: 'RKSS-SID-BULTI2T', legs: [leg('RWY14L', 'TD040', 0, 6, [{ level: 0, distanceNm: 6 }], [{ level: 1, distanceNm: 3 }])] },
        { type: 'STAR', id: 'RKPC-STAR-DOTOL2M', legs: [
          leg('DOTOL', 'PC761', 213, 229, [{ level: 1, distanceNm: 8 }]),
          leg('PC685', 'LIDVO', 271, 276, [{ level: 2, distanceNm: 5 }]),
          leg('LIDVO', 'DUKAL', 276, 296, [{ level: 2, distanceNm: 14 }, { level: 1, distanceNm: 6 }]),
        ] },
        { type: 'IAP', id: 'DUKAL-RWY25-REP', legs: [leg('DUKAL', 'TOKIN', 296, 301, [{ level: 1, distanceNm: 5 }])] },
      ],
    },
  },
}

test('stretches merge consecutive hazardous legs in flight order, ranked and highlightable', () => {
  const s = routeWeatherSummary(briefing)
  assert.deepEqual(s.items.map((i) => [i.level, i.text]), [
    ['참고', '출발 SID BULTI2T RWY14L→TD040(0~6NM): 난류 LIGHT 3NM'],
    ['주의', '도착 STAR DOTOL2M DOTOL→DUKAL(213~296NM): 착빙 MODERATE 19NM, LIGHT 14NM'],
    ['참고', '접근 REP DUKAL→TOKIN(296~301NM): 착빙 LIGHT 5NM'],
  ])
  const star = s.items[1]
  assert.deepEqual(star.highlight, { from: 'DOTOL', to: 'DUKAL', startNm: 213, endNm: 296 })
  assert.deepEqual(star.legDetails, ['DOTOL→PC761(213~229NM): 착빙 LIGHT 8NM', 'PC685→LIDVO(271~276NM): 착빙 MODERATE 5NM', 'LIDVO→DUKAL(276~296NM): 착빙 MODERATE 14NM, LIGHT 6NM'])
  assert.equal(s.cruiseWind, '평균 정풍 11kt')
})

test('profile turbulence is added only when legs show none, as a 10,000 ft climb/descent stretch', () => {
  const noLegTurbulence = structuredClone(briefing)
  noLegTurbulence.sections.enroute.procedures[0].legs[0].turbulence = { peakLevel: null, exposures: [] }
  const s = routeWeatherSummary(noLegTurbulence)
  const turbulence = s.items.find((i) => i.kind === 'turbulence')
  assert.equal(turbulence.level, '주의')
  assert.match(turbulence.text, /^난류 MODERATE 292~309NM\(도착 STAR DOTOL2M LIDVO 부근부터, 10,000ft 이하 상승·강하 중\)$/)
  assert.deepEqual(turbulence.highlight, { startNm: 292, endNm: 309 })
  assert.ok(s.coverage.some((c) => c.includes('10,000ft 위')))
  assert.equal(routeWeatherSummary({ sections: {} }).available, false)
})

test('brief speaks 출발 → 항로(바람 포함) → 도착, keeps LIGHT for the card and uses ETD/ETA ±1h', () => {
  const airport = (icao, category, visibilityM) => ({ icao, metar: null, taf: { issuedAt: '2026-09-27T05:00:00Z',
    validity: { start: '2026-09-27T00:00:00Z', end: '2026-09-28T06:00:00Z' },
    base: { wind: { direction: 270, speed: 6, unit: 'KT' }, visibilityM, cavok: false, clouds: [], weather: category === 'IFR' ? ['BR'] : [] }, changes: [] } })
  const brief = buildRouteBrief({
    flight: { ...briefing.meta, plannedCruiseAltitudeFt: 24000, distanceNm: 311 },
    airports: [airport('RKSS', 'VFR', 9999), airport('RKPC', 'IFR', 3000)],
    routeSummary: routeWeatherSummary(briefing), nowMs: Date.parse('2026-09-27T03:00:00Z'), timezone: 'Asia/Seoul' })
  assert.equal(brief.flight, 'RKSS→RKPC IFR FL240, 출발 27일 16:00(07:00Z), 도착 27일 16:32(07:32Z), 311NM')
  assert.deepEqual(brief.speak.map((i) => [i.section, i.level]), [['항로', '주의'], ['항로', '바람'], ['도착', '주의']])
  assert.equal(brief.speak[1].text, '순항 FL240 평균 정풍 11kt')
  assert.match(brief.speak[2].text, /시정 3000m.*\(IFR\)/)
  assert.equal(brief.quiet.출발, 'VFR, 시정 10km 이상, 바람 270° 6kt, 특이사항 없음')
  assert.equal(brief.quiet.도착, null)
  assert.deepEqual(brief.cardOnly.map((i) => i.level), ['참고', '참고'])
  assert.equal(brief.arrival.questionTime, '27일 15시~17시(06Z–08Z)')
})

test('the model reads the brief without highlight ranges; the card keeps them', () => {
  const brief = buildRouteBrief({ flight: { ...briefing.meta, plannedCruiseAltitudeFt: 24000 }, airports: [],
    routeSummary: routeWeatherSummary(briefing), nowMs: Date.parse('2026-09-27T03:00:00Z') })
  const result = { schemaVersion: '1', status: 'partial', reference: { briefingRef: 'b1' }, issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED' }],
    data: { brief, notamCount: 3, detailSections: ['enroute'] } }
  const projected = modelToolResult('get_route_briefing', result, 'Asia/Seoul')
  assert.match(projected.data.brief.note, /출발 → 항로 → 도착/)
  assert.ok(projected.data.brief.speak.every((i) => !('highlight' in i)))
  assert.ok(result.data.brief.speak[0].highlight)
  assert.deepEqual(projected.data.brief.gaps.slice(0, 1), ['출발 공항 자료 없음'])
  assert.deepEqual(projected.issues, [])
})
