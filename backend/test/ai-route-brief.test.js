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

const profile = { points: [{ distanceNm: 0, altitudeFt: 59 }, { distanceNm: 40, altitudeFt: 24000 }, { distanceNm: 250, altitudeFt: 24000 }, { distanceNm: 311, altitudeFt: 118 }], todNm: 250, vfr: false }
const withProfile = structuredClone(briefing)
Object.assign(withProfile.sections.enroute, { plannedCruiseAltitudeFt: 24000, profile })
const row = (i) => [i.phaseLabel, i.label, i.severity, i.where, i.procedure, i.amount, i.position]

test('route items are grouped by the altitude profile (상승 → 순항 → 강하), not by procedure names', () => {
  const s = routeWeatherSummary(withProfile)
  assert.deepEqual(s.items.map(row), [
    ['상승', '난류', 'LIGHT', 'RWY14L→TD040', 'BULTI2T', '3NM', '출발 0~6NM'],
    // The STAR's first leg is still at cruise before TOD, so it reads as 순항.
    ['순항 FL240', '착빙', 'LIGHT', 'DOTOL→PC761', 'DOTOL2M', '8NM', '출발 213~229NM'],
    ['강하', '착빙', 'MODERATE', 'PC685→TOKIN', null, 'MODERATE 19NM, LIGHT 11NM', '출발 271~301NM'],
  ])
  const descent = s.items[2]
  assert.equal(descent.level, '주의')
  assert.deepEqual(descent.highlight, { from: 'PC685', to: 'TOKIN', startNm: 271, endNm: 301 })
  assert.equal(descent.legDetails.length, 3)
  assert.equal(s.cruiseWind, '평균 정풍 11kt')
})

test('a point interval reads as a position, and tiny exposures never leave an empty row', () => {
  const noLegTurbulence = structuredClone(withProfile)
  noLegTurbulence.sections.enroute.procedures[0].legs[0].turbulence = { peakLevel: null, exposures: [] }
  noLegTurbulence.sections.enroute.model.elements[0].intervals = [{ startNm: 298, endNm: 298.4, level: '중' }]
  noLegTurbulence.sections.enroute.procedures[1].legs[0].icing = { peakLevel: 1, exposures: [{ level: 1, distanceNm: 0.3 }] }
  const s = routeWeatherSummary(noLegTurbulence)
  const turbulence = s.items.find((i) => i.kind === 'turbulence')
  assert.deepEqual(row(turbulence), ['강하', '난류', 'MODERATE', 'DUKAL 부근', 'RWY25 접근', null, '출발 298NM'])
  assert.equal(turbulence.note, '10,000ft 이하')
  assert.equal(s.items.find((i) => i.where === 'DOTOL→PC761').amount, '1NM 미만')
  assert.ok(s.coverage.some((c) => c.includes('10,000ft 위')))
  assert.equal(routeWeatherSummary({ sections: {} }).available, false)
})

test('procedure-less IFR climbs and descends by the profile; VFR splits cruise by planned altitude', () => {
  const ifr = structuredClone(withProfile)
  Object.assign(ifr.sections.enroute, { procedures: [], legs: [leg('RKSS', 'BULTI', 0, 30, [{ level: 1, distanceNm: 12 }]), leg('BULTI', 'RKPC', 30, 311)] })
  assert.deepEqual(routeWeatherSummary(ifr).items.filter((i) => i.kind === 'icing').map(row), [['상승', '착빙', 'LIGHT', 'RKSS→BULTI', null, '12NM', '출발 0~30NM']])
  const vfr = structuredClone(briefing)
  vfr.meta.flightRule = 'VFR'
  Object.assign(vfr.sections.enroute, { plannedCruiseAltitudeFt: 4500, procedures: [],
    profile: { points: [{ distanceNm: 0, altitudeFt: 59 }, { distanceNm: 20, altitudeFt: 4500 }, { distanceNm: 150, altitudeFt: 4500 }, { distanceNm: 200, altitudeFt: 6500 }, { distanceNm: 300, altitudeFt: 6500 }, { distanceNm: 326, altitudeFt: 118 }], todNm: null, vfr: true },
    legs: [leg('RKSS', 'WP1', 0, 20), leg('WP1', 'WP2', 20, 150, [], [{ level: 2, distanceNm: 12 }]), leg('WP2', 'WP3', 150, 200), leg('WP3', 'WP4', 200, 300, [{ level: 1, distanceNm: 8 }])] })
  const items = routeWeatherSummary(vfr).items
  assert.deepEqual(items.map((i) => [i.phaseLabel, i.label, i.note]), [['순항 4,500ft', '난류', null], ['순항 6,500ft', '착빙', null]])
})

