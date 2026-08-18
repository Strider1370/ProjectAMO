import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSavedBriefingInputs, buildSavedRouteResult } from './savedRouteBriefing.js'

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

test('저장된 선으로 지도가 그릴 routeResult를 만든다', () => {
  const inputs = buildSavedBriefingInputs(savedRoute())
  const result = buildSavedRouteResult(inputs)

  const line = result.previewGeojson.features.find((f) => f.properties.role === 'route-preview-line')
  assert.deepEqual(line.geometry, GEOM, '지도는 저장된 선을 그대로 그려야 한다 — 출발·도착 직선이 아니라')
  assert.equal(result.flightRule, 'IFR')
  assert.equal(result.departureAirport, 'RKSS')
  assert.equal(result.arrivalAirport, 'RKPC')
  assert.equal(result.totalDistanceNm, inputs.distanceNm)
  assert.equal(result.distanceNm, inputs.distanceNm)
})

test('저장된 선은 절차가 이미 박혀 있다고 표시한다 — 지도가 두 번 얹지 않도록', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute()))
  const line = result.previewGeojson.features.find((f) => f.properties.role === 'route-preview-line')
  assert.equal(line.properties.inlineProcedureGeometry, true)
})

test('저장된 마커로 경유점 이름표 피처를 만든다', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute()))
  const points = result.previewGeojson.features.filter((f) => f.properties.role === 'route-preview-point')
  assert.equal(points.length, MARKERS.length)
  assert.equal(points[0].properties.label, 'RKSS')
  assert.deepEqual(points[0].geometry, { type: 'Point', coordinates: [126.4, 37.4] })
})

test('마커가 없으면 선만 낸다', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute({ routeMarkers: [] })))
  assert.equal(result.previewGeojson.features.length, 1)
})

test('routeResult가 저장된 구간 모델을 들고 간다 — NAVLOG 순항 구간이 비지 않도록', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute()))
  assert.equal(result.routeModel.enRouteSegments[0].routeId, 'A582')
  assert.deepEqual(result.routeModel.routeGeometry, GEOM)
})

test('진입·이탈 픽스를 넘긴다 — 연직단면도 기준 픽스 이름표가 된다', () => {
  const saved = savedRoute()
  saved.base.routeForm.entryFix = 'EGOBA'
  saved.base.routeForm.exitFix = 'PROOF'
  const inputs = buildSavedBriefingInputs(saved)
  assert.equal(inputs.entryFix, 'EGOBA')
  assert.equal(buildSavedRouteResult(inputs).exitFix, 'PROOF')
})

test('routeResult가 저장된 마커를 들고 간다 — 공항 줄과 경유점 이름이 살아남도록', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute()))
  assert.deepEqual(result.routeMarkers, MARKERS)
})

test('VFR은 저장된 마커에서 경유점을 복원한다 — 양 끝 공항은 뺀다', () => {
  const saved = savedRoute()
  saved.base.routeForm.flightRule = 'VFR'
  saved.routeMarkers = [
    { label: 'RKSI', lon: 126.4, lat: 37.4, kind: 'AIRPORT' },
    { label: 'WP1', lon: 127.0, lat: 37.0, kind: 'WAYPOINT' },
    { label: 'RKPC', lon: 126.5, lat: 33.5, kind: 'AIRPORT' },
  ]
  const result = buildSavedRouteResult(buildSavedBriefingInputs(saved))
  assert.equal(result.manualRoute.points.length, 1)
  assert.equal(result.manualRoute.points[0].label, 'WP1')
  assert.deepEqual(result.manualRoute.points[0].coordinates, [127.0, 37.0])
})

test('IFR에는 manualRoute를 만들지 않는다', () => {
  const result = buildSavedRouteResult(buildSavedBriefingInputs(savedRoute()))
  assert.equal(result.manualRoute, undefined)
})
