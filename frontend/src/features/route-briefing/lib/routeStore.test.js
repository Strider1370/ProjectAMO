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