test('the brief has a code-made summary, a header and a body grouped by phase with the wind in cruise', () => {
  const airport = (icao, nameKo, category, visibilityM) => ({ icao, nameKo, metar: null, taf: { issuedAt: '2026-09-27T05:00:00Z',
    validity: { start: '2026-09-27T00:00:00Z', end: '2026-09-28T06:00:00Z' },
    base: { wind: { direction: 270, speed: 6, unit: 'KT' }, visibilityM, cavok: false, clouds: [], weather: category === 'IFR' ? ['BR'] : [] }, changes: [] } })
  const brief = buildRouteBrief({
    flight: { ...briefing.meta, plannedCruiseAltitudeFt: 24000, distanceNm: 311, tasKt: 450, etaBasis: 'existing-route-distance-over-tas' },
    airports: [airport('RKSS', '김포국제공항', 'VFR', 9999), airport('RKPC', '제주국제공항', 'IFR', 3000)],
    routeSummary: routeWeatherSummary(withProfile), nowMs: Date.parse('2026-09-27T03:00:00Z'), timezone: 'Asia/Seoul',
    details: { routeText: 'BULTI Y711 DOTOL', procedures: [], publicationId: '2026-06-25', basis: null } })
  assert.deepEqual(brief.header, { title: 'RKSS → RKPC · IFR · FL240 · TAS 450kt', distance: '311NM',
    times: '27일 16:00 → 16:32 KST (07:00Z → 07:32Z)', etaNote: '바람 미반영' })
  assert.match(brief.summary, /^제주 도착 시간대에 주의할 예보\(.+\)가 있어요\. 항로에서는 강하 중 착빙 MODERATE 1곳에 주의가 필요해요\. 그 밖에 LIGHT 난류 1곳\(총 3NM\), LIGHT 착빙 1곳\(총 8NM\)도 있어요\. FL240 순항 구간 난류 자료는 없어요\.$/)
  assert.deepEqual(brief.body.enroute.phases.map((g) => [g.label, g.items.length, g.wind]),
    [['상승', 1, null], ['순항 FL240', 1, '평균 정풍 11kt'], ['강하', 1, null]])
  assert.equal(brief.body.departure.title, '출발 · 김포 RKSS')
  assert.match(brief.body.arrival.status, /^IFR · 시정 3000m/)
  assert.equal(brief.details.routeText, 'BULTI Y711 DOTOL')
  assert.deepEqual(brief.speak.map((i) => [i.section, i.level]), [['항로', '주의'], ['항로', '바람'], ['도착', '주의']])
  assert.equal(brief.speak[1].text, '순항 FL240 평균 정풍 11kt')
  assert.equal(brief.arrival.questionTime, '27일 15시~17시(06Z–08Z)')
})

test('the model reads the brief facts without highlight ranges or the rendered body; the card keeps them', () => {
  const brief = buildRouteBrief({ flight: { ...briefing.meta, plannedCruiseAltitudeFt: 24000 }, airports: [],
    routeSummary: routeWeatherSummary(withProfile), nowMs: Date.parse('2026-09-27T03:00:00Z') })
  const result = { schemaVersion: '1', status: 'partial', reference: { briefingRef: 'b1' }, issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED' }],
    data: { brief, notamCount: 3, detailSections: ['enroute'] } }
  const projected = modelToolResult('get_route_briefing', result, 'Asia/Seoul')
  assert.match(projected.data.brief.note, /출발 5NM.*위치이지 길이가 아니다/)
  assert.ok(projected.data.brief.speak.every((i) => !('highlight' in i)))
  assert.equal(projected.data.brief.body, undefined)
  assert.equal(projected.data.brief.summary, brief.summary)
  assert.ok(result.data.brief.speak[0].highlight)
  assert.deepEqual(projected.data.brief.gaps.slice(0, 1), ['출발 공항 자료 없음'])
  assert.deepEqual(projected.issues, [])
})

test('plan distances are named: whole route vs the route-text stretch used for ETA', () => {
  const projected = modelToolResult('plan_route', { schemaVersion: '1', status: 'ok', reference: {}, issues: [],
    data: { planningState: 'planned', routeText: 'BULTI Y711 DOTOL', distanceNm: 243.55, geometryDistanceNm: 311.32 } }, 'Asia/Seoul')
  assert.equal(projected.data.distance, '전체 311NM(SID·STAR·접근 포함), 이 중 경로 문자열 구간 244NM(ETA 추정에 사용)')
  assert.equal(projected.data.distanceNm, undefined)
  assert.equal(projected.data.geometryDistanceNm, undefined)
})

