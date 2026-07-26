import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNotamGeometry, qCircleFromRawText } from '../src/notam/notam-geometry.js'

const RUNWAY = { // 김포 활주로 — 원본이 불꽃놀이에 잘못 붙여 준 도형
  type: 'Polygon',
  coordinates: [[[126.77809722, 37.57056527], [126.77845833, 37.57085138],
    [126.80732771, 37.54795088], [126.80696672, 37.54766477], [126.77809722, 37.57056527]]],
}
const FIREWORKS = [
  'Q)RKRR/QWMLW/IV/BO/W/000/002/3736N12647E001',
  'A)RKSS B)2607251000 C)2608291200',
  'E)FIREWORKS WILL TAKE PLACE AS FLW :',
  'A CIRCLE RADIUS 100M CENTERED ON 373547N1264720E',
  'F)SFC G)200FT AMSL',
].join('\n')

test('qCircleFromRawText: Q줄 끝의 좌표+반경', () => {
  const q = qCircleFromRawText(FIREWORKS)
  assert.ok(Math.abs(q.lat - 37.6) < 1e-6)
  assert.ok(Math.abs(q.lon - 126.78333) < 1e-4)
  assert.equal(q.radiusNm, 1)
})

test('본문 좌표가 KML 활주로 도형을 이긴다', () => {
  const r = resolveNotamGeometry({ rawText: FIREWORKS, kmlGeometry: RUNWAY })
  assert.equal(r.source, 'text')
  assert.equal(r.geometry.type, 'Polygon')
  // 공항이 아니라 북쪽 4.2km 지점 부근이어야 한다
  const lats = r.geometry.coordinates[0].map((p) => p[1])
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2
  assert.ok(mid > 37.59 && mid < 37.60, `중심 위도 ${mid}`)
})

test('Q줄 원 밖으로 벗어난 본문 해석은 폐기하고 KML로 내려간다', () => {
  // 본문 좌표를 엉뚱한 곳(제주 남쪽)으로 바꾼다 — Q줄은 그대로 김포 부근
  const tampered = FIREWORKS.replace('373547N1264720E', '330000N1260000E')
  const r = resolveNotamGeometry({ rawText: tampered, kmlGeometry: RUNWAY })
  assert.equal(r.source, 'kml')
})

test('KML LineString이 닫힌 고리면 Polygon으로 닫는다', () => {
  const ring = [[127.0, 37.0], [127.1, 37.0], [127.1, 37.1], [127.0, 37.0]]
  const r = resolveNotamGeometry({
    rawText: 'E)RESTRICTED AREA RK R97E ACT',
    kmlGeometry: { type: 'LineString', coordinates: ring },
  })
  assert.equal(r.source, 'kml')
  assert.equal(r.geometry.type, 'Polygon')
  assert.equal(r.geometry.coordinates[0].length, 4)
})

test('본문도 KML도 없으면 unresolved', () => {
  const r = resolveNotamGeometry({ rawText: 'E)TWY E1 CLSD DUE TO WIP', kmlGeometry: null })
  assert.equal(r.source, 'none')
  assert.equal(r.geometry, null)
  assert.ok(r.reason)
})

test('회랑은 LineString + bufferNm으로 나온다', () => {
  const raw = [
    'Q)RKRR/QRTCA/IV/BO/W/000/100/3808N12836E020',
    'E)TEMPO RESTRICTED AREA ACT AS FLW: 1NM EITHER SIDE OF LINE 380836N1283554E-381033N1283630E',
  ].join('\n')
  const r = resolveNotamGeometry({ rawText: raw, kmlGeometry: null })
  assert.equal(r.geometry.type, 'LineString')
  assert.equal(r.bufferNm, 1)
})
