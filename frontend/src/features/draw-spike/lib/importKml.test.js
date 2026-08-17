import test from 'node:test'
import assert from 'node:assert/strict'
import { iconIdFromHref, topAltitudeFt, flattenGeometry, layersToFeatures } from './importKml.js'
import { DEFAULT_ICON } from './iconCatalog.js'

test('아이콘 주소로 목록의 아이콘을 찾는다', () => {
  assert.equal(iconIdFromHref('https://maps.google.com/mapfiles/kml/shapes/airports.png'), 'shapes/airports')
})

// 파일은 http로 적고 우리 목록은 https다. 규약을 빼고 견주지 않으면 전부 기본값이 된다.
test('http로 적힌 주소도 찾아낸다', () => {
  assert.equal(iconIdFromHref('http://maps.google.com/mapfiles/kml/shapes/airports.png'), 'shapes/airports')
})

test('모르는 주소는 기본 아이콘으로 떨어진다', () => {
  assert.equal(iconIdFromHref('http://example.com/x.png'), DEFAULT_ICON)
  assert.equal(iconIdFromHref(undefined), DEFAULT_ICON)
})

test('좌표에 실린 고도를 피트로 되돌린다', () => {
  assert.equal(topAltitudeFt({ type: 'Point', coordinates: [126, 37, 1524] }), 5000)
  assert.equal(topAltitudeFt({ type: 'LineString', coordinates: [[126, 37, 0], [127, 38, 304.8]] }), 1000)
})

test('고도가 없으면 0', () => {
  assert.equal(topAltitudeFt({ type: 'Point', coordinates: [126, 37] }), 0)
  assert.equal(topAltitudeFt(null), 0)
})

// mapbox-gl-draw는 낱개 도형만 받는다. 묶음을 그대로 주면 통째로 사라진다.
test('도형 묶음을 낱개로 편다', () => {
  const gc = {
    type: 'GeometryCollection',
    geometries: [
      { type: 'Point', coordinates: [126, 37] },
      { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
    ],
  }
  assert.equal(flattenGeometry(gc).length, 2)
})

test('Multi 계열도 낱개로 편다', () => {
  assert.equal(flattenGeometry({ type: 'MultiPoint', coordinates: [[1, 1], [2, 2]] }).length, 2)
  assert.equal(flattenGeometry({ type: 'MultiLineString', coordinates: [[[1, 1], [2, 2]]] }).length, 1)
  assert.equal(flattenGeometry({ type: 'MultiPolygon', coordinates: [[[[1, 1], [2, 2], [3, 3], [1, 1]]]] }).length, 1)
})

test('묶음 안의 묶음도 끝까지 편다', () => {
  const nested = {
    type: 'GeometryCollection',
    geometries: [{ type: 'MultiPoint', coordinates: [[1, 1], [2, 2], [3, 3]] }],
  }
  assert.equal(flattenGeometry(nested).length, 3)
})

test('낱개 도형은 그대로 둔다', () => {
  const pt = { type: 'Point', coordinates: [126, 37] }
  assert.deepEqual(flattenGeometry(pt), [pt])
})

test('모르는 기하는 버린다', () => {
  assert.deepEqual(flattenGeometry({ type: '이상한것' }), [])
  assert.deepEqual(flattenGeometry(null), [])
})

// --- 통째 변환 ---

const LAYERS = [{
  name: 'VFR POINT',
  features: [{
    type: 'Feature',
    properties: {
      name: 'ALPHA', description: '태안 북방',
      stroke: '#ff0000', 'stroke-width': 3, 'stroke-opacity': 0.7,
      fill: '#00ff00', 'fill-opacity': 0.4,
      icon: 'http://maps.google.com/mapfiles/kml/shapes/airports.png',
    },
    geometry: { type: 'Point', coordinates: [126.6, 36.9, 1524] },
  }],
}]

test('파일 속성이 우리 이름으로 바뀐다', () => {
  const [f] = layersToFeatures(LAYERS)
  assert.equal(f.properties.name, 'ALPHA')
  assert.equal(f.properties.description, '태안 북방')
  assert.equal(f.properties.color, '#ff0000')
  assert.equal(f.properties.width, 3)
  assert.equal(f.properties.opacity, 0.7)
  assert.equal(f.properties.fillOpacity, 0.4)
  assert.equal(f.properties.icon, 'shapes/airports')
  assert.equal(f.properties.ceilFt, 5000)
})

test('폴더 이름이 도형에 붙는다', () => {
  assert.equal(layersToFeatures(LAYERS)[0].properties.folder, 'VFR POINT')
})

test('선 색이 없으면 면 색이라도 쓴다', () => {
  const layers = [{ name: 'A', features: [{ properties: { fill: '#123456' }, geometry: { type: 'Point', coordinates: [1, 1] } }] }]
  assert.equal(layersToFeatures(layers)[0].properties.color, '#123456')
})

test('아무 스타일도 없으면 기본값이 들어간다', () => {
  const layers = [{ name: 'A', features: [{ properties: {}, geometry: { type: 'Point', coordinates: [1, 1] } }] }]
  const p = layersToFeatures(layers)[0].properties
  assert.equal(p.color, '#2563eb')
  assert.equal(p.width, 2)
  assert.equal(p.opacity, 1)
  assert.equal(p.fillOpacity, 0.3)
})

// 파일의 숫자가 문자열이거나 깨져 있어도 화면이 죽으면 안 된다.
test('숫자가 아닌 값은 기본값으로 떨어진다', () => {
  const layers = [{ name: 'A', features: [{ properties: { 'stroke-width': '이상함' }, geometry: { type: 'Point', coordinates: [1, 1] } }] }]
  assert.equal(layersToFeatures(layers)[0].properties.width, 2)
})

test('묶음 도형은 낱개로 나뉘고 이름을 물려받는다', () => {
  const layers = [{
    name: '고속도로',
    features: [{
      properties: { name: '경인고속도로' },
      geometry: { type: 'MultiLineString', coordinates: [[[1, 1], [2, 2]], [[3, 3], [4, 4]]] },
    }],
  }]
  const out = layersToFeatures(layers)
  assert.equal(out.length, 2)
  for (const f of out) assert.equal(f.properties.name, '경인고속도로')
})

test('(폴더 없음)은 그대로 둔다', () => {
  const layers = [{ name: '(폴더 없음)', features: [{ properties: {}, geometry: { type: 'Point', coordinates: [1, 1] } }] }]
  assert.equal(layersToFeatures(layers)[0].properties.folder, '(폴더 없음)')
})

test('빈 입력도 무너지지 않는다', () => {
  assert.deepEqual(layersToFeatures(null), [])
  assert.deepEqual(layersToFeatures([]), [])
  assert.deepEqual(layersToFeatures([{ name: 'A' }]), [])
})