test('the summary covers route warnings, typhoons, airport warnings, NOTAM conflicts and unchecked data', () => {
  const quietLegs = [leg('RKSS', 'BULTI', 0, 30), leg('BULTI', 'NULDI', 30, 290), leg('NULDI', 'RKPC', 290, 326)]
  const make = ({ hazards = [], conflicts = 0, model = true, ktg = true } = {}) => ({
    meta: { ...briefing.meta, flightRule: 'IFR' }, routeConflicts: Array.from({ length: conflicts }, () => ({})),
    sections: { adverse: { hazards }, enroute: { plannedCruiseAltitudeFt: 29000, legs: quietLegs, procedures: [],
      profile: { points: [{ distanceNm: 0, altitudeFt: 59 }, { distanceNm: 60, altitudeFt: 29000 }, { distanceNm: 229, altitudeFt: 29000 }, { distanceNm: 326, altitudeFt: 118 }], todNm: 229 },
      model: model ? { runs: { kim: {}, ...(ktg ? { ktg: {} } : {}) }, elements: [] } : null } } })
  const taf = (visibilityM, weather = []) => ({ issuedAt: '2026-09-27T05:00:00Z', validity: { start: '2026-09-27T00:00:00Z', end: '2026-09-28T06:00:00Z' },
    base: { wind: { direction: 270, speed: 6, unit: 'KT' }, visibilityM, cavok: false, clouds: [], weather }, changes: [] })
  const summary = (options, { arrival = taf(9999), modelTimeStatus = 'within_available_frames' } = {}) => {
    const b = make(options)
    return buildRouteBrief({ flight: { ...b.meta, plannedCruiseAltitudeFt: 29000, distanceNm: 326 },
      airports: [{ icao: 'RKSS', nameKo: '김포국제공항', metar: null, taf: taf(9999) }, { icao: 'RKPC', nameKo: '제주국제공항', metar: null, taf: arrival }],
      routeSummary: routeWeatherSummary(b), nowMs: Date.parse('2026-09-27T03:00:00Z'), timezone: 'Asia/Seoul', modelTimeStatus }).summary
  }
  const sigmet = (code, encounter, verticalKnown, startNm, endNm) => ({ source: 'SIGMET', code, label: code, encounter, verticalKnown, routeIntervalNm: { startNm, endNm } })
  const typhoon = (encounter) => ({ source: 'TYPHOON', code: 'TC', label: '18호 태풍 미탁', encounter, verticalKnown: false, routeIntervalNm: encounter === 'on' ? { startNm: 250, endNm: 326 } : null })

  assert.equal(summary(), '김포·제주 모두 VFR이에요. 항로에 주의할 착빙·난류·경보는 없어요. FL290 순항 구간 난류 자료는 없어요.')
  assert.match(summary({ hazards: [sigmet('EMBD_TS', 'on', true, 120, 160)] }), /^항로가 SIGMET 구름 속 뇌우 구간\(출발 120~160NM, 계획 고도 포함\)을 지나요\./)
  assert.match(summary({ hazards: [sigmet('SEV_ICE', 'on', false, 200, 240)] }), /SIGMET 착빙 SEVERE 구간\(출발 200~240NM, 고도 미확인\)을 지나요/)
  assert.match(summary({ hazards: [sigmet('SEV_TURB', 'nearby', true, 80, 110)] }), /다른 고도 SIGMET 난류 SEVERE 1건만 있어요/)
  assert.match(summary({ hazards: [{ ...sigmet('MOD_TURB', 'on', true, 40, 70), source: 'AIRMET' }] }), /항로에서는 AIRMET 난류 MODERATE 1건에 주의가 필요해요/)
  assert.match(summary({ hazards: [typhoon('on')] }), /^항로가 18호 태풍 미탁 영향권\(출발 250~326NM\)을 지나요\./)
  assert.match(summary({ hazards: [typhoon('nearby')] }), /18호 태풍 미탁은 경로 밖에 있어요\./)
  assert.match(summary({ hazards: [{ source: '공항경보', code: 'WIND', label: '강풍', encounter: 'on', airportScope: 'RKPC', role: 'arrival', level: 'amber' }] }, { arrival: taf(3000, ['BR']) }),
    /^제주 도착 시간대에 공항경보\(강풍\)와 주의할 예보\(.+\)가 있어요\./)
  assert.match(summary({ conflicts: 2 }), /NOTAM 경로 저촉 2건만 있어요/)
  assert.match(summary({ model: false }), /항로 착빙·난류는 확인하지 못했어요\.$/)
  assert.match(summary({ ktg: false }), /난류 자료가 없어 항로 난류는 확인하지 못했어요\.$/)
  assert.match(summary({}, { modelTimeStatus: 'outside_available_frames' }), /수치예보 범위 밖이라 항로 착빙·난류는 일부만 확인했어요\.$/)
})
