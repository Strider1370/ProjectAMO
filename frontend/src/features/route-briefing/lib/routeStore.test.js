import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteSavedRoute, entryKind, listSavedRoutes, normalizeRouteSnapshot, saveRoute } from './routeStore.js'

async function withPreviewStorageMocks(fetchMock, run) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  let localStorageAccesses = 0
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { pathname: '/', search: '?orgId=preview' } } })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { localStorageAccesses += 1; throw new Error('preview must not read localStorage') },
    setItem() { localStorageAccesses += 1; throw new Error('preview must not write localStorage') },
  } })
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
  try { await run(() => localStorageAccesses) } finally {
    for (const [key, descriptor] of [['window', windowDescriptor], ['localStorage', storageDescriptor], ['fetch', fetchDescriptor]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

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

test('normalizeRouteSnapshot: routeModel·routeMarkers를 보존한다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: 'SEL' },
    routeGeometry: GEOM,
    routeModel: { schemaVersion: 1, enRouteSegments: [{ id: 'A582-001', routeId: 'A582' }] },
    routeMarkers: [{ label: 'RKSS', lon: 126.4, lat: 37.4, kind: 'AIRPORT' }],
  })
  assert.equal(out.routeModel.enRouteSegments[0].routeId, 'A582')
  assert.equal(out.routeMarkers[0].label, 'RKSS')
})

test('normalizeRouteSnapshot: routeModel·routeMarkers가 없으면 null/빈배열', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'VFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(out.routeModel, null)
  assert.deepEqual(out.routeMarkers, [])
})

test('normalizeRouteSnapshot preserves NWP time selection intent without weather data', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
    nwpTimeSelection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [{ waypointId: 'marker:FIX:WP2:126.000000:37.000000:0', offsetHours: 1 }],
    },
  })
  assert.deepEqual(out.nwpTimeSelection, {
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [{ waypointId: 'marker:FIX:WP2:126.000000:37.000000:0', offsetHours: 1 }],
  })
  assert.equal(JSON.stringify(out).includes('apiKey'), false)
})

test('normalizeRouteSnapshot: kind를 보존하고, 없으면 경로로 본다', () => {
  const briefing = normalizeRouteSnapshot({
    version: 3, kind: 'briefing',
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(briefing.kind, 'briefing')

  // 2단계까지 저장된 것들에는 kind가 없다 — 경로로 취급한다.
  const legacy = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(legacy.kind, 'route')
})

test('entryKind: kind가 없으면 경로로 본다', () => {
  assert.equal(entryKind({ kind: 'briefing' }), 'briefing')
  assert.equal(entryKind({ kind: 'route' }), 'route')
  assert.equal(entryKind({}), 'route')
  assert.equal(entryKind(null), 'route')
})

test('미리보기 저장 경로 GET·POST·DELETE는 체험 API만 사용한다', async () => {
  const calls = []
  await withPreviewStorageMocks(async (url, options = {}) => {
    const method = options.method || 'GET'
    calls.push([url, method])
    return { ok: true, json: async () => method === 'GET' ? { routes: [] } : { id: 9, name: '체험 경로' } }
  }, async (localStorageAccesses) => {
    assert.deepEqual(await listSavedRoutes(), [])
    assert.equal((await saveRoute('체험 경로', {})).id, 9)
    await deleteSavedRoute(9)
    assert.equal(localStorageAccesses(), 0)
  })
  assert.deepEqual(calls, [
    ['/api/lounge-preview/saved-routes', 'GET'],
    ['/api/lounge-preview/saved-routes', 'POST'],
    ['/api/lounge-preview/saved-routes/9', 'DELETE'],
  ])
})

test('미리보기 저장 API 오류와 401은 개인 localStorage로 폴백하지 않는다', async () => {
  const calls = []
  await withPreviewStorageMocks(async (url, options = {}) => {
    const method = options.method || 'GET'
    calls.push([url, method])
    if (method === 'DELETE') throw new Error('network unavailable')
    return { ok: false, status: 401, json: async () => ({}) }
  }, async (localStorageAccesses) => {
    assert.deepEqual(await listSavedRoutes(), [])
    assert.equal(await saveRoute('저장 실패', {}), null)
    assert.equal(await deleteSavedRoute(9), undefined)
    assert.equal(localStorageAccesses(), 0)
  })
  assert.deepEqual(calls, [
    ['/api/lounge-preview/saved-routes', 'GET'],
    ['/api/lounge-preview/saved-routes', 'POST'],
    ['/api/lounge-preview/saved-routes/9', 'DELETE'],
  ])
})
