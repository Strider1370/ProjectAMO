import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notamBandToFt, matchRouteNotams } from '../src/briefing/notam-briefing.js'
import { buildRouteAxis } from '../src/briefing/route-axis.js'

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
