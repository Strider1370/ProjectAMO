import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHazardSection } from '../src/briefing/hazard-section.js'

const onRoutePoly = { type:'Polygon', coordinates: [[[125,32],[128,32],[128,35],[125,35],[125,32]]] }
const axis = { totalDistanceNm: 200, samples: [
  { distanceNm: 0, lon: 126.45, lat: 37.46 },
  { distanceNm: 80, lon: 126.5, lat: 34.0 },
  { distanceNm: 120, lon: 126.6, lat: 33.0 },
  { distanceNm: 200, lon: 126.5, lat: 31.0 },
] }
const ctxBase = { etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z', cruiseAltitudeFt: 9000 }

const icingOnAlt = { id:'s1', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing',
  valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
  altitude:{ lower_fl:80, upper_fl:140, lower_uom:'FL', upper_uom:'FL' } }
const turbHighAlt = { id:'s2', phenomenon_code:'SEV_TURB', phenomenon_label:'Severe Turbulence',
  valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
  altitude:{ lower_fl:300, upper_fl:400, lower_uom:'FL', upper_uom:'FL' } }

test('on-route + planned altitude in band -> encounter on, red', () => {
  const sec = buildHazardSection({ sigmet:[icingOnAlt], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards.length, 1)
  assert.equal(sec.hazards[0].encounter, 'on')
  assert.equal(sec.hazards[0].horizontalExposure.status, 'intersects')
  assert.equal(sec.hazards[0].altitudeExposure.status, 'intersects')
  assert.equal(sec.hazards[0].timeStatus, 'matched')
  assert.equal(sec.hazards[0].verticalKnown, true)
  assert.deepEqual(sec.hazards[0].bandFt, { lowFt: 8000, highFt: 14000 })
  assert.equal(sec.hazards[0].routeIntervalNm.startNm, 80)
  assert.equal(sec.level, 'red')
})

test('on-route but above planned altitude -> nearby, amber', () => {
  const sec = buildHazardSection({ sigmet:[turbHighAlt], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards[0].encounter, 'nearby')
  assert.equal(sec.level, 'amber')
})

test('band-unknown SIGMET stays red (no under-alarm)', () => {
  const tsNoBand = { id:'s3', phenomenon_code:'EMBD_TS', phenomenon_label:'Embedded TS',
    valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly, altitude:null }
  const sec = buildHazardSection({ sigmet:[tsNoBand], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards[0].verticalKnown, false)
  assert.equal(sec.hazards[0].encounter, 'nearby')
  assert.equal(sec.level, 'red')
})

test('AIRMET at planned altitude stays amber', () => {
  const airmetOnAlt = { id:'a1', phenomenon_code:'MOD_TURB', phenomenon_label:'Moderate Turbulence',
    valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
    altitude:{ lower_fl:60, upper_fl:120, lower_uom:'FL', upper_uom:'FL' } }
  const sec = buildHazardSection({ sigmet:[], airmet:[airmetOnAlt], axis, ...ctxBase })
  assert.equal(sec.hazards[0].encounter, 'on')
  assert.equal(sec.level, 'amber')
})

test('off-route dropped', () => {
  const offPoly = { type:'Polygon', coordinates: [[[100,10],[101,10],[101,11],[100,11],[100,10]]] }
  const off = { ...icingOnAlt, geometry: offPoly }
  const sec = buildHazardSection({ sigmet:[off], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards.length, 0)
  assert.equal(sec.level, 'green')
})

test('missing ETD/ETA keeps the horizontal and altitude result with time not_provided', () => {
  const sec = buildHazardSection({ sigmet: [icingOnAlt], airmet: [], axis, cruiseAltitudeFt: 9000 })
  assert.equal(sec.hazards.length, 1)
  assert.equal(sec.hazards[0].timeStatus, 'not_provided')
  assert.equal(sec.hazards[0].encounter, 'on')
})

// 지표 현상 AIRMET(SFC_VIS·MT_OBSC·IFR·LLWS)은 원문 IWXXM에 고도가 아예 없다.
// 밴드를 모른다고 순항고도에서 "고도 판정 불가"로 남기면 FL310 NAVLOG에도 지표시정이
// 매 구간 붙는다 — 실제 운영 자료에서 관측된 문제. 지표~FL100로 가정해 걸러낸다.
const sfcVisNoAltitude = {
  id: 'a2', phenomenon_code: 'SFC_VIS', phenomenon_label: 'Surface Visibility',
  valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z', geometry: onRoutePoly,
  altitude: { lower_fl: null, upper_fl: null, lower_uom: null, upper_uom: null },
}

test('고도 없는 지표 현상 AIRMET은 순항고도에서 "판정 불가"가 아니라 "고도 밖"으로 확정된다', () => {
  const high = buildHazardSection({ sigmet: [], airmet: [sfcVisNoAltitude], axis, ...ctxBase, cruiseAltitudeFt: 31000 })
  // ① 위험 요약에는 남는다 — 지표 시정은 이착륙에 직결되므로 목록에서 지우면 안 된다.
  assert.equal(high.hazards.length, 1)
  assert.equal(high.hazards[0].verticalKnown, true)
  // 다만 순항고도와는 무관하다고 확정된다. NAVLOG는 이 clear를 보고 구간에서 뺀다.
  assert.equal(high.hazards[0].altitudeExposure.status, 'clear')
  assert.equal(high.hazards[0].encounter, 'nearby')
})

test('같은 지표 현상 AIRMET도 저고도 비행에서는 그대로 남는다', () => {
  const low = buildHazardSection({ sigmet: [], airmet: [sfcVisNoAltitude], axis, ...ctxBase, cruiseAltitudeFt: 4000 })
  assert.equal(low.hazards.length, 1)
  assert.equal(low.hazards[0].encounter, 'on')
  assert.equal(low.hazards[0].verticalKnown, true)
  assert.deepEqual(low.hazards[0].bandFt, { lowFt: 0, highFt: 10000 })
})
