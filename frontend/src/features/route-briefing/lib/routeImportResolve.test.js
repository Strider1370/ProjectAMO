import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveImportedRoute, AIRPORT_SNAP_NM, FIX_MATCH_NM } from './routeImportResolve.js'

const AIRPORTS = [
  { icao: 'RKSI', lon: 126.4505, lat: 37.4691 },
  { icao: 'RKPK', lon: 128.9382, lat: 35.1795 },
]
const NAVPOINTS = { GONAX: { lon: 127.2, lat: 36.8 } }

const candidate = (over = {}) => ({
  label: '경로 1', kind: 'route', droppedCount: 0,
  coords: [[126.4505, 37.4691], [127.2, 36.8], [128.9382, 35.1795]],
  names: [null, null, null],
  types: [null, null, null],
  ...over,
})

// 이름 없는 좌표는 솎기 대상이라 가운데 점을 직선에서 충분히 띄워둔다 — 직선
// 위에 놓으면 1NM 규칙이 정보 없는 점으로 보고 지워서, 끝점 흡수를 보는 이
// 시험의 의도가 흐려진다.
test('끝점이 공항 10NM 안이면 흡수하고 출발·도착을 채운다', () => {
  const bent = candidate({ coords: [[126.4505, 37.4691], [127.5, 37.5], [128.9382, 35.1795]] })
  const out = resolveImportedRoute({ candidate: bent, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, 'RKSI')
  assert.equal(out.arrivalAirport, 'RKPK')
  assert.equal(out.terms.length, 1) // 양끝은 공항으로 흡수되고 가운데 1개만 남는다
  assert.equal(out.coordinates.length, 3)
  assert.ok(out.notices.some((n) => n.code === 'airports-detected'))
})

test('끝점이 공항에서 멀면 공항은 비우고 끝점을 경유점으로 남긴다', () => {
  const far = candidate({ coords: [[130.0, 40.0], [130.5, 41.0], [131.0, 41.0]] })
  const out = resolveImportedRoute({ candidate: far, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, null)
  assert.equal(out.arrivalAirport, null)
  assert.equal(out.terms.length, 3) // 어느 점도 흡수되지 않는다
  assert.ok(out.notices.some((n) => n.code === 'airports-missing' && n.level === 'action'))
})

test('FPL의 AIRPORT 종류는 거리 탐색 없이 그 공항으로 확정한다', () => {
  const fpl = candidate({
    coords: [[126.90, 37.90], [127.2, 36.8], [128.9382, 35.1795]], // 출발점이 RKSI에서 25NM 넘게 떨어져 있음
    names: ['RKSI', 'GONAX', 'RKPK'],
    types: ['AIRPORT', 'INT', 'AIRPORT'],
  })
  const out = resolveImportedRoute({ candidate: fpl, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, 'RKSI')
})

test('이름이 항법 데이터와 5NM 안으로 일치하면 fix로 쓴다', () => {
  const named = candidate({ names: [null, 'GONAX', null] })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.deepEqual(out.terms[0], { kind: 'fix', id: 'GONAX' })
})

test('이름은 같은데 위치가 5NM 넘게 다르면 파일 좌표를 쓰고 알린다', () => {
  const named = candidate({
    coords: [[126.4505, 37.4691], [128.0, 36.8], [128.9382, 35.1795]],
    names: [null, 'GONAX', null],
  })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.terms[0].kind, 'user-waypoint')
  assert.ok(out.notices.some((n) => n.code === 'fix-moved' && n.message.includes('GONAX')))
})

test('항법 데이터에 없는 이름은 좌표로 넣고 개수를 알린다', () => {
  const named = candidate({ names: [null, 'ZZZZZ', null] })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.terms[0].kind, 'user-waypoint')
  assert.deepEqual(out.unknownWaypointNames, ['ZZZZZ'])
  assert.ok(out.notices.some((n) => n.code === 'fix-unknown'))
})

test('항법 데이터에 없는 가져온 이름은 사용자 waypoint로 보존한다', () => {
  const named = candidate({ names: [null, 'QD040', null] })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.deepEqual(out.terms, [{ kind: 'user-waypoint', id: 'imported-wp-1', name: 'QD040' }])
  assert.deepEqual(out.userWaypoints, [{ id: 'imported-wp-1', name: 'QD040', lon: 127.2, lat: 36.8 }])
})

test('중간 지점 이름이 4글자 ICAO 꼴이면 좌표로 넣는다', () => {
  // manualRouteInput.js가 중간 term의 4글자 대문자 fix를 "중간 공항 ICAO"로 보고
  // 거부하므로, 그대로 fix로 넘기면 편집기 왕복에서 경로 전체가 실패한다.
  const named = candidate({ names: [null, 'RKSS', null] })
  const out = resolveImportedRoute({
    candidate: named,
    airports: AIRPORTS,
    navpoints: { ...NAVPOINTS, RKSS: { lon: 127.2, lat: 36.8 } },
  })
  assert.equal(out.terms[0].kind, 'user-waypoint')
})

test('궤적을 솎으면 알린다', () => {
  const track = candidate({
    coords: Array.from({ length: 500 }, (_, i) => [126.4505 + i * 0.005, 37.4691]),
    names: Array.from({ length: 500 }, () => null),
    types: Array.from({ length: 500 }, () => null),
  })
  const out = resolveImportedRoute({ candidate: track, airports: AIRPORTS, navpoints: NAVPOINTS })
  const notice = out.notices.find((n) => n.code === 'thinned')
  assert.ok(notice)
  assert.ok(notice.message.includes('500'))
})

test('경로가 한국 FIR 밖이면 알린다', () => {
  const far = candidate({ coords: [[150.0, 10.0], [151.0, 11.0], [152.0, 12.0]] })
  const out = resolveImportedRoute({ candidate: far, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.ok(out.notices.some((n) => n.code === 'outside-fir'))
})

test('버려진 좌표가 있으면 알린다', () => {
  const out = resolveImportedRoute({ candidate: candidate({ droppedCount: 2 }), airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.ok(out.notices.some((n) => n.code === 'coords-dropped'))
})

test('상수는 스펙 값과 같다', () => {
  assert.equal(AIRPORT_SNAP_NM, 10)
  assert.equal(FIX_MATCH_NM, 5)
})
