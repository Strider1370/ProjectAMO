import test from 'node:test'
import assert from 'node:assert/strict'
import {
  wallToExtrusion, buildWalls, EXTRUSION_PAINT,
  lineToElevated, buildElevatedLines, ELEVATED_LINE_LAYOUT,
} from './kmlWalls.js'

// 파일의 "벽"은 얇은 판자 여러 장이다. 판자 한 장 = 땅에 붙은 점 둘 + 그 위 점 둘.
const panel = (a, b, base, top) => ({
  type: 'Polygon',
  coordinates: [[[...a, top], [...a, base], [...b, base], [...b, top]]],
})
const curtain = (pts, base, top) => ({
  type: 'Feature',
  properties: { name: '10NM wall' },
  geometry: {
    type: 'GeometryCollection',
    geometries: pts.slice(0, -1).map((p, i) => panel(p, pts[i + 1], base, top)),
  },
})

const RING = [[127, 37], [127.1, 37], [127.1, 37.1], [127, 37.1], [127, 37]]

test('판자 묶음에서 바닥 고리를 되찾는다', () => {
  const f = wallToExtrusion(curtain(RING, 304.8, 1524))
  assert.equal(f.geometry.type, 'Polygon')
  // 판자마다 아래쪽 점 둘이 들어 있고 이웃끼리 겹친다. 겹친 것을 걷어내면 원래 고리.
  assert.deepEqual(f.geometry.coordinates[0], RING)
})

test('고도를 바닥·천장 높이로 옮긴다', () => {
  const f = wallToExtrusion(curtain(RING, 304.8, 1524))
  assert.equal(f.properties.__base, 304.8)
  assert.equal(f.properties.__height, 1524)
})

test('고리가 열려 있으면 닫아 준다', () => {
  const open = [[127, 37], [127.1, 37], [127.1, 37.1]]
  const f = wallToExtrusion(curtain(open, 0, 1000))
  const ring = f.geometry.coordinates[0]
  assert.deepEqual(ring[0], ring[ring.length - 1])
})

test('이름과 색 속성은 그대로 물려준다', () => {
  const src = curtain(RING, 0, 1000)
  src.properties.fill = '#ff0000'
  const f = wallToExtrusion(src)
  assert.equal(f.properties.name, '10NM wall')
  assert.equal(f.properties.fill, '#ff0000')
})

test('평면 도형은 벽이 아니므로 건너뛴다', () => {
  // 고도가 하나뿐이면 세워진 판자가 아니다.
  assert.equal(wallToExtrusion(curtain(RING, 0, 0)), null)
  // 고도값이 아예 없는 보통 폴리곤도 아니다.
  assert.equal(wallToExtrusion({
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [RING] },
  }), null)
})

test('점이 셋도 안 되면 면을 만들 수 없어 건너뛴다', () => {
  assert.equal(wallToExtrusion(curtain([[127, 37], [127.1, 37]], 0, 1000)), null)
})

test('기둥은 우리가 심은 바닥·천장을 읽고, 색은 파일 값을 쓴다', () => {
  assert.deepEqual(EXTRUSION_PAINT['fill-extrusion-base'], ['get', '__base'])
  assert.deepEqual(EXTRUSION_PAINT['fill-extrusion-height'], ['get', '__height'])
  assert.deepEqual(EXTRUSION_PAINT['fill-extrusion-color'], ['coalesce', ['get', 'fill'], ['get', 'stroke'], '#3388ff'])
})

test('buildWalls: 레이어 목록에서 벽만 골라 모은다', () => {
  const list = [
    { id: 'f0', features: [curtain(RING, 304.8, 1524)] },
    { id: 'f1', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [RING] } }] },
  ]
  const walls = buildWalls(list)
  assert.equal(walls.length, 1)
  // 폴더를 켜고 끄는 필터가 벽에도 걸려야 한다.
  assert.equal(walls[0].properties.__folder, 'f0')
})

// --- 고도가 오르내리는 선 (출항절차·장주·최종접근) ---

const climb = (coords) => ({
  type: 'Feature',
  properties: { name: 'RKTA 출항절차', stroke: '#ff0000' },
  geometry: { type: 'LineString', coordinates: coords },
})

test('오르내리는 선은 고도를 속성 배열로 옮긴다', () => {
  const out = lineToElevated(climb([[127, 37, 0], [127.1, 37, 300], [127.2, 37, 900]]))
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].properties.__elev, [0, 300, 900])
  assert.equal(out[0].geometry.type, 'LineString')
  assert.equal(out[0].properties.stroke, '#ff0000')
})

test('높이가 하나뿐인 선은 세울 것이 없다', () => {
  assert.deepEqual(lineToElevated(climb([[127, 37, 500], [127.1, 37, 500]])), [])
  assert.deepEqual(lineToElevated(climb([[127, 37], [127.1, 37]])), [])
})

test('면과 점은 이 변환의 대상이 아니다', () => {
  assert.deepEqual(lineToElevated({
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[127, 37, 0], [127.1, 37, 500], [127, 37.1, 0], [127, 37, 0]]] },
  }), [])
})

test('선 여러 개가 묶여 있으면 하나씩 떼어낸다', () => {
  // line-progress는 선 하나를 0~1로 훑는다. 여러 선을 한 feature에 두면
  // 어느 선의 진행인지 알 수 없으므로 각자 feature가 되어야 한다.
  const multi = {
    type: 'Feature', properties: { name: '장주' },
    geometry: { type: 'GeometryCollection', geometries: [
      { type: 'LineString', coordinates: [[127, 37, 0], [127.1, 37, 300]] },
      { type: 'LineString', coordinates: [[128, 38, 0], [128.1, 38, 600]] },
      { type: 'Point', coordinates: [127, 37, 100] },
    ] },
  }
  const out = lineToElevated(multi)
  assert.equal(out.length, 2)
  assert.deepEqual(out[0].properties.__elev, [0, 300])
  assert.deepEqual(out[1].properties.__elev, [0, 600])
})

test('MultiLineString도 갈래마다 떼어낸다', () => {
  const out = lineToElevated({
    type: 'Feature', properties: {},
    geometry: { type: 'MultiLineString', coordinates: [
      [[127, 37, 0], [127.1, 37, 300]],
      [[128, 38, 100], [128.1, 38, 100]], // 평평한 갈래는 빠진다
    ] },
  })
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].properties.__elev, [0, 300])
})

test('띄우는 높이는 선을 따라 배열을 훑어 읽는다', () => {
  assert.deepEqual(ELEVATED_LINE_LAYOUT['line-z-offset'], [
    'at-interpolated',
    ['*', ['line-progress'], ['-', ['length', ['get', '__elev']], 1]],
    ['get', '__elev'],
  ])
  // 항공 고도는 해수면 기준이다. 지면 기준으로 두면 산 위에서 경로가 솟는다.
  assert.equal(ELEVATED_LINE_LAYOUT['line-elevation-reference'], 'sea')
})

test('buildElevatedLines: 폴더 표시를 붙여 모은다', () => {
  const lines = buildElevatedLines([
    { id: 'f0', features: [climb([[127, 37, 0], [127.1, 37, 300]])] },
    { id: 'f1', features: [climb([[127, 37, 0], [127.1, 37, 0]])] },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].properties.__folder, 'f0')
})
