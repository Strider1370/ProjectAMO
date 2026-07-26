import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notamBandToFt, matchRouteNotams } from '../src/briefing/notam-briefing.js'
import { buildRouteAxis } from '../src/briefing/route-axis.js'
import { resolveNotamGeometry } from '../src/notam/notam-geometry.js'

test('notamBandToFt: FT band passes through', () => {
  assert.deepEqual(notamBandToFt({ lower: 0, upper: 4000, unit: 'FT', ref: 'AGL' }), { lowFt: 0, highFt: 4000 })
})

test('notamBandToFt: FL band × 100', () => {
  assert.deepEqual(notamBandToFt({ lower: 40, upper: 120, unit: 'FL', ref: null }), { lowFt: 4000, highFt: 12000 })
})

test('notamBandToFt: FL 0..999 (전고도) → no ceiling', () => {
  const b = notamBandToFt({ lower: 0, upper: 999, unit: 'FL', ref: null })
  assert.equal(b.lowFt, 0)
  assert.ok(b.highFt >= 99999)
})

test('notamBandToFt: null altitude → null', () => {
  assert.equal(notamBandToFt(null), null)
})

test('notamBandToFt: fully malformed → null (unknown band; matchRouteNotams treats as conservative pass)', () => {
  assert.equal(notamBandToFt({ lower: 'bad', upper: 'data', unit: 'FL', ref: null }), null)
})

test('notamBandToFt: partial garbage (valid lower, bad upper) → sensible band', () => {
  assert.deepEqual(notamBandToFt({ lower: 0, upper: 'data', unit: 'FL', ref: null }), { lowFt: 0, highFt: 99999 })
})

// 인천→제주 직선. axis 샘플이 lat 35~36 구간을 지난다.
const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.45, 37.46], [126.5, 33.5]] }, 2000)
const ctx = { axis, etd: '2026-06-26T09:00:00Z', eta: '2026-06-26T10:30:00Z', cruiseAltitudeFt: 9000 }
// 경로가 지나는 폴리곤(lat 35~36, lon 126~127).
const onRoutePoly = { type: 'Polygon', coordinates: [[[126, 35], [127, 35], [127, 36], [126, 36], [126, 35]]] }
const notam = (over) => ({
  id: 'A0001/26', category: 'danger', scope: 'airport',
  valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z',
  altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'DANGER AREA ACT',
  geometry: onRoutePoly, ...over,
})

test('matchRouteNotams: route-crossing restriction in effect at altitude → conflict', () => {
  const { routeNotams, routeConflicts } = matchRouteNotams([notam()], ctx)
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].conflict, true)
  assert.equal(routeConflicts.length, 1)
  assert.equal(routeConflicts[0].id, 'A0001/26')
})

test('matchRouteNotams: scope:fir excluded entirely', () => {
  const { routeNotams } = matchRouteNotams([notam({ scope: 'fir' })], ctx)
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: outside ETD~ETA time window excluded', () => {
  const { routeNotams } = matchRouteNotams([notam({ valid_from: '2026-06-27T00:00:00Z', valid_to: '2026-06-27T02:00:00Z' })], ctx)
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: on-route NOTAM with missing validity remains undetermined', () => {
  const { routeNotams, routeConflicts } = matchRouteNotams([notam({ valid_from: null, valid_to: null })], ctx)
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].comparisonStatus, 'undetermined')
  assert.equal(routeNotams[0].timeStatus, 'unavailable')
  assert.equal(routeNotams[0].conflict, false)
  assert.equal(routeConflicts.length, 0)
})

test('matchRouteNotams: obstacle on route is listed but NOT a conflict', () => {
  const { routeNotams, routeConflicts } = matchRouteNotams([notam({ category: 'obstacle' })], ctx)
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].conflict, false)
  assert.equal(routeConflicts.length, 0)
})

test('matchRouteNotams: restriction present but altitude band clear of cruise → not conflict', () => {
  // 계획고도 9000ft, 밴드 FL200~FL300(=20000~30000ft) → 통과 안 함.
  const { routeConflicts } = matchRouteNotams([notam({ altitude: { lower: 200, upper: 300, unit: 'FL', ref: null } })], ctx)
  assert.equal(routeConflicts.length, 0)
})

test('matchRouteNotams: off-route restriction excluded', () => {
  const off = { type: 'Polygon', coordinates: [[[120, 20], [121, 20], [121, 21], [120, 21], [120, 20]]] }
  const { routeNotams } = matchRouteNotams([notam({ geometry: off })], ctx)
  assert.equal(routeNotams.length, 0)
})

const offRoutePoly = { type: 'Polygon', coordinates: [[[120, 20], [121, 20], [121, 21], [120, 21], [120, 20]]] }

test('matchRouteNotams: NOTAM at arrival airport off the route line is still included (destination crane)', () => {
  const crane = notam({ id: 'CRANE/26', category: 'obstacle', location: 'RKPC', geometry: offRoutePoly, altitude: { lower: 0, upper: 5, unit: 'FL', ref: null }, operational: { priority: 'critical' } })
  const { routeNotams } = matchRouteNotams([crane], { ...ctx, airports: [{ role: 'arrival', icao: 'RKPC' }] })
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].airportRole, 'arrival')
  assert.deepEqual(routeNotams[0].operational, { priority: 'critical' })
  assert.equal(routeNotams[0].routeIntervalNm, null) // 경로 미교차 → 진입거리 없음
})

