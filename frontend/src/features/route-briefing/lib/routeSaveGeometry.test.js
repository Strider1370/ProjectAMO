import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSavedGeometry } from './routeSaveGeometry.js'

const line = (coordinates) => ({ type: 'LineString', coordinates })
const previewOf = (coordinates) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: line(coordinates) }],
})

const SKELETON = [[126.45, 37.45], [127.0, 36.5], [128.6, 35.2]]
// 절차 fix는 런타임에 평탄화된 { id, lat, lon } 모양이다 (routePreview.getProcedureLineCoordinates).
const SID = {
  fixes: [
    { id: 'RWY33L', lat: 37.454, lon: 126.46 },
    { id: 'CG050', lat: 37.371, lon: 126.585 },
  ],
}

test('IFR + 절차: 최종선과 스켈레톤을 모두 낸다', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'IFR', previewGeojson: previewOf(SKELETON) },
    selectedSid: SID,
  })
  assert.equal(result.routeGeometry.type, 'LineString')
  assert.ok(result.routeGeometry.coordinates.length > SKELETON.length, '절차가 붙어 최종선이 더 길어야 한다')
  assert.deepEqual(result.enrouteGeometry.coordinates, SKELETON)
})

test('IFR + 절차 없음: 최종선만 낸다 (스켈레톤 중복 저장 안 함)', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'IFR', previewGeojson: previewOf(SKELETON) },
  })
  assert.deepEqual(result.routeGeometry.coordinates, SKELETON)
  assert.equal(result.enrouteGeometry, null)
})

test('VFR: 최종선만 낸다 — 경로선이 곧 스켈레톤', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'VFR' },
    vfrWaypoints: [{ lon: 126.4, lat: 37.4 }, { lon: 127.1, lat: 36.9 }],
  })
  assert.deepEqual(result.routeGeometry.coordinates, [[126.4, 37.4], [127.1, 36.9]])
  assert.equal(result.enrouteGeometry, null)
})

test('경로 없음: 둘 다 null', () => {
  assert.deepEqual(buildSavedGeometry({ routeResult: null }), { routeGeometry: null, enrouteGeometry: null })
})
