import test from 'node:test'
import assert from 'node:assert/strict'
import { wallToExtrusion, buildWalls, EXTRUSION_PAINT } from './kmlWalls.js'

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
