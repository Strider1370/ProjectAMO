import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHazardRibbon } from '../src/briefing/hazard-ribbon.js'

// 330NM, FL250 순항. 0→50NM 상승, 300(TOD)→330 강하. ETD 00:00Z, ETA 00:44Z.
const flightPlanProfile = {
  points: [
    { distanceNm: 0, altitudeFt: 0 }, { distanceNm: 50, altitudeFt: 25000 },
    { distanceNm: 300, altitudeFt: 25000 }, { distanceNm: 330, altitudeFt: 0 },
  ],
  tod: { distanceNm: 300 },
}
const markers = [
  { label: 'RKSI', distanceNm: 0 }, { label: 'BOPTA', distanceNm: 42 }, { label: 'DALSU', distanceNm: 180 },
  { label: 'DOTOL', distanceNm: 270 }, { label: 'RKPC', distanceNm: 330 },
]
const base = { flightPlanProfile, markers, cruiseAltitudeFt: 25000, totalDistanceNm: 330, etd: '2026-10-20T00:00:00Z', eta: '2026-10-20T00:44:00Z' }
const enrouteModel = {
  elements: [{ kind: 'turbulence', intervals: [{ startNm: 42, endNm: 180, level: '심' }, { startNm: 320, endNm: 327, level: '중' }] }],
  status: { turbulence: 'found', icing: 'none' },
  runs: {},
}
const sigmet = (code, startNm, endNm, encounter, extra = {}) => ({ source: 'SIGMET', code, label: code, encounter, routeIntervalNm: { startNm, endNm }, bandFt: { lowFt: 14000, highFt: 20000 }, ...extra })

test('builds always-on rows with model segments, names, phases and passing times', () => {
  const ribbon = buildHazardRibbon({ ...base, enrouteModel, convection: { status: 'unavailable', intervals: [] } })
  assert.deepEqual(ribbon.rows.map((row) => [row.key, row.status]), [['turbulence', 'found'], ['icing', 'none'], ['convection', 'unavailable']])
  const [cruise, approach] = ribbon.rows[0].model
  assert.equal(cruise.level, 'SEV')
  assert.equal(cruise.phase, 'cruise')
  assert.deepEqual([cruise.from, cruise.to], ['BOPTA', 'DALSU'])
  assert.equal(cruise.passFrom, '2026-10-20T00:05:36.000Z')
  assert.equal(approach.phase, 'descent')
  // 이름 붙은 지점 사이가 아닌 접근 구간은 "RKPC → RKPC"가 아니라 앞 지점(TOD)부터.
  assert.deepEqual([approach.from, approach.to], ['TOD', 'RKPC'])
  assert.ok(approach.altitudeFt.from > approach.altitudeFt.to)
  assert.equal(ribbon.windApplied, false)
})

test('assigns SIGMET/AIRMET/typhoon frames to phenomenon rows and skips airport warnings and VA', () => {
  const hazards = [
    sigmet('SEV_ICE', 100, 200, 'nearby'),
    sigmet('EMBD_TS', 150, 220, 'on'),
    { source: 'AIRMET', code: 'SFC_VIS', label: 'SFC VIS', encounter: 'nearby', routeIntervalNm: { startNm: 120, endNm: 210 } },
    { source: 'TYPHOON', code: 'TC', encounter: 'on', routeIntervalNm: { startNm: 300, endNm: 330 } },
    sigmet('VA', 10, 20, 'on'),
    { source: '공항경보', code: 'WIND_SHEAR', airportScope: 'RKPC', encounter: 'on', routeIntervalNm: null },
  ]
  const ribbon = buildHazardRibbon({ ...base, enrouteModel, hazards })
  const byKey = Object.fromEntries(ribbon.rows.map((row) => [row.key, row]))
  assert.deepEqual(ribbon.rows.map((row) => row.key), ['turbulence', 'icing', 'convection', 'typhoon', 'visibility'])
  assert.equal(byKey.icing.frames[0].mine, false)
  assert.equal(byKey.convection.frames[0].mine, true)
  assert.equal(byKey.typhoon.status, null)
  assert.equal(byKey.visibility.frames[0].source, 'AIRMET')
  assert.equal(ribbon.rows.flatMap((row) => row.frames).length, 4)
})

test('summary picks the strongest hazard at my altitude, else clear or unknown', () => {
  const hazard = buildHazardRibbon({ ...base, enrouteModel })
  assert.equal(hazard.summary.status, 'hazard')
  assert.equal(hazard.summary.top.row, 'turbulence')
  assert.equal(hazard.summary.top.level, 'SEV')

  const clear = buildHazardRibbon({ ...base, enrouteModel: { elements: [], status: { turbulence: 'none', icing: 'none' } } })
  assert.deepEqual([clear.summary.status, clear.summary.top], ['clear', null])

  const unknown = buildHazardRibbon({ ...base, enrouteModel: null })
  assert.equal(unknown.summary.status, 'unknown')
  assert.deepEqual(unknown.summary.unavailable, ['turbulence', 'icing'])
  // 다른 고도의 발표만 있으면 요약에 올리지 않는다.
  const other = buildHazardRibbon({ ...base, enrouteModel: null, hazards: [sigmet('SEV_ICE', 100, 200, 'nearby')] })
  assert.equal(other.summary.status, 'unknown')
  // 발표 틀이 요약에 오를 때도 이름은 줄 이름(한글), 원문 라벨은 sourceLabel.
  const frameTop = buildHazardRibbon({ ...base, enrouteModel: null, hazards: [sigmet('SEV_TURB', 73, 222, 'on', { label: 'Severe Turbulence' })] }).summary.top
  assert.deepEqual([frameTop.label, frameTop.sourceLabel, frameTop.level], ['난류', 'Severe Turbulence', 'SEV'])
})

test('merges same-level model segments split by a small gap', () => {
  const split = { elements: [{ kind: 'turbulence', intervals: [{ startNm: 328, endNm: 331, level: '중' }, { startNm: 332, endNm: 333, level: '중' }] }], status: { turbulence: 'found', icing: 'none' } }
  const [segment, ...rest] = buildHazardRibbon({ ...base, enrouteModel: split }).rows[0].model
  assert.deepEqual([segment.startNm, segment.endNm, rest.length], [328, 333, 0])
})