test('matchRouteNotams: off-route NOTAM at an airport NOT in the flight is excluded', () => {
  const other = notam({ id: 'OTHER/26', location: 'RKTU', geometry: offRoutePoly })
  const { routeNotams } = matchRouteNotams([other], { ...ctx, airports: [{ role: 'arrival', icao: 'RKPC' }] })
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: sorted in-effect-at-ETD first, then entry distance', () => {
  const later = notam({ id: 'LATER/26', valid_from: '2026-06-26T09:30:00Z' }) // ETD(09:00) 이후 발효 → activeAtEtd=false
  const now = notam({ id: 'NOW/26', valid_from: '2026-06-26T08:00:00Z' })     // ETD 이전 발효 → activeAtEtd=true
  const { routeNotams } = matchRouteNotams([later, now], ctx)
  assert.equal(routeNotams[0].id, 'NOW/26')
})

import { routeIntervalInGeometry } from '../src/briefing/geo-time-match.js'

// 시임(seam) 가드: Task 3의 resolveNotamGeometry(ring-closing)가 Task 5의 matchRouteNotams가
// 실제로 소비할 수 있는 결과를 내는지 확인한다. TDD RED 과녁이 아니다 — 지우지 말 것.
// 미해결(raw LineString) 쪽은 오늘도 0건이고, resolveNotamGeometry가 닫아준 뒤에만 1건 잡혀야
// closeIfRing이 훗날 회귀해도(닫지 않게 되면) 이 테스트가 빨갛게 된다.
test('KML이 열린 선으로 준 구역은 위치 결정을 거쳐야 경로 판정에 걸린다', () => {
  const ring = [[127.0, 36.9], [127.2, 36.9], [127.2, 37.1], [127.0, 37.1], [127.0, 36.9]]
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const zoneOf = (geometry) => ({
    id: 'D9999/26', category: 'danger', summary: 'TEMPO DANGER AREA ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry,
  })
  const ctx = { axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000, airports: [] }

  // 미해결: KML이 원래 주는 열린 LineString 그대로 — 오늘도 안 잡힌다(이게 이 태스크가 고치는 버그).
  const unresolved = matchRouteNotams([zoneOf({ type: 'LineString', coordinates: ring })], ctx)
  assert.equal(unresolved.routeConflicts.length, 0, '열린 선은 경로 판정에 걸리지 않는다(현재도 마찬가지)')

  // 해결: resolveNotamGeometry가 닫힌 고리를 Polygon으로 만들어준 뒤에는 잡힌다.
  const resolved = resolveNotamGeometry({
    rawText: 'Q)RKRR/QRDCA/IV/BO/W/000/999/3700N12710E020\nE)TEMPO DANGER AREA ACT',
    kmlGeometry: { type: 'LineString', coordinates: ring },
  })
  assert.equal(resolved.geometry.type, 'Polygon', '닫힌 고리가 면이 되어야 한다')
  const afterResolve = matchRouteNotams([zoneOf(resolved.geometry)], ctx)
  assert.equal(afterResolve.routeConflicts.length, 1, '닫힌 뒤에는 저촉이 잡혀야 한다')
})

test('회랑은 폭 안쪽을 지나면 저촉이 잡힌다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[127.0, 36.99], [127.2, 36.99]] })
  const corridor = {
    id: 'E9999/26', category: 'restricted', summary: 'TEMPO RESTRICTED AREA ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: { type: 'LineString', coordinates: [[127.0, 37.0], [127.2, 37.0]] },
    bufferNm: 5,
  }
  const { routeConflicts } = matchRouteNotams([corridor], {
    axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(routeConflicts.length, 1)
})

test('위치를 못 정한 건은 목록에서 사라지지 않는다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const unknown = {
    id: 'D8888/26', category: 'restricted', summary: 'RESTRICTED AREA RK R97E ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: null, geometrySource: 'none',
    // 출·도착·교체 어디에도 속하지 않는 공항이어야 한다. 속하면 airportRole 때문에
    // 지금 코드로도 이미 살아남아, 바꾸려는 continue 줄을 지나가지 않는다.
    location: 'RKPU',
  }
  const { routeNotams, routeConflicts } = matchRouteNotams([unknown], {
    axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000,
    airports: [{ role: 'departure', icao: 'RKSS' }, { role: 'arrival', icao: 'RKPK' }],
  })
  const row = routeNotams.find((n) => n.id === 'D8888/26')
  assert.ok(row, '목록에서 사라졌다 — 조용한 누락은 정책 위반이다')
  assert.equal(row.positionStatus, 'unresolved')
  assert.equal(routeConflicts.length, 0, '위치 불명을 저촉으로 치면 안 된다')
})

test('D) 시간대 밖 비행이면 저촉이 아니다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const zone = {
    id: 'Z9999/26', category: 'firing', summary: 'FIREWORKS WILL TAKE PLACE',
    valid_from: '2026-07-25T10:00:00Z', valid_to: '2026-08-29T12:00:00Z',
    schedule_text: 'AUG 01-02 1000-1200',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: { type: 'Polygon', coordinates: [[[127.0, 36.9], [127.2, 36.9], [127.2, 37.1], [127.0, 37.1], [127.0, 36.9]]] },
  }
  const inside = matchRouteNotams([zone], {
    axis, etd: '2026-08-01T10:10:00Z', eta: '2026-08-01T11:10:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(inside.routeConflicts.length, 1, '시간대 안이면 저촉이어야 한다')

  const outside = matchRouteNotams([zone], {
    axis, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(outside.routeConflicts.length, 0, '시간대 밖이면 저촉이 아니어야 한다')
  assert.equal(outside.routeNotams[0].scheduleState, 'outside')
})
