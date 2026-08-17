import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRouteSnapshot } from './routeStore.js'

test('normalizeRouteSnapshot migrates legacy inputs without losing VFR waypoint fields', () => {
  const snapshot = normalizeRouteSnapshot({
    routeForm: { flightRule: 'VFR', departureAirport: 'RKSI' },
    vfrWaypoints: [{ id: 'WP1', uid: 'u1', lon: 126, lat: 37, fixed: false, altitudeFt: 4500, named: true }],
  })

  assert.equal(snapshot.version, 3)
  assert.equal(snapshot.base.routeForm.departureAirport, 'RKSI')
  assert.deepEqual(snapshot.vfrWaypoints[0], { id: 'WP1', uid: 'u1', lon: 126, lat: 37, fixed: false, altitudeFt: 4500, named: true })
})

test('normalizeRouteSnapshot converts legacy VFR waypoint snapshots to a full draft string', () => {
  const snapshot = normalizeRouteSnapshot({
    version: 2,
    routeForm: { flightRule: 'VFR', departureAirport: 'RKSI', arrivalAirport: 'RKPK' },
    vfrWaypoints: [
      { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
      { id: 'GONAX', named: true, lon: 127, lat: 36 },
      { id: 'WP1', named: false, lon: 128.5, lat: 35.5 },
      { id: 'RKPK', fixed: true, lon: 129, lat: 35 },
    ],
  })

  assert.equal(snapshot.base.routeString, 'RKSI DCT GONAX DCT N3530.0E12830.0 DCT RKPK')
  assert.deepEqual(snapshot.base.enroute.terms.map((term) => term.kind), ['fix', 'coordinate'])
})

test('normalizeRouteSnapshot v3 stores applied inputs without geometry or draft state', () => {
  const snapshot = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, routeString: 'SEL', routeResult: { geometry: true }, draftEditor: { rawText: 'draft' } },
    alternatives: [{ id: 'route-design-1', kind: 'alternative', routeForm: { flightRule: 'IFR' }, routeString: 'GONAV', pendingEdit: { kind: 'drag' } }],
  })

  assert.equal(snapshot.base.routeResult, undefined)
  assert.equal(snapshot.base.draftEditor, undefined)
  assert.equal(snapshot.alternatives[0].pendingEdit, undefined)
})

const GEOM = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9]] }
const SKEL = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9], [128.0, 36.0]] }

// 재검색 없이 복원하려면 기하가 살아남아야 한다. v3 분기는 필드를 명시 나열해 되돌리므로
// 나열에 없는 필드는 조용히 버려진다 — 그래서 명시적으로 지킨다.
test('normalizeRouteSnapshot: 기하·AIRAC·교체공항을 최상위에 보존한다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' }, enroute: {}, routeString: 'SEL' },
    cruiseAltitudeFt: 31000,
    routeGeometry: GEOM,
    enrouteGeometry: SKEL,
    airacCycle: '2026-06-25',
    alternateAirport: 'RKPK',
  })
  assert.deepEqual(out.routeGeometry, GEOM)
  assert.deepEqual(out.enrouteGeometry, SKEL)
  assert.equal(out.airacCycle, '2026-06-25')
  assert.equal(out.alternateAirport, 'RKPK')
})

test('normalizeRouteSnapshot: 새 필드가 없으면 null로 채운다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'VFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(out.routeGeometry, null)
  assert.equal(out.enrouteGeometry, null)
  assert.equal(out.airacCycle, null)
  assert.equal(out.alternateAirport, null)
})
