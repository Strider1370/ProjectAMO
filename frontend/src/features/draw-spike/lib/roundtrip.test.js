// 왕복 시험 — 그린 것 → KML → 우리 불러오기가 다시 읽기.
//
// 이 스파이크의 가장 중요한 확인이다. 내보내기와 불러오기가 서로 맞물리지 않으면
// 조종사가 자기가 만든 파일을 자기 앱에서 못 여는 일이 생긴다. 그리고 우리
// 불러오기(@tmcw/togeojson)가 읽는다는 것은 구글어스도 읽는다는 뜻에 가깝다 —
// 같은 KML 규격을 보기 때문이다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { buildKml } from './kmlWrite.js'

// parseMyMapFile은 전역 DOMParser만 쓴다(번들에 xmldom을 싣지 않으려고).
// node --test에는 없으므로 여기서 심어준다 — my-map 시험들과 같은 방식.
globalThis.DOMParser = DOMParser

const { parseMyMapFile } = await import('../../my-map/lib/parseMyMapFile.js')

const SHAPES = [
  {
    kind: 'polygon', name: '훈련공역 A', description: '2000~5000ft',
    coords: [[126.5, 37.5], [127.0, 37.5], [127.0, 37.0], [126.5, 37.0]],
    color: '#ff0000', opacity: 1, width: 3, fillOpacity: 0.3, floorFt: 2000, ceilFt: 5000,
  },
  {
    kind: 'line', name: 'RKTA 1NM 장주',
    coords: [[126.3, 36.7], [126.4, 36.8], [126.5, 36.7]],
    color: '#2563eb', opacity: 0.7, width: 2,
  },
  {
    kind: 'point', name: 'VFR POINT ALPHA', description: '태안 북방',
    coords: [[126.6, 36.9]], color: '#84cc16', opacity: 1,
  },
]

const parsed = await parseMyMapFile(
  new TextEncoder().encode(buildKml(SHAPES, '내 훈련지도')).buffer,
  '내훈련지도.kml',
)

const features = parsed.list.flatMap((l) => l.features)
const byName = (name) => features.find((f) => f.properties?.name === name)

test('내보낸 KML을 우리 불러오기가 오류 없이 읽는다', () => {
  assert.equal(parsed.stats.polygons, 1)
  assert.equal(parsed.stats.lines, 1)
  assert.equal(parsed.stats.points, 1)
})

test('이름이 그대로 돌아온다', () => {
  for (const s of SHAPES) assert.ok(byName(s.name), `${s.name}을 못 찾음`)
})

test('설명이 그대로 돌아온다', () => {
  assert.equal(byName('훈련공역 A').properties.description, '2000~5000ft')
  assert.equal(byName('VFR POINT ALPHA').properties.description, '태안 북방')
})

test('선 색과 굵기가 그대로 돌아온다', () => {
  const poly = byName('훈련공역 A')
  assert.equal(poly.properties.stroke.toLowerCase(), '#ff0000')
  assert.equal(Number(poly.properties['stroke-width']), 3)
})

test('면 채움 색과 투명도가 그대로 돌아온다', () => {
  const poly = byName('훈련공역 A')
  assert.equal(poly.properties.fill.toLowerCase(), '#ff0000')
  // 0.3 → 알파 4d(77) → 77/255 = 0.302
  assert.ok(Math.abs(poly.properties['fill-opacity'] - 0.3) < 0.01,
    `fill-opacity가 ${poly.properties['fill-opacity']}`)
})

test('선 투명도도 돌아온다', () => {
  const line = byName('RKTA 1NM 장주')
  assert.ok(Math.abs(line.properties['stroke-opacity'] - 0.7) < 0.01,
    `stroke-opacity가 ${line.properties['stroke-opacity']}`)
})

test('기하가 그대로 돌아온다', () => {
  assert.equal(byName('VFR POINT ALPHA').geometry.type, 'Point')
  assert.equal(byName('RKTA 1NM 장주').geometry.type, 'LineString')
  assert.equal(byName('훈련공역 A').geometry.type, 'Polygon')
})

test('면의 천장 고도가 좌표에 실려 돌아온다', () => {
  const ring = byName('훈련공역 A').geometry.coordinates[0]
  // 5000ft = 1524m. 세 번째 값이 고도다.
  for (const c of ring) assert.equal(c[2], 1524)
})

test('링이 정확히 한 번만 닫힌다', () => {
  const ring = byName('훈련공역 A').geometry.coordinates[0]
  assert.equal(ring.length, 5)   // 꼭짓점 4개 + 닫는 점 1개
})

test('좌표가 어긋나지 않는다', () => {
  const pt = byName('VFR POINT ALPHA').geometry.coordinates
  assert.equal(pt[0], 126.6)
  assert.equal(pt[1], 36.9)
})
