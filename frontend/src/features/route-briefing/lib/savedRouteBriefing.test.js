import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSavedBriefingInputs } from './savedRouteBriefing.js'

const GEOM = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9], [128.0, 36.0]] }
const MODEL = { schemaVersion: 1, enRouteSegments: [{ id: 'A582-001', routeId: 'A582', startNm: 0, endNm: 40 }] }
const MARKERS = [{ label: 'RKSS', lon: 126.4, lat: 37.4, kind: 'AIRPORT' }]

const savedRoute = (overrides = {}) => ({
  version: 3,
  base: {
    routeForm: { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC' },
    procedureIds: { sid: 'RKSS-SID-X', star: null, iapKey: null },
    enroute: { terms: [] },
    routeString: 'BULTI A582 DOTOL',
  },
  routeGeometry: GEOM,
  routeModel: MODEL,
  routeMarkers: MARKERS,
  alternateAirport: 'RKPK',
  cruiseAltitudeFt: 31000,
  tasKt: 450,
  etd: '2026-08-18T02:00:00Z',
  ...overrides,
})

test('저장분만으로 브리핑 입력이 완성된다', () => {
  const out = buildSavedBriefingInputs(savedRoute())
  assert.equal(out.ok, true)
  assert.equal(out.flightRule, 'IFR')
  assert.equal(out.departureAirport, 'RKSS')
  assert.equal(out.arrivalAirport, 'RKPC')
  assert.equal(out.alternateAirport, 'RKPK')
  assert.deepEqual(out.routeGeometry, GEOM)
  assert.equal(out.cruiseAltitudeFt, 31000)
  assert.equal(out.etd, '2026-08-18T02:00:00Z')
})

test('routeModel에 routeGeometry를 다시 끼운다 — 브리핑 요청이 그 모양을 기대한다', () => {
  const out = buildSavedBriefingInputs(savedRoute())
  assert.deepEqual(out.routeModel.routeGeometry, GEOM)
  assert.equal(out.routeModel.enRouteSegments[0].routeId, 'A582')
})

test('ETA가 없으면 거리·TAS로 계산한다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: null }))
  assert.ok(Number.isFinite(Date.parse(out.eta)), 'ETA가 계산돼야 한다')
  assert.ok(Date.parse(out.eta) > Date.parse(out.etd))
})

test('저장된 ETA가 있으면 그대로 쓴다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: '2026-08-18T03:30:00Z' }))
  assert.equal(out.eta, '2026-08-18T03:30:00Z')
})

test('기하가 없으면 ok:false — 재검색으로 넘길 신호', () => {
  const out = buildSavedBriefingInputs(savedRoute({ routeGeometry: null, enrouteGeometry: null }))
  assert.equal(out.ok, false)
  assert.equal(out.reason, 'no_geometry')
})

test('routeModel이 없어도 브리핑은 성립한다 — 구간표만 빈다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ routeModel: null }))
  assert.equal(out.ok, true)
  assert.deepEqual(out.routeModel.enRouteSegments, [])
  assert.deepEqual(out.routeModel.routeGeometry, GEOM)
})

test('총 거리는 저장된 선에서 계산한다 — 재검색 결과가 필요 없다', () => {
  const out = buildSavedBriefingInputs(savedRoute())
  assert.ok(out.distanceNm > 100 && out.distanceNm < 300, `실제: ${out.distanceNm} NM`)
})
