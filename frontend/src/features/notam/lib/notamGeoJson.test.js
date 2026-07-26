import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notamToFeatureCollection, parsePsnPoint, displayGeometry } from './notamGeoJson.js'

const now = Date.parse('2026-07-03T06:00:00Z')
const base = {
  fetched_at: '2026-07-03T06:00:00Z', horizon_hours: 24,
  items: [
    { id: 'G1/26', category: 'restricted', scope: 'airport', location: 'RKSI',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'GPS RAIM',
      geometry: { type: 'Polygon', coordinates: [[[126,37],[127,37],[127,38],[126,38],[126,37]]] } },
    { id: 'D9/26', category: 'danger', scope: 'fir', location: 'RKRR',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-04T00:00:00Z',
      altitude: null, summary: 'FIR-wide', geometry: { type: 'Polygon', coordinates: [[[124,33],[132,33],[132,39],[124,39],[124,33]]] } },
    { id: 'A2/26', category: 'facility', scope: 'airport', location: 'RKSS',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: null, summary: 'no geom', geometry: null },
    { id: 'F7/26', category: 'facility', scope: 'airport', location: 'RKSS',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: null, summary: 'RWY CLSD', geometry: { type: 'Polygon', coordinates: [[[126,35],[127,35],[127,36],[126,35]]] } },
    { id: 'L5/26', category: 'danger', scope: 'airport', location: 'RKPC',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: null, summary: 'corridor', geometry: { type: 'LineString', coordinates: [[126,35],[127,36]] } },
  ],
}

test('excludes only null-geometry; FIR included with scope property (outline-only in layer)', () => {
  const fc = notamToFeatureCollection(base, now)
  assert.equal(fc.type, 'FeatureCollection')
  const ids = fc.features.map((f) => f.properties.id)
  assert.ok(!ids.includes('A2/26'), 'null-geometry excluded')
  assert.ok(!ids.includes('F7/26'), '시설은 지도 미표시(공항패널에서 확인)')
  const fir = fc.features.find((f) => f.properties.id === 'D9/26')
  assert.ok(fir, 'FIR NOTAM now included on map')
  assert.equal(fir.properties.scope, 'fir')
})

test('keeps LineString geometry (map/tab exposure; only briefing-matching excludes it)', () => {
  const fc = notamToFeatureCollection(base, now)
  const line = fc.features.find((f) => f.properties.id === 'L5/26')
  assert.ok(line, 'LineString NOTAM survives GeoJSON conversion')
  assert.equal(line.geometry.type, 'LineString')
})

test('feature carries category + precomputed timeState + formatted altitude', () => {
  const f = notamToFeatureCollection(base, now).features.find((x) => x.properties.id === 'G1/26')
  assert.equal(f.properties.category, 'restricted')
  assert.equal(f.properties.timeState, 'active')
  assert.equal(f.properties.altitude, '전고도')
  assert.equal(f.geometry.type, 'Polygon')
})

test('empty / missing payload → empty collection', () => {
  assert.deepEqual(notamToFeatureCollection(null, now).features, [])
  assert.deepEqual(notamToFeatureCollection({ items: [] }, now).features, [])
})

test('parsePsnPoint: DDMMSS N/E → [lon,lat]', () => {
  const p = parsePsnPoint('- PSN : 350656N1264748E')
  assert.ok(p)
  assert.ok(Math.abs(p[0] - 126.7967) < 0.001, 'lon')
  assert.ok(Math.abs(p[1] - 35.1156) < 0.001, 'lat')
  assert.equal(parsePsnPoint('no coords here'), null)
})

test('displayGeometry: 장애물 → PSN 정확한 점', () => {
  const item = { category: 'obstacle', summary: 'TEMP OBST(CRANE) PSN : 350656N1264748E HGT 20M',
    geometry: { type: 'Polygon', coordinates: [[[126.8, 35.1], [126.81, 35.1], [126.81, 35.13], [126.8, 35.1]]] } }
  const g = displayGeometry(item)
  assert.equal(g.type, 'Point')
  assert.ok(Math.abs(g.coordinates[0] - 126.7967) < 0.001)
})

test('displayGeometry: 시설 → 원래 폴리곤 유지(활주로형 색칠)', () => {
  const item = { category: 'facility', summary: 'RWY 01/19 CLSD',
    geometry: { type: 'Polygon', coordinates: [[[126.0, 35.0], [126.2, 35.0], [126.2, 35.2], [126.0, 35.2], [126.0, 35.0]]] } }
  assert.equal(displayGeometry(item).type, 'Polygon')
})

test('displayGeometry: 구역 계열(위험/제한)은 폴리곤 유지', () => {
  const item = { category: 'danger', geometry: { type: 'Polygon', coordinates: [[[126, 36], [127, 36], [127, 37], [126, 36]]] } }
  assert.equal(displayGeometry(item).type, 'Polygon')
})

// 지도 도형 색(timeState)은 목록·공항탭과 같은 판정을 써야 한다. 예전엔 deriveTimeState를 직접 불러
// B~C만 보는 바람에, D) 시간대 밖인 NOTAM이 지도에서만 '발효 중'으로 칠해졌다.
test('map features honour the D) schedule, not just B)~C)', () => {
  const zone = {
    id: 'D1/26', category: 'restricted', scope: 'airport', location: 'RKRR',
    valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T23:59:00Z',
    summary: 'TEMPO RESTRICTED AREA ACT',
    geometry: { type: 'Polygon', coordinates: [[[126, 37], [127, 37], [127, 38], [126, 38], [126, 37]]] },
  }
  const at = Date.parse('2026-07-03T06:00:00Z')
  const stateOf = (schedule_text) => notamToFeatureCollection(
    { items: [{ ...zone, schedule_text }] }, at,
  ).features[0].properties.timeState

  assert.equal(stateOf('0500-0700'), 'active')        // 06:00Z는 창 안
  assert.equal(stateOf('0800-0900'), 'upcoming')      // 창 밖 — B~C 안이어도 꺼져 있다
  assert.equal(stateOf('MON-FRI SR-SS'), 'conditional') // 해석 불가는 단정하지 않는다
  assert.equal(stateOf(undefined), 'active')          // D)가 없으면 유효기간만으로 판정
})
